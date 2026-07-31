import { AnimatePresence, motion } from "framer-motion";
import { Anchor, Plus, Pin } from "lucide-react";
import { useProjectsStore } from "../store/projects";
import { STATUS_CONFIG } from "../lib/status";

// Deterministic per-project color so pinned avatars stay visually distinct
// (and stable across renders) without needing a real per-project icon.
const AVATAR_COLORS = [
  "#e06c6c",
  "#e08d4f",
  "#d9a83f",
  "#7fb44a",
  "#43b98a",
  "#3fb0c4",
  "#5f95e8",
  "#9b7fe8",
  "#d772b5",
  "#e07090",
];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Rail({ onAddProject }: { onAddProject: () => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const selectedId = useProjectsStore((s) => s.selectedId);
  const select = useProjectsStore((s) => s.select);
  const pinned = projects.filter((p) => p.pinned);

  return (
    <div className="rail">
      <div className="brand-mark" title="LocalDock" aria-hidden="true">
        <Anchor size={17} />
      </div>

      {pinned.length === 0 ? (
        <div
          className="flex-col items-center gap-1 text-center"
          style={{ paddingInline: 6, paddingTop: 6 }}
          title="Pin a project from its ⋯ menu to see it here for quick access"
        >
          <Pin size={13} className="c-muted" aria-hidden="true" />
          <span className="c-muted" style={{ fontSize: 9, lineHeight: 1.25 }}>
            Pin projects for quick access
          </span>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {pinned.map((project) => {
            const isSelected = project.id === selectedId;
            const dot = STATUS_CONFIG[project.status].dot;
            return (
              <motion.button
                key={project.id}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.15 }}
                title={`${project.name} (${STATUS_CONFIG[project.status].label})`}
                aria-label={`${project.name} (${STATUS_CONFIG[project.status].label})`}
                onClick={() => select(project.id)}
                className="rail-avatar"
                style={{
                  background: colorFor(project.id),
                  boxShadow: isSelected ? "0 0 0 2px var(--border-accent)" : "none",
                  opacity: isSelected ? 1 : 0.85,
                }}
              >
                {project.name.trim().charAt(0).toUpperCase() || "?"}
                <span className="rail-dot" style={{ background: dot }} />
              </motion.button>
            );
          })}
        </AnimatePresence>
      )}

      <button
        aria-label="Add project"
        onClick={onAddProject}
        className="mt-auto icon-btn icon-btn--lg"
        style={{ borderStyle: "dashed" }}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
