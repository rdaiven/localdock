import { invoke } from "@tauri-apps/api/core";

export interface DiscoveredServer {
  pid: number;
  port: number;
  processName: string;
  cwd: string | null;
}

export async function scanRunningDevServers(): Promise<DiscoveredServer[]> {
  return invoke<DiscoveredServer[]>("scan_running_dev_servers");
}
