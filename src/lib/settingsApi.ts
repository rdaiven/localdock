import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";

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

export async function getAutostartEnabled(): Promise<boolean> {
  return isEnabled();
}

export async function setAutostartEnabled(value: boolean): Promise<void> {
  if (value) await enable();
  else await disable();
}

export interface PersistedSettings {
  theme: "light" | "dark" | "auto";
  defaultIdeId: string | null;
}

const DEFAULT_SETTINGS: PersistedSettings = { theme: "auto", defaultIdeId: null };

async function settingsFilePath(): Promise<string> {
  const dir = await appDataDir();
  return join(dir, "settings.json");
}

export async function loadSettings(): Promise<PersistedSettings> {
  try {
    const path = await settingsFilePath();
    if (!(await exists(path))) return DEFAULT_SETTINGS;
    const raw = await readTextFile(path);
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  const dir = await appDataDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  const path = await settingsFilePath();
  await writeTextFile(path, JSON.stringify(settings, null, 2));
}
