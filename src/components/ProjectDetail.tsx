import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { openPath } from "@tauri-apps/plugin-opener";
import { X, FolderOpen, Play, Square, ChevronDown, ChevronUp } from "lucide-react";
import { useProjectsStore } from "../store/projects";
import { STATUS_CONFIG } from "../lib/status";
import { RECOVERY_CONFIG } from "../lib/recovery";
import { FRAMEWORK_OPTIONS } from "../lib/detect";

const EMPTY_LOGS: string[] = [];

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
  const renameProject = useProjectsStore((s) => s.renameProject);
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
    <motion.div
      className="overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
          <div className="flex items-center gap-2 minw-0">
            <span
              className={`status-dot${isRunning ? " status-dot--live" : ""}`}
              style={{ background: status.dot }}
            />
            <span className="t-title truncate">{project.name}</span>
          </div>
          <button aria-label="Close" onClick={onClose} className="icon-btn icon-btn--bare shrink-0">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className={`t-micro ${isDanger ? "c-danger" : "c-secondary"}`} style={{ paddingLeft: 15, marginBottom: 16 }}>
          {project.framework} · {isDanger ? recovery?.subtitle : status.label}
        </p>

        {isDanger && recovery && (
          <div className="notice notice--danger flex-col gap-2" style={{ marginBottom: 16 }}>
            <p className="t-small c-danger">{recovery.message}</p>

            {project.attentionReason === "missing-env" ? (
              <div className="flex-col gap-2">
                <input
                  value={envDraft.DATABASE_URL}
                  onChange={(e) => setEnvDraft((d) => ({ ...d, DATABASE_URL: e.target.value }))}
                  placeholder="DATABASE_URL"
                  className="field field--sm field--mono"
                />
                <input
                  value={envDraft.API_KEY}
                  onChange={(e) => setEnvDraft((d) => ({ ...d, API_KEY: e.target.value }))}
                  placeholder="API_KEY"
                  className="field field--sm field--mono"
                />
                <button onClick={runFix} className="btn btn--sm btn--danger btn--block">
                  {recovery.fixLabel}
                </button>
              </div>
            ) : (
              <button onClick={runFix} className="btn btn--sm btn--danger" style={{ alignSelf: "flex-start" }}>
                {recovery.fixLabel}
              </button>
            )}
          </div>
        )}

        {!isDanger && (
          <motion.button
            onClick={() => (isRunning ? stop(project.id) : isStarting ? undefined : start(project.id))}
            disabled={isStarting}
            whileTap={{ scale: 0.97 }}
            className="btn btn--primary btn--block"
            style={{ marginBottom: 16 }}
          >
            {isRunning ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {isRunning ? "Stop" : isStarting ? "Starting…" : "Start"}
          </motion.button>
        )}

        <p className="t-eyebrow divider" style={{ marginBottom: 10 }}>
          Configuration
        </p>
        <div className="flex-col gap-3">
          <Row label="Name">
            <input
              value={project.name}
              onChange={(e) => renameProject(project.id, e.target.value)}
              className="field field--sm w-full"
            />
          </Row>

          <Row label="Port">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={project.port}
                onChange={(e) => updatePort(project.id, Number(e.target.value))}
                className="field field--sm field--mono"
                style={{ width: 96 }}
              />
              {portConflict ? (
                <span className="t-micro c-danger">In use by another project</span>
              ) : (
                <span className="t-micro c-success">Available</span>
              )}
            </div>
          </Row>

          <Row label="Framework">
            <select
              value={project.framework}
              onChange={(e) => updateFramework(project.id, e.target.value)}
              className="field field--sm w-full"
            >
              {FRAMEWORK_OPTIONS.includes(project.framework) ? null : (
                <option value={project.framework}>{project.framework}</option>
              )}
              {FRAMEWORK_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Working directory">
            <div className="flex items-center gap-2">
              <span className="truncate t-mono c-secondary" title={project.workingDir}>
                {project.workingDir}
              </span>
              <button
                aria-label="Open folder"
                onClick={() => openPath(project.workingDir).catch(() => {})}
                className="icon-btn icon-btn--sm shrink-0"
              >
                <FolderOpen size={12} aria-hidden="true" />
              </button>
            </div>
          </Row>

          <Row label="Start command">
            <input
              value={project.startCommand}
              onChange={(e) => updateStartCommand(project.id, e.target.value)}
              className="field field--sm field--mono w-full"
            />
          </Row>
        </div>

        <div className="divider" style={{ marginTop: 18 }}>
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="w-full flex items-center justify-between t-eyebrow"
            style={{ padding: 0 }}
          >
            <span>Activity · {projectActivity.length}</span>
            {logOpen ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>

          {logOpen && (
            <div className="flex-col gap-1" style={{ marginTop: 10 }}>
              {projectActivity.length === 0 && <p className="t-micro c-muted">No activity yet.</p>}
              {projectActivity.map((entry) => (
                <div key={entry.id} className="flex items-baseline justify-between gap-3 t-micro">
                  <span className="c-secondary">{entry.message}</span>
                  <span className="t-mono c-muted shrink-0" style={{ fontSize: 10.5 }}>
                    {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="divider">
          <button
            onClick={() => setConsoleOpen((v) => !v)}
            className="w-full flex items-center justify-between t-eyebrow"
            style={{ padding: 0 }}
          >
            <span>Console · {consoleLines.length}</span>
            {consoleOpen ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>

          {consoleOpen && (
            <div className="console">
              {consoleLines.length === 0 ? (
                <p className="t-micro c-muted">No output yet.</p>
              ) : (
                consoleLines.map((line, i) => (
                  <p key={i} className="pre-wrap t-mono c-secondary" style={{ fontSize: 11 }}>
                    {line}
                  </p>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="t-micro c-secondary" style={{ marginBottom: 5 }}>
        {label}
      </p>
      {children}
    </div>
  );
}
