import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { ProjectRow } from "./ProjectRow";
import { AddProjectModal } from "./AddProjectModal";
import { ProjectDetail } from "./ProjectDetail";
import { DiscoveryBanner } from "./DiscoveryBanner";
import { useProjectsStore, visibleProjects } from "../store/projects";

export function Dashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const state = useProjectsStore();
  const projects = visibleProjects(state);
  const selectedId = state.selectedId;
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSeed, setAddSeed] = useState<{ path: string; port: number } | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const initProcessEvents = useProjectsStore((s) => s.initProcessEvents);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const reconcileWithBackend = useProjectsStore((s) => s.reconcileWithBackend);

  useEffect(() => {
    initProcessEvents();
    void loadProjects().then(() => reconcileWithBackend());
  }, [initProcessEvents, loadProjects, reconcileWithBackend]);

  function openAddModal(seed?: { path: string; port: number }) {
    setAddSeed(seed ?? null);
    setShowAddModal(true);
  }

  return (
    <div className="flex" style={{ height: "100vh", background: "var(--surface-0)" }}>
      <Rail onAddProject={() => openAddModal()} />

      <div className="minw-0 grow overflow-y-auto page-pad">
        {/* Capped and centered so rows stay a comfortable reading width on wide windows */}
        <div className="content-col">
          <TopBar onAddProject={() => openAddModal()} onOpenSettings={onOpenSettings} />

          <DiscoveryBanner onAdd={(path, port) => openAddModal({ path, port })} />

          {projects.length === 0 ? (
            <div className="text-center" style={{ marginTop: 56 }}>
              <p className="t-eyebrow" style={{ marginBottom: 8 }}>
                {state.search.trim() ? "No matches" : "Empty dock"}
              </p>
              <p className="t-small c-secondary">
                {state.search.trim()
                  ? "No projects match your search."
                  : "Add a project folder to start managing its dev server here."}
              </p>
            </div>
          ) : (
            <div className="flex-col gap-2">
              <AnimatePresence initial={false}>
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ProjectRow
                      project={project}
                      selected={project.id === selectedId}
                      onOpenDetail={() => setDetailProjectId(project.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <AddProjectModal
            seedPath={addSeed?.path}
            seedPort={addSeed?.port}
            onClose={() => {
              setShowAddModal(false);
              setAddSeed(null);
            }}
          />
        )}
        {detailProjectId && (
          <ProjectDetail projectId={detailProjectId} onClose={() => setDetailProjectId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
