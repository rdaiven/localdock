import { useEffect, useState } from "react";
import { ArrowLeft, Sun, Moon, Laptop, Sparkles, Copy, Check, Power, RefreshCw, Download } from "lucide-react";
import { useSettingsStore } from "../store/settings";
import { quitApp } from "../lib/settingsApi";
import { currentVersion, checkForUpdate, installUpdate, type Update } from "../lib/updateApi";

const MCP_URL = "http://127.0.0.1:7420/mcp";
const MCP_SNIPPET = JSON.stringify({ mcpServers: { localdock: { url: MCP_URL } } }, null, 2);

export function Settings({ onBack }: { onBack: () => void }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const defaultIdeId = useSettingsStore((s) => s.defaultIdeId);
  const setDefaultIde = useSettingsStore((s) => s.setDefaultIde);
  const detectedIdes = useSettingsStore((s) => s.detectedIdes);
  const autostart = useSettingsStore((s) => s.autostart);
  const setAutostart = useSettingsStore((s) => s.setAutostart);
  const startMinimized = useSettingsStore((s) => s.startMinimized);
  const setStartMinimized = useSettingsStore((s) => s.setStartMinimized);
  const closeToTray = useSettingsStore((s) => s.closeToTray);
  const setCloseToTray = useSettingsStore((s) => s.setCloseToTray);
  const [copied, setCopied] = useState(false);

  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "up-to-date" | "available" | "installing" | "error">("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    currentVersion().then(setAppVersion).catch(() => {});
  }, []);

  async function handleCheckForUpdate() {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const found = await checkForUpdate();
      if (found) {
        setUpdate(found);
        setUpdateStatus("available");
      } else {
        setUpdate(null);
        setUpdateStatus("up-to-date");
      }
    } catch (err) {
      setUpdateStatus("error");
      setUpdateError(String(err));
    }
  }

  async function handleInstallUpdate() {
    if (!update) return;
    setUpdateStatus("installing");
    setUpdateError(null);
    try {
      await installUpdate(update);
    } catch (err) {
      setUpdateStatus("error");
      setUpdateError(String(err));
    }
  }

  function copySnippet() {
    navigator.clipboard.writeText(MCP_SNIPPET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="overflow-y-auto" style={{ height: "100vh", padding: 18, background: "var(--surface-0)" }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
        <button aria-label="Back" onClick={onBack} className="icon-btn">
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
        <h1 className="t-title" style={{ margin: 0 }}>
          Settings
        </h1>
      </div>

      <div className="flex-col gap-4" style={{ maxWidth: 460, marginInline: "auto" }}>
        <Section title="Appearance">
          <Field label="Theme">
            <div className="flex gap-2">
              <ThemeButton icon={<Sun size={13} aria-hidden="true" />} label="Light" active={theme === "light"} onClick={() => setTheme("light")} />
              <ThemeButton icon={<Moon size={13} aria-hidden="true" />} label="Dark" active={theme === "dark"} onClick={() => setTheme("dark")} />
              <ThemeButton icon={<Laptop size={13} aria-hidden="true" />} label="Auto" active={theme === "auto"} onClick={() => setTheme("auto")} />
            </div>
          </Field>
        </Section>

        <Section title="Development">
          {detectedIdes.length === 0 ? (
            <div>
              <p className="t-small c-primary" style={{ marginBottom: 4 }}>
                Default IDE
              </p>
              <p className="t-micro c-muted">
                No supported IDEs detected on this machine (checked VS Code, Cursor, Windsurf, Zed).
              </p>
            </div>
          ) : (
            <Field label="Default IDE">
              <select
                value={defaultIdeId ?? ""}
                onChange={(e) => setDefaultIde(e.target.value || null)}
                className="field"
                style={{ width: 170 }}
              >
                <option value="">None</option>
                {detectedIdes.map((ide) => (
                  <option key={ide.id} value={ide.id}>
                    {ide.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Start LocalDock on login">
            <Switch checked={autostart} onChange={setAutostart} />
          </Field>

          <Field label="Start minimized to tray">
            <Switch checked={startMinimized} onChange={setStartMinimized} />
          </Field>
        </Section>

        <Section title="Updates">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="t-small c-primary" style={{ marginBottom: 4 }}>
                Version {appVersion ?? "…"}
              </p>
              <p className="t-micro c-muted">
                {updateStatus === "idle" && "Check GitHub for a newer release."}
                {updateStatus === "checking" && "Checking for updates…"}
                {updateStatus === "up-to-date" && "You're on the latest version."}
                {updateStatus === "available" && update && `Version ${update.version} is available.`}
                {updateStatus === "installing" && "Downloading and installing — LocalDock will restart."}
                {updateStatus === "error" && (updateError ?? "Couldn't check for updates.")}
              </p>
            </div>
            {updateStatus === "available" ? (
              <button onClick={handleInstallUpdate} className="btn btn--sm btn--primary shrink-0">
                <Download size={12} aria-hidden="true" />
                Install & restart
              </button>
            ) : (
              <button
                onClick={handleCheckForUpdate}
                disabled={updateStatus === "checking" || updateStatus === "installing"}
                className="btn btn--sm shrink-0"
              >
                <RefreshCw size={12} aria-hidden="true" />
                Check for updates
              </button>
            )}
          </div>
        </Section>

        <Section title="AI & MCP">
          <div className="flex items-center gap-2">
            <span className="status-dot status-dot--live" style={{ background: "var(--fill-success)" }} />
            <p className="t-small c-primary">MCP server running</p>
          </div>

          <div className="flex items-center gap-2 notice notice--recessed" style={{ padding: 8 }}>
            <code className="grow truncate t-mono c-secondary">{MCP_URL}</code>
            <button onClick={copySnippet} className="btn btn--sm shrink-0">
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? "Copied" : "Copy config"}
            </button>
          </div>

          <div className="flex items-start gap-2 notice notice--recessed">
            <Sparkles size={14} className="c-muted shrink-0" style={{ marginTop: 2 }} aria-hidden="true" />
            <p className="t-micro c-secondary">
              Paste the copied config into your AI tool's MCP settings (e.g. Claude Code, Cursor) to let it
              start, stop, and inspect real dev processes here — every action shows up live in this app too.
            </p>
          </div>
        </Section>

        <Section title="Application">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="t-small c-primary" style={{ marginBottom: 4 }}>
                Close button hides to tray
              </p>
              <p className="t-micro c-muted">
                When off, closing the window quits LocalDock and stops its dev servers.
              </p>
            </div>
            <Switch checked={closeToTray} onChange={setCloseToTray} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="t-small c-primary" style={{ marginBottom: 4 }}>
                Quit LocalDock
              </p>
              <p className="t-micro c-muted">
                Closing the window only hides it to the tray. Quitting fully exits and stops every dev
                server LocalDock started.
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm("Quit LocalDock? Every dev server it started will be stopped.")) {
                  void quitApp();
                }
              }}
              className="btn btn--sm btn--danger shrink-0"
            >
              <Power size={12} aria-hidden="true" />
              Quit
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="t-eyebrow" style={{ margin: "0 0 8px" }}>
        {title}
      </h2>
      <div className="card flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="t-small c-primary">{label}</label>
      {children}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="switch">
      <span className="switch-thumb" />
    </button>
  );
}

function ThemeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`btn btn--sm${active ? " btn--primary" : ""}`}>
      {icon}
      {label}
    </button>
  );
}
