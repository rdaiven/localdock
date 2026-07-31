import type { Project } from "../types";
import { loadJson, saveJson } from "./jsonStorage";

const PROJECTS_FILE = "projects.json";

/** Nothing is actually running yet in a freshly launched app — force every
 * loaded project back to "stopped" regardless of what it was saved as. */
export async function loadProjects(): Promise<Project[]> {
  const parsed = await loadJson<Project[]>(PROJECTS_FILE);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((p) => ({ ...p, status: "stopped", attentionReason: undefined, startedAt: undefined }));
}

export function saveProjects(projects: Project[]): Promise<void> {
  return saveJson(PROJECTS_FILE, projects);
}
