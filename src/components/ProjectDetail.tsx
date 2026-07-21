import { useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { X, FolderOpen, Play, Square, ChevronDown, ChevronUp } from "lucide-react";
import { useProjectsStore } from "../store/projects";
import { STATUS_CONFIG } from "../lib/status";
import { RECOVERY_CONFIG } from "../lib/recovery";
import { FRAMEWORK_OPTIONS } from "../lib/detect";

const EMPTY_LOGS: string[] = [];

const inputStyle = {
  background: "var(--surface-1)",
  border: "0.5px solid var(--border)",
  color: "var(--text-primary)",
} as const;

export function ProjectDetail({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const projects = useProjectsStore((s) => s.projects);
  const activity = useProjectsStore((s) => s.activity);
  const consoleLines = useProjectsStore((s) => s.consoleLogs[projectId] ?? EMPTY_LOGS);
  const start = useProjectsStore((s) => s.start);
  const stop = useProjectsStore((s) => s.stop);
  const updatePort = useProjectsStore((s) => s.updatePort);
  const updateFramework = useProjectsStore((s) => s.updateFramework);
  const updateStartCommand = useProjectsStore((s) => s.updateStartCommand);
  const useFreePort = useProjectsStore((s) => s.useFreePort);
  const installAndRetry = useProjectsStore((s) => s.installAndRetry);
  const retryWithCommand = useProjectsStore((s) => s.retryWithCommand);
  const saveEnvAndRetry = useProjectsStore((s) => s.saveEnvAndRetry);
  const restart = useProjectsStore((s) => s.restart);

  const [logOpen, setLogOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({ DATABASE_URL: "", API_KEY: "" });

  const projectActivity = useMemo(
    () => activity.filter((a) => a.projectId === projectId),
    [activity, projectId],
  );

  if (!project) return null;

  const status = STATUS_CONFIG[project.status];
  const isDanger = project.status === "needs-attention";
  const isRunning = project.status === "running";
  const isStarting = project.status === "starting";
  const recovery = project.attentionReason ? RECOVERY_CONFIG[project.attentionReason] : null;
  const portConflict = projects.some((p) => p.id !== project.id && p.port === project.port);

  function runFix() {
    if (!project?.attentionReason) return;
    switch (project.attentionReason) {
      case "port-conflict":
        useFreePort(project.id);
        break;
      case "missing-deps":
        installAndRetry(project.id);
        break;
      case "crashed":
        restart(project.id);
        break;
      case "bad-command":
        retryWithCommand(project.id, project.startCommand);
        break;
      case "missing-env":
        saveEnvAndRetry(project.id, envDraft);
        break;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-sm flex-col p-5"
        style={{ background: "var(--surface-2)", borderLeft: "0.5px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: status.dot }} />
            <span className="text-base font-medium">{project.name}</span>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-md p-1" style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 pl-4 text-xs" style={{ color: isDanger ? "var(--text-danger)" : "var(--text-secondary)" }}>
          {project.framework} · {isDanger ? recovery?.subtitle : status.label}
        </p>

        {isDanger && recovery && (
          <div className="mb-4 rounded-lg p-3" style={{ background: "var(--bg-danger)" }}>
            <p className="mb-2.5 text-sm" style={{ color: "var(--text-danger)" }}>
              {recovery.message}
            </p>

            {project.attentionReason === "missing-env" ? (
              <div className="flex flex-col gap-2">
                <input
                  value={envDraft.DATABASE_URL}
                  onChange={(e) => setEnvDraft((d) => ({ ...d, DATABASE_URL: e.target.value }))}
                  placeholder="DATABASE_URL"
                  className="h-8 rounded-md px-2 text-xs"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
                <input
                  value={envDraft.API_KEY}
                  onChange={(e) => setEnvDraft((d) => ({ ...d, API_KEY: e.target.value }))}
                  placeholder="API_KEY"
                  className="h-8 rounded-md px-2 text-xs"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
                <button
                  onClick={runFix}
                  className="mt-1 rounded-md py-1.5 text-xs font-medium"
                  style={{ background: "var(--fill-danger)", color: "var(--on-danger)", border: "none" }}
                >
                  {recovery.fixLabel}
                </button>
              </div>
            ) : (
              <button
                onClick={runFix}
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ background: "var(--fill-danger)", color: "var(--on-danger)", border: "none" }}
              >
                {recovery.fixLabel}
              </button>
            )}
          </div>
        )}

        {!isDanger && (
          <button
            onClick={() => (isRunning ? stop(project.id) : isStarting ? undefined : start(project.id))}
            disabled={isStarting}
            className="mb-4 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {isRunning ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {isRunning ? "Stop" : isStarting ? "Starting…" : "Start"}
          </button>
        )}

        <div className="flex flex-col gap-3 border-t pt-3 text-xs" style={{ borderColor: "var(--border)" }}>
          <Row label="Port">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={project.port}
                onChange={(e) => updatePort(project.id, Number(e.target.value))}
                className="h-8 w-24 rounded-md px-2 text-xs"
                style={inputStyle}
              />
              {portConflict ? (
                <span style={{ color: "var(--text-danger)" }}>In use by another project</span>
              ) : (
                <span style={{ color: "var(--text-success)" }}>Available</span>
              )}
            </div>
          </Row>

          <Row label="Framework">
            <select
              value={project.framework}
              onChange={(e) => updateFramework(project.id, e.target.value)}
              className="h-8 w-full rounded-md px-2 text-xs"
              style={inputStyle}
            >
              {FRAMEWORK_OPTIONS.includes(project.framework) ? null : <option value={project.framework}>{project.framework}</option>}
              {FRAMEWORK_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Working directory">
            <div className="flex items-center gap-2">
              <span className="truncate" style={{ color: "var(--text-primary)" }} title={project.workingDir}>
                {project.workingDir}
              </span>
              <button
                aria-label="Open folder"
                onClick={() => openPath(project.workingDir).catch(() => {})}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-0"
                style={{ background: "transparent", border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
              >
                <FolderOpen size={13} aria-hidden="true" />
              </button>
            </div>
          </Row>

          <Row label="Start command">
            <input
              value={project.startCommand}
              onChange={(e) => updateStartCommand(project.id, e.target.value)}
              className="h-8 w-full rounded-md px-2 text-xs"
              style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
            />
          </Row>
        </div>

        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md p-0 text-xs"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}
          >
            <span>Activity · {projectActivity.length} events</span>
            {logOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>

          {logOpen && (
            <div className="mt-2 flex flex-col gap-1.5">
              {projectActivity.length === 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No activity yet.
                </p>
              )}
              {projectActivity.map((entry) => (
                <div key={entry.id} className="flex items-baseline justify-between text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>{entry.message}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setConsoleOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md p-0 text-xs"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}
          >
            <span>Console output · {consoleLines.length} lines</span>
            {consoleOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>

          {consoleOpen && (
            <div
              className="mt-2 max-h-40 overflow-y-auto rounded-md p-2"
              style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
            >
              {consoleLines.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No output yet.
                </p>
              ) : (
                consoleLines.map((line, i) => (
                  <p
                    key={i}
                    className="whitespace-pre-wrap text-xs"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}
