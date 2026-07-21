import { Folder, Plus } from "lucide-react";
import { useProjectsStore } from "../store/projects";
import { STATUS_CONFIG } from "../lib/status";

export function Rail({ onAddProject }: { onAddProject: () => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const selectedId = useProjectsStore((s) => s.selectedId);
  const select = useProjectsStore((s) => s.select);

  return (
    <div
      className="flex w-16 shrink-0 flex-col items-center gap-2.5 py-3"
      style={{ background: "var(--surface-1)", borderRight: "0.5px solid var(--border)" }}
    >
      {projects.map((project) => {
        const isSelected = project.id === selectedId;
        const dot = STATUS_CONFIG[project.status].dot;
        return (
          <button
            key={project.id}
            aria-label={`${project.name} (${STATUS_CONFIG[project.status].label})`}
            onClick={() => select(project.id)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border-none p-0 transition"
            style={{
              background: isSelected ? "var(--fill-accent)" : "var(--surface-2)",
              color: isSelected ? "var(--on-accent)" : "var(--text-secondary)",
              boxShadow: isSelected ? "0 0 0 2px var(--border-accent)" : "none",
            }}
          >
            <Folder size={16} aria-hidden="true" />
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full"
              style={{ background: dot, border: "2px solid var(--surface-1)" }}
            />
          </button>
        );
      })}

      <button
        aria-label="Add project"
        onClick={onAddProject}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed p-0"
        style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)", background: "transparent" }}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
