import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Square } from "lucide-react";
import type { Project } from "../types";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { ProjectRow } from "./ProjectRow";
import { AddProjectModal } from "./AddProjectModal";
import { ProjectDetail } from "./ProjectDetail";
import { DiscoveryBanner } from "./DiscoveryBanner";
import { LogViewer } from "./LogViewer";
import { useProjectsStore, visibleProjects } from "../store/projects";

export function Dashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const state = useProjectsStore();
  const projects = visibleProjects(state);
  const selectedId = state.selectedId;
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSeed, setAddSeed] = useState<{ path: string; port: number } | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [logProjectId, setLogProjectId] = useState<string | null>(null);
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
            <GroupedList
              projects={projects}
              selectedId={selectedId}
              onOpenDetail={setDetailProjectId}
              onOpenLogs={setLogProjectId}
            />
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
          <ProjectDetail
            projectId={detailProjectId}
            onClose={() => setDetailProjectId(null)}
            onOpenLogs={() => {
              setLogProjectId(detailProjectId);
              setDetailProjectId(null);
            }}
          />
        )}
        {logProjectId && <LogViewer projectId={logProjectId} onClose={() => setLogProjectId(null)} />}
      </AnimatePresence>
    </div>
  );
}

function GroupedList({
  projects,
  selectedId,
  onOpenDetail,
  onOpenLogs,
}: {
  projects: Project[];
  selectedId: string | null;
  onOpenDetail: (id: string) => void;
  onOpenLogs: (id: string) => void;
}) {
  const sections = new Map<string, Project[]>();
  for (const p of projects) {
    const key = p.group ?? "";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(p);
  }
  const named = [...sections.keys()].filter((k) => k !== "").sort();
  const ungrouped = sections.get("") ?? [];

  const renderRows = (items: Project[]) =>
    items.map((project) => (
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
          onOpenDetail={() => onOpenDetail(project.id)}
          onOpenLogs={() => onOpenLogs(project.id)}
        />
      </motion.div>
    ));

  return (
    <div className="flex-col gap-2">
      <AnimatePresence initial={false}>
        {named.map((name) => (
          <motion.div key={`grp:${name}`} layout className="flex-col gap-2">
            <GroupHeader name={name} items={sections.get(name)!} />
            {renderRows(sections.get(name)!)}
          </motion.div>
        ))}
        {ungrouped.length > 0 && named.length > 0 && (
          <motion.p key="hdr:ungrouped" layout className="t-eyebrow" style={{ marginTop: 8 }}>
            Ungrouped
          </motion.p>
        )}
        {renderRows(ungrouped)}
      </AnimatePresence>
    </div>
  );
}

function GroupHeader({ name, items }: { name: string; items: Project[] }) {
  const startGroup = useProjectsStore((s) => s.startGroup);
  const stopGroup = useProjectsStore((s) => s.stopGroup);
  const runningCount = items.filter((p) => p.status === "running" || p.status === "starting").length;
  const anyStartable = items.some((p) => p.status === "stopped" || p.attentionReason === "crashed");

  return (
    <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
      <p className="t-eyebrow grow">
        {name} · {runningCount}/{items.length} running
      </p>
      <button
        className="btn btn--sm"
        disabled={!anyStartable}
        onClick={() => void startGroup(name)}
        title="Start every stopped project in this group, in order"
      >
        <Play size={11} aria-hidden="true" />
        Start all
      </button>
      <button
        className="btn btn--sm"
        disabled={runningCount === 0}
        onClick={() => void stopGroup(name)}
        title="Stop every running project in this group"
      >
        <Square size={10} aria-hidden="true" />
        Stop all
      </button>
    </div>
  );
}
