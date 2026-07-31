import { motion } from "framer-motion";
import { Search, Plus, Settings as SettingsIcon, RadarIcon, Loader2 } from "lucide-react";
import { useProjectsStore } from "../store/projects";
import type { SortKey } from "../types";

export function TopBar({
  onAddProject,
  onOpenSettings,
}: {
  onAddProject: () => void;
  onOpenSettings: () => void;
}) {
  const search = useProjectsStore((s) => s.search);
  const setSearch = useProjectsStore((s) => s.setSearch);
  const sortBy = useProjectsStore((s) => s.sortBy);
  const setSortBy = useProjectsStore((s) => s.setSortBy);
  const scanForServers = useProjectsStore((s) => s.scanForServers);
  const discoveryScanning = useProjectsStore((s) => s.discoveryScanning);
  const discovered = useProjectsStore((s) => s.discovered);

  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
      <div className="relative grow">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute c-muted"
          style={{ left: 11, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects"
          className="field w-full"
          style={{ paddingLeft: 32 }}
        />
      </div>

      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortKey)}
        className="field shrink-0"
        style={{ width: 148 }}
      >
        <option value="name">Sort: Name</option>
        <option value="status">Sort: Status</option>
        <option value="framework">Sort: Framework</option>
      </select>

      <motion.button
        aria-label="Scan for running dev servers"
        title="Scan for running dev servers"
        onClick={() => void scanForServers()}
        disabled={discoveryScanning}
        whileTap={discoveryScanning ? undefined : { scale: 0.94 }}
        className="icon-btn icon-btn--lg icon-btn--raised relative"
      >
        {discoveryScanning ? (
          <Loader2 size={15} className="spin" aria-hidden="true" />
        ) : (
          <RadarIcon size={15} aria-hidden="true" />
        )}
        {discovered.length > 0 && <span className="badge-count">{discovered.length}</span>}
      </motion.button>

      <motion.button
        onClick={onAddProject}
        whileTap={{ scale: 0.97 }}
        className="btn btn--primary"
        aria-label="Add project"
      >
        <Plus size={15} aria-hidden="true" />
        <span className="hide-narrow">Add project</span>
      </motion.button>

      <button aria-label="Settings" onClick={onOpenSettings} className="icon-btn icon-btn--lg icon-btn--raised">
        <SettingsIcon size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
