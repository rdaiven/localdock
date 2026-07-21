import { useState } from "react";
import { ArrowLeft, Sun, Moon, Laptop, Sparkles, Copy, Check } from "lucide-react";
import { useSettingsStore } from "../store/settings";

const MCP_URL = "http://127.0.0.1:7420/mcp";
const MCP_SNIPPET = JSON.stringify({ mcpServers: { localdock: { url: MCP_URL } } }, null, 2);

const inputStyle = {
  background: "var(--surface-1)",
  border: "0.5px solid var(--border)",
  color: "var(--text-primary)",
} as const;

export function Settings({ onBack }: { onBack: () => void }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const defaultIdeId = useSettingsStore((s) => s.defaultIdeId);
  const setDefaultIde = useSettingsStore((s) => s.setDefaultIde);
  const detectedIdes = useSettingsStore((s) => s.detectedIdes);
  const autostart = useSettingsStore((s) => s.autostart);
  const setAutostart = useSettingsStore((s) => s.setAutostart);
  const [copied, setCopied] = useState(false);

  function copySnippet() {
    navigator.clipboard.writeText(MCP_SNIPPET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="h-screen overflow-y-auto p-5" style={{ background: "var(--surface-0)" }}>
      <div className="mb-5 flex items-center gap-3">
        <button
          aria-label="Back"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-md p-0"
          style={{ background: "transparent", border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
        <h1 className="text-base font-medium">Settings</h1>
      </div>

      <div className="mx-auto flex max-w-md flex-col gap-6">
        <Section title="Appearance">
          <Field label="Theme">
            <div className="flex gap-2">
              <ThemeButton icon={<Sun size={14} aria-hidden="true" />} label="Light" active={theme === "light"} onClick={() => setTheme("light")} />
              <ThemeButton icon={<Moon size={14} aria-hidden="true" />} label="Dark" active={theme === "dark"} onClick={() => setTheme("dark")} />
              <ThemeButton icon={<Laptop size={14} aria-hidden="true" />} label="Auto" active={theme === "auto"} onClick={() => setTheme("auto")} />
            </div>
          </Field>
        </Section>

        <Section title="Development">
          {detectedIdes.length === 0 ? (
            <div>
              <p className="mb-1 text-sm" style={{ color: "var(--text-primary)" }}>
                Default IDE
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                No supported IDEs detected on this machine (checked VS Code, Cursor, Windsurf, Zed).
              </p>
            </div>
          ) : (
            <Field label="Default IDE">
              <select
                value={defaultIdeId ?? ""}
                onChange={(e) => setDefaultIde(e.target.value || null)}
                className="h-9 w-40 rounded-lg px-2.5 text-sm"
                style={inputStyle}
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
            <button
              role="switch"
              aria-checked={autostart}
              onClick={() => setAutostart(!autostart)}
              className="relative h-6 w-11 rounded-full p-0 transition-colors"
              style={{ background: autostart ? "var(--fill-accent)" : "var(--surface-1)", border: "0.5px solid var(--border)" }}
            >
              <span
                className="absolute top-0.5 h-4.5 w-4.5 rounded-full transition-transform"
                style={{
                  background: "var(--surface-2)",
                  transform: autostart ? "translateX(21px)" : "translateX(3px)",
                }}
              />
            </button>
          </Field>
        </Section>

        <Section title="AI & MCP">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--fill-success)" }} />
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              MCP server running
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: "var(--surface-1)" }}>
            <code className="flex-1 truncate text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
              {MCP_URL}
            </code>
            <button
              onClick={copySnippet}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
              style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
            >
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? "Copied" : "Copy config"}
            </button>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg p-3" style={{ background: "var(--surface-1)" }}>
            <Sparkles size={15} style={{ color: "var(--text-muted)", marginTop: 1 }} aria-hidden="true" />
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Paste the copied config into your AI tool's MCP settings (e.g. Claude Code, Cursor) to let it
              start, stop, and inspect real dev processes here — every action shows up live in this app too.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {title}
      </h2>
      <div className="flex flex-col gap-4 rounded-xl p-4" style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      {children}
    </div>
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
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
      style={{
        background: active ? "var(--fill-accent)" : "var(--surface-1)",
        color: active ? "var(--on-accent)" : "var(--text-secondary)",
        border: "0.5px solid var(--border)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
