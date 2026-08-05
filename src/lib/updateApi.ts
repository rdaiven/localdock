import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type { Update };

export function currentVersion(): Promise<string> {
  return getVersion();
}

/** Resolves to null when already up to date. Throws on a real check failure
 * (offline, GitHub unreachable) — callers decide how to surface that. */
export function checkForUpdate(): Promise<Update | null> {
  return check();
}

/** Downloads and installs in one step, then restarts into the new version. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
