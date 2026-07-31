import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, RadarIcon } from "lucide-react";
import { useProjectsStore } from "../store/projects";

export function DiscoveryBanner({ onAdd }: { onAdd: (path: string, port: number) => void }) {
  const discovered = useProjectsStore((s) => s.discovered);
  const dismissDiscovered = useProjectsStore((s) => s.dismissDiscovered);

  return (
    <AnimatePresence>
      {discovered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-col gap-2 overflow-hidden notice notice--accent"
          style={{ border: "1px solid var(--border-accent)" }}
        >
          <div className="flex items-center gap-2">
            <RadarIcon size={13} className="c-accent" aria-hidden="true" />
            <p className="t-eyebrow c-accent">
              {discovered.length} running {discovered.length === 1 ? "server" : "servers"} not in your list
            </p>
          </div>
          <div className="flex-col gap-1">
            <AnimatePresence initial={false}>
              {discovered.map((server) => (
                <motion.div
                  key={server.pid}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-between gap-3"
                  style={{
                    padding: "6px 10px",
                    borderRadius: "var(--radius-s)",
                    background: "var(--surface-2)",
                  }}
                >
                  <div className="minw-0">
                    <p className="truncate t-mono c-primary" style={{ fontWeight: 500 }}>
                      {server.processName} · :{server.port}
                    </p>
                    <p className="truncate t-micro c-muted" title={server.cwd ?? ""}>
                      {server.cwd}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        // cwd is guaranteed non-null by the store's filter,
                        // but that invariant lives in another file — narrow
                        // here instead of asserting.
                        if (!server.cwd) return;
                        onAdd(server.cwd, server.port);
                        dismissDiscovered(server.pid);
                      }}
                      className="btn btn--sm btn--primary"
                    >
                      <Plus size={12} aria-hidden="true" />
                      Add
                    </motion.button>
                    <button
                      aria-label="Dismiss"
                      onClick={() => dismissDiscovered(server.pid)}
                      className="icon-btn icon-btn--sm icon-btn--bare"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
