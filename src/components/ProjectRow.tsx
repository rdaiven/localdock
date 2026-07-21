import { useEffect, useRef, useState } from "react";
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
import { openInIde } from "../lib/settingsApi";

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
        ? `${project.framework} · localhost:${project.port}`
        : `${project.framework} · port ${project.port}`;

  return (
    <div
      onClick={() => {
        select(project.id);
        onOpenDetail();
      }}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5"
      style={{
        border: `0.5px solid ${isDanger ? "var(--border-danger)" : selected ? "var(--border-accent)" : "var(--border)"}`,
        background: isDanger ? "var(--bg-danger)" : "var(--surface-2)",
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: isDanger ? "var(--surface-2)" : isRunning ? "var(--bg-accent)" : "var(--surface-1)",
          color: isDanger ? "var(--text-danger)" : isRunning ? "var(--text-accent)" : "var(--text-secondary)",
        }}
      >
        <Folder size={18} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {project.name}
        </p>
        <p
          className="truncate text-xs"
          style={{ color: isDanger ? "var(--text-danger)" : "var(--text-secondary)" }}
        >
          {subtitle}
          {project.addedBy && (
            <>
              {" · "}
              <Sparkles size={11} className="inline -translate-y-px" aria-hidden="true" />
              {` Added by ${project.addedBy}`}
            </>
          )}
        </p>
      </div>

      <span
        className="whitespace-nowrap rounded-md px-2 py-1 text-xs"
        style={{ background: status.bg, color: status.text }}
      >
        {status.label}
      </span>

      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {isDanger ? (
          <button
            onClick={() => {
              select(project.id);
              onOpenDetail();
            }}
            className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium"
            style={{ border: "0.5px solid var(--border-danger)", color: "var(--text-danger)", background: "transparent" }}
          >
            Fix it
          </button>
        ) : isStarting ? (
          <IconButton label="Cancel" onClick={() => cancelStart(project.id)}>
            <X size={15} aria-hidden="true" />
          </IconButton>
        ) : isRunning ? (
          <IconButton label="Stop" onClick={() => stop(project.id)}>
            <Square size={15} aria-hidden="true" />
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
            <ExternalLink size={15} aria-hidden="true" />
          </IconButton>
        )}

        {!isDanger && (
          <IconButton label="Open folder" onClick={() => openPath(project.workingDir).catch(() => {})}>
            <FolderOpen size={15} aria-hidden="true" />
          </IconButton>
        )}

        {!isDanger && defaultIde && (
          <IconButton
            label={`Open in ${defaultIde.name}`}
            onClick={() => openInIde(defaultIde.path, project.workingDir).catch(() => {})}
          >
            <Code2 size={15} aria-hidden="true" />
          </IconButton>
        )}

        <div className="relative" ref={menuRef}>
          <IconButton label="More options" onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </IconButton>

          {menuOpen && (
            <div
              className="absolute right-0 top-9 z-10 w-52 rounded-lg p-1"
              style={{ background: "var(--surface-2)", border: "0.5px solid var(--border-strong)", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
            >
              <MenuItem icon={<Pencil size={14} aria-hidden="true" />}>Rename</MenuItem>
              <MenuItem icon={<Plug size={14} aria-hidden="true" />}>Change port</MenuItem>
              <MenuItem icon={<Star size={14} aria-hidden="true" />}>Pin to top</MenuItem>
              <MenuItem icon={<Terminal size={14} aria-hidden="true" />}>Open terminal here</MenuItem>
              <div className="my-1 h-px" style={{ background: "var(--border)" }} />
              <MenuItem icon={<Trash2 size={14} aria-hidden="true" />} danger>
                Remove project
              </MenuItem>
            </div>
          )}
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
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md p-0 disabled:opacity-40"
      style={{ background: "transparent", border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  icon,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm"
      style={{ background: "transparent", border: "none", color: danger ? "var(--text-danger)" : "var(--text-primary)" }}
    >
      {icon}
      {children}
    </button>
  );
}
