import type { ProjectStatus } from "../types";

export const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  running: { label: "Running", bg: "var(--bg-success)", text: "var(--text-success)", dot: "var(--fill-success)" },
  stopped: { label: "Stopped", bg: "var(--surface-1)", text: "var(--text-secondary)", dot: "var(--text-muted)" },
  starting: { label: "Starting…", bg: "var(--bg-warning)", text: "var(--text-warning)", dot: "var(--fill-warning)" },
  "needs-attention": { label: "Needs attention", bg: "var(--surface-2)", text: "var(--text-danger)", dot: "var(--fill-danger)" },
};
