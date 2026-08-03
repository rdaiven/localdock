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
import { onTrayToggleProject, updateTrayMenu } from "../lib/trayApi";
import { onMcpAddProject } from "../lib/mcpApi";
import { notify } from "../lib/notify";
import { detectProject } from "../lib/detect";

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
  clearLogs: (id: string) => void;
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
  toggleAutoRestart: (id: string) => void;
  setGroup: (id: string, group: string) => void;
  /** Start every stopped project in the group, one at a time in list order —
   * each waits for the previous one to finish coming up (APIs before frontends). */
  startGroup: (group: string) => Promise<void>;
  stopGroup: (group: string) => Promise<void>;
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

// Ring-buffer cap per project. 2000 mono lines render fine without
// virtualization and cover a typical dev-server session's useful history.
const LOG_BUFFER_LINES = 2000;

function nextFreePort(projects: Project[], from: number, excludeId: string): number {
  const used = new Set(projects.filter((p) => p.id !== excludeId).map((p) => p.port));
  let candidate = from;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

export const useProjectsStore = create<ProjectsState>((set, get) => {
  let loadPromise: Promise<void> | null = null;

  // Crash-restart bookkeeping (runtime only): consecutive failed attempts
  // per project. Cleared when a start actually reaches "running".
  const restartAttempts = new Map<string, number>();
  const MAX_RESTART_ATTEMPTS = 3;

  // Tray-menu sync: pushed whenever names/run-states change, deduped by
  // signature so state churn doesn't spam IPC.
  let lastTraySig = "";
  function syncTrayMenu() {
    const entries = get().projects.map((p) => ({
      id: p.id,
      name: p.name,
      running: p.status === "running" || p.status === "starting",
    }));
    const sig = JSON.stringify(entries);
    if (sig === lastTraySig) return;
    lastTraySig = sig;
    void updateTrayMenu(entries).catch(() => {});
  }

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
    restartAttempts.delete(id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, status: "running", startedAt: Date.now() } : p)),
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

    clearLogs: (id) => {
      set((state) => ({ consoleLogs: { ...state.consoleLogs, [id]: [] } }));
    },

    initProcessEvents: () => {
      if (get().eventsInitialized) return;
      set({ eventsInitialized: true });

      // Keep the tray's per-project entries current with every state change.
      useProjectsStore.subscribe(syncTrayMenu);
      syncTrayMenu();

      void onTrayToggleProject((projectId) => {
        const p = get().projects.find((x) => x.id === projectId);
        if (!p) return;
        if (p.status === "running" || p.status === "starting") void get().stop(projectId);
        else void performStart(projectId);
      });

      // An AI assistant called the MCP server's add_project tool. The Rust
      // side only validated the path exists — detection and the actual
      // projects.json write happen here, since the frontend owns that file.
      void onMcpAddProject(async (payload) => {
        const existing = get().projects.find((p) => normalizePath(p.workingDir) === normalizePath(payload.path));
        if (existing) {
          logActivity(set, existing.id, "An assistant tried to add this project again — it's already here");
          return;
        }
        const detected = await detectProject(payload.path).catch(() => null);
        const project: Project = {
          id: `${(payload.name ?? detected?.name ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project"}-${Date.now().toString(36)}`,
          name: payload.name ?? detected?.name ?? "New project",
          framework: detected?.framework ?? "Custom",
          port: payload.port ?? detected?.port ?? 3000,
          status: "stopped",
          startCommand: payload.command ?? detected?.startCommand ?? "",
          workingDir: payload.path,
          addedBy: "an assistant",
        };
        set((state) => ({ projects: [...state.projects, project] }));
        logActivity(set, project.id, "Added by an assistant via MCP");
        persist();
      });

      void onProcessLog(({ projectId, line }) => {
        set((state) => {
          const existing = state.consoleLogs[projectId] ?? [];
          const next = [...existing, line].slice(-LOG_BUFFER_LINES);
          return { consoleLogs: { ...state.consoleLogs, [projectId]: next } };
        });
      });

      void onProcessExited(({ projectId, code }) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, status: "needs-attention", attentionReason: "crashed", startedAt: undefined }
              : p,
          ),
        }));
        logActivity(set, projectId, `Stopped unexpectedly (exit code ${code ?? "unknown"})`);

        // Auto-restart, if the project opted in: backoff 1s → 3s → 9s, then
        // give up and stay in the crashed state for the user to look at.
        const project = get().projects.find((p) => p.id === projectId);
        if (!project?.autoRestart) {
          if (project) void notify(`${project.name} stopped unexpectedly`);
          return;
        }
        const attempt = restartAttempts.get(projectId) ?? 0;
        if (attempt >= MAX_RESTART_ATTEMPTS) {
          logActivity(set, projectId, `Auto-restart gave up after ${MAX_RESTART_ATTEMPTS} attempts`);
          void notify(`${project.name} keeps crashing — auto-restart gave up`);
          restartAttempts.delete(projectId);
          return;
        }
        restartAttempts.set(projectId, attempt + 1);
        const delayMs = 1000 * 3 ** attempt;
        logActivity(set, projectId, `Auto-restarting in ${delayMs / 1000}s (attempt ${attempt + 1}/${MAX_RESTART_ATTEMPTS})`);
        setTimeout(() => {
          const p = get().projects.find((x) => x.id === projectId);
          // still crashed and still opted in — the user may have intervened meanwhile
          if (p?.attentionReason === "crashed" && p.autoRestart) void performStart(projectId);
        }, delayMs);
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
            // Adopted mid-run — uptime counts from adoption, not the real start.
            return { ...p, status: "running", attentionReason: undefined, startedAt: Date.now() };
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
          p.id === id ? { ...p, status: "stopped", attentionReason: undefined, startedAt: undefined } : p,
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

    toggleAutoRestart: (id) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, autoRestart: !p.autoRestart } : p)),
      }));
      persist();
    },

    setGroup: (id, group) => {
      const trimmed = group.trim();
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, group: trimmed || undefined } : p)),
      }));
      persist();
    },

    startGroup: async (group) => {
      // Sequential on purpose: performStart resolves once the project is
      // running (or failed), so list order doubles as startup order.
      const ids = get()
        .projects.filter((p) => p.group === group && (p.status === "stopped" || p.attentionReason === "crashed"))
        .map((p) => p.id);
      for (const id of ids) {
        await performStart(id);
      }
    },

    stopGroup: async (group) => {
      const ids = get()
        .projects.filter((p) => p.group === group && (p.status === "running" || p.status === "starting"))
        .map((p) => p.id);
      await Promise.all(ids.map((id) => get().stop(id)));
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
