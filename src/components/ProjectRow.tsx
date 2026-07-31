import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Folder,
  FolderOpen,
  ExternalLink,
  Play,
  Square,
  X,
  MoreHorizontal,
  Pencil,
  Plug,
  Star,
  Terminal,
  Trash2,
  Sparkles,
  Code2,
} from "lucide-react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import type { Project } from "../types";
import { STATUS_CONFIG } from "../lib/status";
import { RECOVERY_CONFIG } from "../lib/recovery";
import { useProjectsStore } from "../store/projects";
import { useSettingsStore } from "../store/settings";
import { openInIde, openTerminal } from "../lib/settingsApi";

export function ProjectRow({
  project,
  selected,
  onOpenDetail,
}: {
  project: Project;
  selected: boolean;
  onOpenDetail: () => void;
}) {
  const start = useProjectsStore((s) => s.start);
  const stop = useProjectsStore((s) => s.stop);
  const cancelStart = useProjectsStore((s) => s.cancelStart);
  const select = useProjectsStore((s) => s.select);
  const togglePin = useProjectsStore((s) => s.togglePin);
  const removeProject = useProjectsStore((s) => s.removeProject);
  const defaultIdeId = useSettingsStore((s) => s.defaultIdeId);
  const detectedIdes = useSettingsStore((s) => s.detectedIdes);
  const defaultIde = detectedIdes.find((ide) => ide.id === defaultIdeId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const status = STATUS_CONFIG[project.status];
  const isDanger = project.status === "needs-attention";
  const isRunning = project.status === "running";
  const isStarting = project.status === "starting";

  const subtitle = isDanger
    ? project.attentionReason && RECOVERY_CONFIG[project.attentionReason].subtitle
    : isStarting
      ? "Starting up"
      : isRunning
        ? `localhost:${project.port}`
        : `port ${project.port}`;

  const rowClass = [
    "row-card",
    selected && !isDanger ? "row-card--selected" : "",
    isDanger ? "row-card--danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      onClick={() => {
        select(project.id);
        onOpenDetail();
      }}
      className={rowClass}
      style={{ "--berth": status.dot } as React.CSSProperties}
    >
      <div
        className="tile"
        style={
          isDanger
            ? { background: "var(--surface-2)", color: "var(--text-danger)" }
            : isRunning
              ? { background: "var(--bg-accent)", color: "var(--text-accent)" }
              : undefined
        }
      >
        <Folder size={17} aria-hidden="true" />
      </div>

      <div className="minw-0 grow">
        <p className="truncate t-body c-primary" style={{ fontWeight: 500 }}>
          {project.name}
        </p>
        <p className={`truncate t-micro ${isDanger ? "c-danger" : "c-secondary"}`}>
          <span className="c-muted">{project.framework}</span>
          {" · "}
          <span className="t-mono" style={{ fontSize: 11 }}>
            {subtitle}
          </span>
          {project.addedBy && (
            <>
              {" · "}
              <Sparkles size={10} style={{ display: "inline", transform: "translateY(-1px)" }} aria-hidden="true" />
              {` ${project.addedBy}`}
            </>
          )}
        </p>
      </div>

      <span className="status-chip" style={{ background: status.bg, color: status.text }} title={status.label}>
        <span
          className={`status-dot${isRunning ? " status-dot--live" : ""}`}
          style={{ background: status.dot }}
        />
        <span className="hide-narrow">{status.label}</span>
      </span>

      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {isDanger ? (
          <motion.button
            onClick={() => {
              select(project.id);
              onOpenDetail();
            }}
            whileTap={{ scale: 0.95 }}
            className="btn btn--sm btn--danger-outline"
          >
            Fix it
          </motion.button>
        ) : isStarting ? (
          <IconButton label="Cancel" onClick={() => cancelStart(project.id)}>
            <X size={15} aria-hidden="true" />
          </IconButton>
        ) : isRunning ? (
          <IconButton label="Stop" onClick={() => stop(project.id)}>
            <Square size={14} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton label="Start" onClick={() => start(project.id)}>
            <Play size={15} aria-hidden="true" />
          </IconButton>
        )}

        {!isDanger && (
          <IconButton
            label="Open in browser"
            disabled={!isRunning}
            onClick={() => openUrl(`http://localhost:${project.port}`).catch(() => {})}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </IconButton>
        )}

        {!isDanger && (
          <IconButton
            label="Open folder"
            className="hide-narrow"
            onClick={() => openPath(project.workingDir).catch(() => {})}
          >
            <FolderOpen size={14} aria-hidden="true" />
          </IconButton>
        )}

        {!isDanger && defaultIde && (
          <IconButton
            label={`Open in ${defaultIde.name}`}
            className="hide-narrow"
            onClick={() => openInIde(defaultIde.path, project.workingDir).catch(() => {})}
          >
            <Code2 size={14} aria-hidden="true" />
          </IconButton>
        )}

        <div className="relative" ref={menuRef}>
          <IconButton label="More options" onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </IconButton>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="menu"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
              >
                <MenuItem
                  icon={<Pencil size={14} aria-hidden="true" />}
                  onClick={() => {
                    setMenuOpen(false);
                    select(project.id);
                    onOpenDetail();
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  icon={<Plug size={14} aria-hidden="true" />}
                  onClick={() => {
                    setMenuOpen(false);
                    select(project.id);
                    onOpenDetail();
                  }}
                >
                  Change port
                </MenuItem>
                <MenuItem
                  icon={<Star size={14} aria-hidden="true" />}
                  onClick={() => {
                    setMenuOpen(false);
                    togglePin(project.id);
                  }}
                >
                  {project.pinned ? "Unpin" : "Pin to top"}
                </MenuItem>
                <MenuItem
                  icon={<Terminal size={14} aria-hidden="true" />}
                  onClick={() => {
                    setMenuOpen(false);
                    openTerminal(project.workingDir).catch(() => {});
                  }}
                >
                  Open terminal here
                </MenuItem>
                <div className="menu-sep" />
                <MenuItem
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm(`Remove "${project.name}" from LocalDock? This won't delete any files.`)) {
                      void removeProject(project.id);
                    }
                  }}
                >
                  Remove project
                </MenuItem>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      className={`icon-btn${className ? ` ${className}` : ""}`}
    >
      {children}
    </motion.button>
  );
}

function MenuItem({
  children,
  icon,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={`menu-item${danger ? " menu-item--danger" : ""}`}>
      {icon}
      {children}
    </button>
  );
}
