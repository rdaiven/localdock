import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { X, FolderOpen, Check, Loader2 } from "lucide-react";
import { detectProject, FRAMEWORK_OPTIONS, type DetectionResult } from "../lib/detect";
import { useProjectsStore } from "../store/projects";

type Step = "pick" | "scanning" | "confirm";

export function AddProjectModal({
  onClose,
  seedPath,
  seedPort,
}: {
  onClose: () => void;
  seedPath?: string;
  seedPort?: number;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [framework, setFramework] = useState("");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [port, setPort] = useState(3000);
  const [rawFallback, setRawFallback] = useState("");

  const projects = useProjectsStore((s) => s.projects);
  const addProject = useProjectsStore((s) => s.addProject);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragActive(true);
        } else if (event.payload.type === "drop") {
          setDragActive(false);
          const path = event.payload.paths[0];
          if (path) void handlePicked(path);
        } else {
          setDragActive(false);
        }
      })
      .then((fn) => {
        // The modal may have already unmounted by the time this IPC round
        // trip resolves — unlisten immediately instead of leaking it.
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // drag-drop events aren't available outside a real Tauri window (e.g. plain browser preview)
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBrowse() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select a project folder" });
      if (typeof selected === "string") {
        await handlePicked(selected);
      }
    } catch {
      // dialog plugin isn't available outside a real Tauri window
    }
  }

  async function handlePicked(path: string, portOverride?: number) {
    setFolderPath(path);
    setStep("scanning");
    const detection = await detectProject(path);
    setResult(detection);
    setFramework(detection.framework);
    setName(detection.name);
    setCommand(detection.startCommand);
    // A discovered server's port is the one it's actually observed bound to
    // right now — more trustworthy than a generic framework default.
    setPort(portOverride ?? detection.port);
    setStep("confirm");
  }

  useEffect(() => {
    if (seedPath) void handlePicked(seedPath, seedPort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const portConflict = projects.some((p) => p.port === port);

  function handleSubmit() {
    addProject({
      name: name.trim() || "Untitled project",
      framework,
      port,
      startCommand: rawFallback.trim() || command,
      workingDir: folderPath,
    });
    onClose();
  }

  return (
    <motion.div
      className="overlay items-center justify-center"
      style={{ padding: 24 }}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <StepIndicator step={step} />
          <button aria-label="Close" onClick={onClose} className="icon-btn icon-btn--bare">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {step === "pick" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            className="flex-col items-center justify-center gap-3 text-center"
            style={{
              padding: "40px 24px",
              borderRadius: "var(--radius)",
              border: `2px dashed ${dragActive ? "var(--border-accent)" : "var(--border-strong)"}`,
              background: dragActive ? "var(--bg-accent)" : "transparent",
            }}
          >
            <FolderOpen size={26} className="c-muted" aria-hidden="true" />
            <p className="t-small c-secondary">Drag a project folder here</p>
            <button onClick={handleBrowse} className="btn btn--sm btn--primary">
              Browse
            </button>
          </div>
        )}

        {step === "scanning" && (
          <div className="flex-col items-center justify-center gap-3" style={{ padding: "40px 0" }}>
            <Loader2 size={20} className="spin c-accent" aria-hidden="true" />
            <p className="t-small c-secondary">Looking at your project…</p>
          </div>
        )}

        {step === "confirm" && result && (
          <div>
            {result.detected ? (
              <div className="notice notice--accent flex items-center gap-2" style={{ marginBottom: 16 }}>
                <Check size={15} className="c-accent" aria-hidden="true" />
                <span className="t-small c-accent">This looks like a {framework} app</span>
              </div>
            ) : (
              <div className="notice notice--warning" style={{ marginBottom: 16 }}>
                <p className="t-small c-warning">We're not sure how to start this.</p>
              </div>
            )}

            <Field label="Framework">
              <select value={framework} onChange={(e) => setFramework(e.target.value)} className="field w-full">
                {FRAMEWORK_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Display name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="field w-full" />
            </Field>

            {!result.detected && (
              <Field label="Paste what your AI assistant told you to run (optional)">
                <textarea
                  value={rawFallback}
                  onChange={(e) => setRawFallback(e.target.value)}
                  rows={2}
                  placeholder="npm install && npm run dev"
                  className="field field--mono w-full"
                />
              </Field>
            )}

            <Field label="Start command">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="field field--mono w-full"
              />
            </Field>

            <Field label="Port">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="field field--mono"
                  style={{ width: 96 }}
                />
                {portConflict ? (
                  <span className="t-micro c-danger">Already used by another project</span>
                ) : (
                  <span className="t-micro c-success">Available</span>
                )}
              </div>
            </Field>

            <motion.button
              onClick={handleSubmit}
              whileTap={{ scale: 0.97 }}
              className="btn btn--primary btn--block"
              style={{ marginTop: 4 }}
            >
              Add project
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="field-label t-micro c-secondary">{label}</label>
      {children}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const confirmActive = step === "confirm";
  return (
    <div className="flex items-center gap-2 t-eyebrow">
      <Dot active={!confirmActive} label="Detect" />
      <div style={{ height: 1, width: 16, background: "var(--border)" }} />
      <Dot active={confirmActive} label="Confirm" />
    </div>
  );
}

function Dot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1" style={{ color: active ? "var(--text-accent)" : undefined }}>
      <span
        className="status-dot"
        style={{ width: 6, height: 6, background: active ? "var(--fill-accent-flat)" : "var(--border-strong)" }}
      />
      {label}
    </span>
  );
}
