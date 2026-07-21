import { useEffect, useState } from "react";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { ProjectRow } from "./ProjectRow";
import { AddProjectModal } from "./AddProjectModal";
import { ProjectDetail } from "./ProjectDetail";
import { useProjectsStore, visibleProjects } from "../store/projects";

export function Dashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const state = useProjectsStore();
  const projects = visibleProjects(state);
  const selectedId = state.selectedId;
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const initProcessEvents = useProjectsStore((s) => s.initProcessEvents);
  const reconcileWithBackend = useProjectsStore((s) => s.reconcileWithBackend);

  useEffect(() => {
    initProcessEvents();
    void reconcileWithBackend();
  }, [initProcessEvents, reconcileWithBackend]);

  return (
    <div className="flex h-screen" style={{ background: "var(--surface-0)" }}>
      <Rail onAddProject={() => setShowAddModal(true)} />

      <div className="min-w-0 flex-1 p-4">
        <TopBar onAddProject={() => setShowAddModal(true)} onOpenSettings={onOpenSettings} />

        {projects.length === 0 ? (
          <p className="mt-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No projects match your search.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                selected={project.id === selectedId}
                onOpenDetail={() => setDetailProjectId(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && <AddProjectModal onClose={() => setShowAddModal(false)} />}
      {detailProjectId && (
        <ProjectDetail projectId={detailProjectId} onClose={() => setDetailProjectId(null)} />
      )}
    </div>
  );
}
