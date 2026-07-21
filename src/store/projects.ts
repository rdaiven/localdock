import { create } from "zustand";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ActivityEntry, Project, SortKey } from "../types";
import {
  checkPort,
  isProcessRunning,
  onProcessExited,
  onProcessLog,
  startProcess,
  stopProcess,
} from "../lib/processApi";

const initialProjects: Project[] = [
  {
    id: "portfolio",
    name: "My portfolio site",
    framework: "Next.js",
    port: 3000,
    status: "running",
    addedBy: "Claude Code",
    startCommand: "npm run dev",
    workingDir: "D:\\Projects\\portfolio",
  },
  {
    id: "client-api",
    name: "Client API",
    framework: "Laravel",
    port: 8000,
    status: "stopped",
    startCommand: "php artisan serve",
    workingDir: "D:\\Projects\\client-api",
  },
  {
    id: "recipe-app",
    name: "Recipe app",
    framework: "React",
    port: 5175,
    status: "stopped",
    startCommand: "node demo-recipe-server.js",
    workingDir: "C:\\Users\\devri\\Desktop\\LocalDock",
  },
  {
    id: "old-blog",
    name: "Old blog",
    framework: "WordPress",
    port: 8000,
    status: "needs-attention",
    attentionReason: "port-conflict",
    startCommand: "php -S localhost:8000",
    workingDir: "D:\\Projects\\old-blog",
  },
  {
    id: "weather-widget",
    name: "Weather widget",
    framework: "Python",
    port: 8001,
    status: "needs-attention",
    attentionReason: "missing-deps",
    startCommand: "python app.py",
    workingDir: "D:\\Projects\\weather-widget",
  },
  {
    id: "internal-dashboard",
    name: "Internal dashboard",
    framework: "Node",
    port: 4000,
    status: "needs-attention",
    attentionReason: "missing-env",
    startCommand: "npm run dev",
    workingDir: "D:\\Projects\\internal-dashboard",
  },
];

interface ProjectsState {
  projects: Project[];
  activity: ActivityEntry[];
  consoleLogs: Record<string, string[]>;
  selectedId: string | null;
  search: string;
  sortBy: SortKey;
  eventsInitialized: boolean;
  initProcessEvents: () => void;
  reconcileWithBackend: () => Promise<void>;
  select: (id: string) => void;
  setSearch: (query: string) => void;
  setSortBy: (key: SortKey) => void;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
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
  async function performStart(id: string) {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

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
      const owner = await checkPort(current.port).catch(() => null);
      if (owner) {
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
    projects: initialProjects,
    activity: [],
    consoleLogs: {},
    selectedId: initialProjects[0]?.id ?? null,
    search: "",
    sortBy: "name",
    eventsInitialized: false,

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
        logActivity(set, id, `Couldn't stop cleanly: ${String(err)}`);
      }
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: "stopped", attentionReason: undefined } : p,
        ),
      }));
      logActivity(set, id, "Stopped");
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
    },

    updatePort: (id, port) => {
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, port } : p)) }));
    },

    updateFramework: (id, framework) => {
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, framework } : p)) }));
    },

    updateStartCommand: (id, command) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, startCommand: command } : p)),
      }));
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
      await performStart(id);
    },

    saveEnvAndRetry: async (id, env) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, envVars: env } : p)),
      }));
      logActivity(set, id, `Settings saved (${Object.keys(env).length} values)`);
      await performStart(id);
    },

    restart: async (id) => {
      await get().stop(id);
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
    if (state.sortBy === "name") return a.name.localeCompare(b.name);
    if (state.sortBy === "framework") return a.framework.localeCompare(b.framework);
    return statusOrder[a.status] - statusOrder[b.status];
  });
}
