export type ProjectStatus = "stopped" | "starting" | "running" | "needs-attention";

export type AttentionReason =
  | "port-conflict"
  | "missing-deps"
  | "missing-env"
  | "bad-command"
  | "crashed";

export interface Project {
  id: string;
  name: string;
  framework: string;
  port: number;
  status: ProjectStatus;
  attentionReason?: AttentionReason;
  envVars?: Record<string, string>;
  addedBy?: string;
  startCommand: string;
  workingDir: string;
  pinned?: boolean;
  /** Free-text stack name — projects sharing a group get start-all/stop-all. */
  group?: string;
  /** Restart automatically (with backoff, max 3 tries) when the process crashes. */
  autoRestart?: boolean;
  /** Runtime only — when the current run entered "running". Not meaningful across restarts. */
  startedAt?: number;
}

export interface ActivityEntry {
  id: string;
  projectId: string;
  message: string;
  at: number;
}

export type SortKey = "name" | "status" | "framework";
