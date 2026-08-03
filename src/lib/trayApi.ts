import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TrayProjectEntry {
  id: string;
  name: string;
  running: boolean;
}

/** Replace the tray menu's per-project start/stop entries. */
export async function updateTrayMenu(projects: TrayProjectEntry[]): Promise<void> {
  return invoke<void>("update_tray_menu", { projects });
}

/** Fired when the user clicks a project's start/stop entry in the tray. */
export function onTrayToggleProject(callback: (projectId: string) => void): Promise<UnlistenFn> {
  return listen<string>("tray-toggle-project", (e) => callback(e.payload));
}
