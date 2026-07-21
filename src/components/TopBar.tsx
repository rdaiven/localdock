import { Search, Plus, Settings as SettingsIcon } from "lucide-react";
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

  return (
    <div className="mb-3.5 flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects"
          className="h-9 w-full rounded-lg pl-8 pr-3 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortKey)}
        className="h-9 rounded-lg px-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "0.5px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <option value="name">Sort: Name</option>
        <option value="status">Sort: Status</option>
        <option value="framework">Sort: Framework</option>
      </select>

      <button
        onClick={onAddProject}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium"
        style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
      >
        <Plus size={15} aria-hidden="true" />
        Add project
      </button>

      <button
        aria-label="Settings"
        onClick={onOpenSettings}
        className="flex h-9 w-9 items-center justify-center rounded-lg p-0"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", color: "var(--text-secondary)" }}
      >
        <SettingsIcon size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
