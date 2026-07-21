import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { X, FolderOpen, Check, Loader2 } from "lucide-react";
import { detectProject, FRAMEWORK_OPTIONS, type DetectionResult } from "../lib/detect";
import { useProjectsStore } from "../store/projects";

type Step = "pick" | "scanning" | "confirm";

const inputStyle = {
  background: "var(--surface-1)",
  border: "0.5px solid var(--border)",
  color: "var(--text-primary)",
} as const;

export function AddProjectModal({ onClose }: { onClose: () => void }) {
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
        unlisten = fn;
      })
      .catch(() => {
        // drag-drop events aren't available outside a real Tauri window (e.g. plain browser preview)
      });
    return () => unlisten?.();
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

  async function handlePicked(path: string) {
    setFolderPath(path);
    setStep("scanning");
    const detection = await detectProject(path);
    setResult(detection);
    setFramework(detection.framework);
    setName(detection.name);
    setCommand(detection.startCommand);
    setPort(detection.port);
    setStep("confirm");
  }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <StepIndicator step={step} />
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)" }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {step === "pick" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center"
            style={{
              borderColor: dragActive ? "var(--border-accent)" : "var(--border-strong)",
              background: dragActive ? "var(--bg-accent)" : "transparent",
            }}
          >
            <FolderOpen size={28} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Drag a project folder here
            </p>
            <button
              onClick={handleBrowse}
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Browse
            </button>
          </div>
        )}

        {step === "scanning" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-accent)" }} aria-hidden="true" />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Looking at your project…
            </p>
          </div>
        )}

        {step === "confirm" && result && (
          <div>
            {result.detected ? (
              <div
                className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{ background: "var(--bg-accent)" }}
              >
                <Check size={16} style={{ color: "var(--text-accent)" }} aria-hidden="true" />
                <span className="text-sm" style={{ color: "var(--text-accent)" }}>
                  This looks like a {framework} app
                </span>
              </div>
            ) : (
              <div className="mb-4 rounded-lg px-3 py-2.5" style={{ background: "var(--bg-warning)" }}>
                <p className="text-sm" style={{ color: "var(--text-warning)" }}>
                  We're not sure how to start this.
                </p>
              </div>
            )}

            <Field label="Change framework">
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                className="h-9 w-full rounded-lg px-2.5 text-sm"
                style={inputStyle}
              >
                {FRAMEWORK_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-lg px-2.5 text-sm"
                style={inputStyle}
              />
            </Field>

            {!result.detected && (
              <Field label="Paste what your AI assistant told you to run (optional)">
                <textarea
                  value={rawFallback}
                  onChange={(e) => setRawFallback(e.target.value)}
                  rows={2}
                  placeholder="npm install && npm run dev"
                  className="w-full rounded-lg px-2.5 py-2 text-sm"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </Field>
            )}

            <Field label="Start command">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="h-9 w-full rounded-lg px-2.5 text-sm"
                style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
              />
            </Field>

            <Field label="Port">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="h-9 w-24 rounded-lg px-2.5 text-sm"
                  style={inputStyle}
                />
                {portConflict ? (
                  <span className="text-xs" style={{ color: "var(--text-danger)" }}>
                    Already used by another project
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--text-success)" }}>
                    Available
                  </span>
                )}
              </div>
            </Field>

            <button
              onClick={handleSubmit}
              className="mt-1 w-full rounded-lg py-2 text-sm font-medium"
              style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              Add project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const confirmActive = step === "confirm";
  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
      <Dot active={!confirmActive} label="Detect" />
      <div className="h-px w-4" style={{ background: "var(--border)" }} />
      <Dot active={confirmActive} label="Confirm" />
    </div>
  );
}

function Dot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: active ? "var(--fill-accent)" : "var(--border-strong)" }}
      />
      {label}
    </span>
  );
}
