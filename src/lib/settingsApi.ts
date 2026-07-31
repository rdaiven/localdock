import { invoke } from "@tauri-apps/api/core";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { loadJson, saveJson } from "./jsonStorage";

export interface DetectedIde {
  id: string;
  name: string;
  path: string;
}

export async function detectIdes(): Promise<DetectedIde[]> {
  return invoke<DetectedIde[]>("detect_ides");
}

export async function openInIde(idePath: string, projectDir: string): Promise<void> {
  return invoke<void>("open_in_ide", { idePath, projectDir });
}

export async function openTerminal(projectDir: string): Promise<void> {
  return invoke<void>("open_terminal", { projectDir });
}

export async function getAutostartEnabled(): Promise<boolean> {
  return isEnabled();
}

export async function setAutostartEnabled(value: boolean): Promise<void> {
  if (value) await enable();
  else await disable();
}

/** This interface OWNS the schema of settings.json. The Rust side also
 * reads a slice of this file (src-tauri/src/tray.rs, `PersistedSettings` —
 * currently `startMinimized` and `closeToTray`); renaming keys or moving
 * the file must be mirrored there. */
export interface PersistedSettings {
  theme: "light" | "dark" | "auto";
  defaultIdeId: string | null;
  startMinimized: boolean;
  /** true (default): the window close button hides to the tray; false: it quits. */
  closeToTray: boolean;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  theme: "auto",
  defaultIdeId: null,
  startMinimized: false,
  closeToTray: true,
};

const SETTINGS_FILE = "settings.json";

export async function loadSettings(): Promise<PersistedSettings> {
  const parsed = await loadJson<Partial<PersistedSettings>>(SETTINGS_FILE);
  return { ...DEFAULT_SETTINGS, ...(parsed ?? {}) };
}

export function saveSettings(settings: PersistedSettings): Promise<void> {
  return saveJson(SETTINGS_FILE, settings);
}

/** Fully exit LocalDock (the window close button only hides to the tray). */
export async function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}
