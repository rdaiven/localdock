import { create } from "zustand";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ActivityEntry, Project, SortKey } from "../types";
import {
  checkPort,
  isProcessRunning,
  onProcessExited,
  onProcessLog,
  portBelongsToProject,
  startProcess,
  stopProcess,
} from "../lib/processApi";
import { loadProjects as loadPersistedProjects, saveProjects } from "../lib/projectsStorage";
import { scanRunningDevServers, type DiscoveredServer } from "../lib/discoverApi";

function normalizePath(p: string): string {
  return p.trim().toLowerCase().replace(/\\+$/, "");
}

interface ProjectsState {
  projects: Project[];
  activity: ActivityEntry[];
  consoleLogs: Record<string, string[]>;
  selectedId: string | null;
  search: string;
  sortBy: SortKey;
  eventsInitialized: boolean;
  projectsLoaded: boolean;
  discovered: DiscoveredServer[];
  discoveryScanning: boolean;
  loadProjects: () => Promise<void>;
  initProcessEvents: () => void;
  reconcileWithBackend: () => Promise<void>;
  scanForServers: () => Promise<void>;
  dismissDiscovered: (pid: number) => void;
  select: (id: string) => void;
  setSearch: (query: string) => void;
  setSortBy: (key: SortKey) => void;
  start: (id: string) => Promise<void>;
  /** Resolves true only if the process was actually stopped (or wasn't running). */
  stop: (id: string) => Promise<boolean>;
  cancelStart: (id: string) => Promise<void>;
  addProject: (input: {
    name: string;
    framework: string;
    port: number;
    startCommand: string;
    workingDir: string;
  }) => void;
  updatePort: (id: string, port: number) => void;
  updateFramework: (id: string, framework: string) => void;
  updateStartCommand: (id: string, command: string) => void;
  renameProject: (id: string, name: string) => void;
  togglePin: (id: string) => void;
  removeProject: (id: string) => Promise<void>;
  useFreePort: (id: string) => void;
  installAndRetry: (id: string) => Promise<void>;
  retryWithCommand: (id: string, command: string) => Promise<void>;
  saveEnvAndRetry: (id: string, env: Record<string, string>) => Promise<void>;
  restart: (id: string) => Promise<void>;
}

function logActivity(
  set: (fn: (state: ProjectsState) => Partial<ProjectsState>) => void,
  projectId: string,
  message: string,
) {
  const entry: ActivityEntry = {
    id: `a-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6)}`,
    projectId,
    message,
    at: Date.now(),
  };
  set((state) => ({ activity: [entry, ...state.activity] }));
}

function nextFreePort(projects: Project[], from: number, excludeId: string): number {
  const used = new Set(projects.filter((p) => p.id !== excludeId).map((p) => p.port));
  let candidate = from;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

export const useProjectsStore = create<ProjectsState>((set, get) => {
  let loadPromise: Promise<void> | null = null;

  // Config-shape changes (added/edited projects) are persisted to disk so
  // they survive an app restart — runtime state like status/activity/logs
  // stays in memory only, since nothing is actually running on a fresh launch.
  // saveProjects serializes/coalesces overlapping writes (jsonStorage.ts),
  // so fire-and-forget at keystroke frequency is safe.
  function persist() {
    void saveProjects(get().projects).catch(() => {});
  }

  async function performStart(id: string) {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    // Check for a real port conflict before even attempting to spawn — we
    // haven't started our own process yet, so any existing listener here is
    // by definition someone else's, and this is the one point in the flow
    // where "port already in use" can be reported precisely instead of
    // falling through to a generic spawn/crash error later.
    const preOwner = await checkPort(project.port).catch(() => null);
    if (preOwner) {
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: "needs-attention", attentionReason: "port-conflict" } : p,
        ),
      }));
      logActivity(set, id, `Port ${project.port} is already in use by "${preOwner.name}"`);
      return;
    }

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, status: "starting", attentionReason: undefined } : p,
      ),
      consoleLogs: { ...state.consoleLogs, [id]: [] },
    }));

    try {
      const pid = await startProcess(id, project.startCommand, project.workingDir, project.envVars ?? {});
      logActivity(set, id, `Starting… (pid ${pid})`);
    } catch (err) {
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: "needs-attention", attentionReason: "bad-command" } : p,
        ),
      }));
      logActivity(set, id, String(err));
      return;
    }

    const deadline = Date.now() + 3000;
    let bound = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      const current = get().projects.find((p) => p.id === id);
      if (!current || current.status !== "starting") return; // superseded by a crash event or manual stop
      // Job-scoped check: is *our* spawned process (or something it forked)
      // the thing bound to this port, not just any process anywhere.
      const owned = await portBelongsToProject(id, current.port).catch(() => false);
      if (owned) {
        bound = true;
        break;
      }
    }

    const current = get().projects.find((p) => p.id === id);
    if (!current || current.status !== "starting") return;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, status: "running" } : p)),
    }));
    logActivity(set, id, bound ? "Started successfully" : "Started (couldn't confirm the port yet)");
    if (bound) {
      logActivity(set, id, "Opened in browser");
      openUrl(`http://localhost:${current.port}`).catch(() => {});
    }
  }

  return {
    projects: [],
    activity: [],
    consoleLogs: {},
    selectedId: null,
    search: "",
    sortBy: "name",
    eventsInitialized: false,
    projectsLoaded: false,
    discovered: [],
    discoveryScanning: false,

    loadProjects: () => {
      // Idempotent AND awaitable-while-in-flight: a second caller during the
      // initial load gets the same promise instead of resolving early with
      // the list still empty (scanForServers depends on this).
      if (!loadPromise) {
        loadPromise = (async () => {
          const projects = await loadPersistedProjects();
          set({ projectsLoaded: true, projects, selectedId: projects[0]?.id ?? null });
        })();
      }
      return loadPromise;
    },

    // Best-effort: find dev servers running outside LocalDock's own control
    // (started by hand, or by another tool's own shell instead of through
    // our MCP tools) by reading their real working directory off their PEB.
    // Matches against known projects just get an activity note (we can't
    // safely adopt Start/Stop control over a process we didn't spawn);
    // unmatched ones are surfaced as "want to add this?" suggestions.
    scanForServers: async () => {
      set({ discoveryScanning: true });
      try {
        // Matching below runs against get().projects — make sure the
        // persisted list has actually loaded first, or every known
        // project's own server would look like a brand-new discovery.
        await get().loadProjects();
        const found = await scanRunningDevServers();
        const projects = get().projects;
        const unmatched: DiscoveredServer[] = [];
        for (const server of found) {
          if (!server.cwd) continue;
          const match = projects.find((p) => normalizePath(p.workingDir) === normalizePath(server.cwd!));
          if (match) {
            if (match.status !== "running" && match.status !== "starting") {
              logActivity(set, match.id, `Detected already running externally on port ${server.port} (pid ${server.pid})`);
            }
          } else {
            unmatched.push(server);
          }
        }
        set({ discovered: unmatched });
      } finally {
        set({ discoveryScanning: false });
      }
    },

    dismissDiscovered: (pid) => {
      set((state) => ({ discovered: state.discovered.filter((d) => d.pid !== pid) }));
    },

    initProcessEvents: () => {
      if (get().eventsInitialized) return;
      set({ eventsInitialized: true });

      void onProcessLog(({ projectId, line }) => {
        set((state) => {
          const existing = state.consoleLogs[projectId] ?? [];
          const next = [...existing, line].slice(-300);
          return { consoleLogs: { ...state.consoleLogs, [projectId]: next } };
        });
      });

      void onProcessExited(({ projectId, code }) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, status: "needs-attention", attentionReason: "crashed" } : p,
          ),
        }));
        logActivity(set, projectId, `Stopped unexpectedly (exit code ${code ?? "unknown"})`);
      });
    },

    reconcileWithBackend: async () => {
      const projects = get().projects;
      const results = await Promise.all(
        projects.map((p) => isProcessRunning(p.id).catch(() => false).then((running) => ({ id: p.id, running }))),
      );
      set((state) => ({
        projects: state.projects.map((p) => {
          const result = results.find((r) => r.id === p.id);
          if (!result) return p;
          if (result.running && p.status !== "running" && p.status !== "starting") {
            return { ...p, status: "running", attentionReason: undefined };
          }
          if (!result.running && p.status === "running") {
            return { ...p, status: "stopped" };
          }
          return p;
        }),
      }));
    },

    select: (id) => set({ selectedId: id }),
    setSearch: (query) => set({ search: query }),
    setSortBy: (key) => set({ sortBy: key }),

    start: (id) => performStart(id),

    stop: async (id) => {
      try {
        await stopProcess(id);
      } catch (err) {
        // Kill failed — leave status untouched (still accurately "running"),
        // don't claim success. The backend also leaves the process tracked
        // on this path, so retrying Stop can still find and kill it.
        logActivity(set, id, `Couldn't stop: ${String(err)}`);
        return false;
      }
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: "stopped", attentionReason: undefined } : p,
        ),
      }));
      logActivity(set, id, "Stopped");
      return true;
    },

    cancelStart: async (id) => {
      await get().stop(id);
      logActivity(set, id, "Cancelled");
    },

    addProject: (input) => {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const id = `${slug || "project"}-${Date.now().toString(36)}`;
      const project: Project = {
        id,
        name: input.name,
        framework: input.framework,
        port: input.port,
        status: "stopped",
        startCommand: input.startCommand,
        workingDir: input.workingDir,
      };
      set((state) => ({ projects: [...state.projects, project], selectedId: id }));
      logActivity(set, id, "Project added");
      persist();
    },

    updatePort: (id, port) => {
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, port } : p)) }));
      persist();
    },

    updateFramework: (id, framework) => {
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, framework } : p)) }));
      persist();
    },

    updateStartCommand: (id, command) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, startCommand: command } : p)),
      }));
      persist();
    },

    renameProject: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) }));
      persist();
    },

    togglePin: (id) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)),
      }));
      persist();
    },

    removeProject: async (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      if (project.status === "running" || project.status === "starting") {
        // If the kill genuinely failed, removing the project would orphan a
        // running process with no UI left to retry Stop on — keep the row.
        const stopped = await get().stop(id);
        if (!stopped) {
          logActivity(set, id, "Not removed — the running process couldn't be stopped. Try Stop again first.");
          return;
        }
      }
      set((state) => {
        const consoleLogs = { ...state.consoleLogs };
        delete consoleLogs[id];
        return {
          projects: state.projects.filter((p) => p.id !== id),
          consoleLogs,
          selectedId: state.selectedId === id ? null : state.selectedId,
        };
      });
      persist();
    },

    useFreePort: (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      const freePort = nextFreePort(get().projects, project.port + 1, id);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, port: freePort, status: "stopped", attentionReason: undefined } : p,
        ),
      }));
      logActivity(set, id, `Port conflict resolved — moved to ${freePort}`);
      persist();
    },

    installAndRetry: async (id) => {
      logActivity(set, id, "Installing dependencies…");
      await performStart(id);
    },

    retryWithCommand: async (id, command) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, startCommand: command } : p)),
      }));
      logActivity(set, id, `Start command updated to "${command}"`);
      persist();
      await performStart(id);
    },

    saveEnvAndRetry: async (id, env) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, envVars: env } : p)),
      }));
      logActivity(set, id, `Settings saved (${Object.keys(env).length} values)`);
      persist();
      await performStart(id);
    },

    restart: async (id) => {
      // A failed stop leaves the old process holding the port — starting on
      // top of it would just produce a confusing port-conflict cascade.
      const project = get().projects.find((p) => p.id === id);
      if (project && (project.status === "running" || project.status === "starting")) {
        if (!(await get().stop(id))) return;
      }
      await performStart(id);
    },
  };
});

export function visibleProjects(state: ProjectsState): Project[] {
  const query = state.search.trim().toLowerCase();
  const filtered = query
    ? state.projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.framework.toLowerCase().includes(query) ||
          p.status.toLowerCase().includes(query),
      )
    : state.projects;

  const statusOrder: Record<Project["status"], number> = {
    "needs-attention": 0,
    starting: 1,
    running: 2,
    stopped: 3,
  };

  return [...filtered].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (state.sortBy === "name") return a.name.localeCompare(b.name);
    if (state.sortBy === "framework") return a.framework.localeCompare(b.framework);
    return statusOrder[a.status] - statusOrder[b.status];
  });
}
