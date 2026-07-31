import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Search, Copy, Check, Trash2, ArrowDownToLine } from "lucide-react";
import { useProjectsStore } from "../store/projects";
import { STATUS_CONFIG } from "../lib/status";
import { parseAnsiLine, stripAnsi } from "../lib/ansi";

const EMPTY_LOGS: string[] = [];

export function LogViewer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const lines = useProjectsStore((s) => s.consoleLogs[projectId] ?? EMPTY_LOGS);
  const clearLogs = useProjectsStore((s) => s.clearLogs);

  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pre-strip once per line set; parse spans lazily per visible line.
  const filtered = useMemo(() => {
    if (!query.trim()) return lines;
    const q = query.toLowerCase();
    return lines.filter((l) => stripAnsi(l).toLowerCase().includes(q));
  }, [lines, query]);

  // Stick to the bottom while pinned; detach when the user scrolls up.
  useEffect(() => {
    if (pinnedToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, pinnedToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setPinnedToBottom(atBottom);
  }

  function copyAll() {
    const text = filtered.map(stripAnsi).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!project) return null;
  const status = STATUS_CONFIG[project.status];

  return (
    <motion.div
      className="overlay items-center justify-center"
      style={{ padding: 28 }}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="log-panel"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {/* header */}
        <div className="flex items-center gap-3" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <span
            className={`status-dot${project.status === "running" ? " status-dot--live" : ""}`}
            style={{ background: status.dot }}
          />
          <span className="t-title truncate">{project.name}</span>
          <span className="t-eyebrow shrink-0">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </span>

          <div className="relative grow" style={{ maxWidth: 320, marginLeft: "auto" }}>
            <Search
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute c-muted"
              style={{ left: 9, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter lines"
              className="field field--sm w-full"
              style={{ paddingLeft: 27 }}
            />
          </div>

          <button onClick={copyAll} className="btn btn--sm shrink-0" title="Copy visible lines">
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => clearLogs(project.id)}
            className="icon-btn icon-btn--sm"
            aria-label="Clear logs"
            title="Clear logs"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
          <button onClick={onClose} className="icon-btn icon-btn--sm icon-btn--bare" aria-label="Close">
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* body */}
        <div ref={scrollRef} onScroll={onScroll} className="log-body">
          {filtered.length === 0 ? (
            <p className="t-micro c-muted" style={{ padding: 16 }}>
              {lines.length === 0
                ? "No output yet — start the project to see its logs here."
                : "No lines match your filter."}
            </p>
          ) : (
            filtered.map((line, i) => <LogLine key={i} raw={line} query={query} />)
          )}
        </div>

        {!pinnedToBottom && (
          <button
            className="btn btn--sm jump-latest"
            onClick={() => {
              setPinnedToBottom(true);
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}
          >
            <ArrowDownToLine size={12} aria-hidden="true" />
            Jump to latest
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function LogLine({ raw, query }: { raw: string; query: string }) {
  const spans = useMemo(() => parseAnsiLine(raw), [raw]);
  const q = query.trim().toLowerCase();

  return (
    <div className="log-line">
      {spans.map((span, i) => {
        const style: React.CSSProperties = {};
        if (span.color) style.color = span.color;
        if (span.bold) style.fontWeight = 600;
        if (span.dim) style.opacity = 0.6;

        if (q && span.text.toLowerCase().includes(q)) {
          // highlight matches inside this span
          const parts: React.ReactNode[] = [];
          let rest = span.text;
          let idx = rest.toLowerCase().indexOf(q);
          let key = 0;
          while (idx >= 0) {
            if (idx > 0) parts.push(<span key={key++}>{rest.slice(0, idx)}</span>);
            parts.push(
              <mark key={key++} className="log-mark">
                {rest.slice(idx, idx + q.length)}
              </mark>,
            );
            rest = rest.slice(idx + q.length);
            idx = rest.toLowerCase().indexOf(q);
          }
          if (rest) parts.push(<span key={key++}>{rest}</span>);
          return (
            <span key={i} style={style}>
              {parts}
            </span>
          );
        }

        return (
          <span key={i} style={style}>
            {span.text}
          </span>
        );
      })}
    </div>
  );
}
