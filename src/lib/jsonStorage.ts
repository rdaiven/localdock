import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

// The one JSON-file persistence implementation, shared by settingsApi.ts
// (settings.json) and projectsStorage.ts (projects.json) — any change to
// the strategy (atomic writes, backups, telemetry) happens here once.

async function filePath(name: string): Promise<string> {
  const dir = await appDataDir();
  return join(dir, name);
}

export async function loadJson<T>(name: string): Promise<T | null> {
  try {
    const path = await filePath(name);
    if (!(await exists(path))) return null;
    return JSON.parse(await readTextFile(path)) as T;
  } catch {
    return null;
  }
}

// Writes to the same file are chained, and only the LATEST pending snapshot
// is written when a chain step runs (intermediate snapshots are skipped).
// Callers fire saves at keystroke frequency; without this, overlapping
// un-awaited writeTextFile calls could complete out of order and leave the
// file holding a stale snapshot.
const writeChains = new Map<string, Promise<void>>();
const pendingSnapshots = new Map<string, unknown>();

export function saveJson(name: string, value: unknown): Promise<void> {
  pendingSnapshots.set(name, value);
  const prev = writeChains.get(name) ?? Promise.resolve();
  const next = prev
    .then(async () => {
      if (!pendingSnapshots.has(name)) return; // an earlier chain step already wrote a newer snapshot
      const snapshot = pendingSnapshots.get(name);
      pendingSnapshots.delete(name);
      const dir = await appDataDir();
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });
      await writeTextFile(await filePath(name), JSON.stringify(snapshot, null, 2));
    })
    .catch(() => {
      // a failed write must not poison the chain for future saves
    });
  writeChains.set(name, next);
  return next;
}
