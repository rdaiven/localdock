import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PortOwner {
  pid: number;
  name: string;
}

export interface ProcessLogEvent {
  projectId: string;
  stream: "stdout" | "stderr";
  line: string;
}

export interface ProcessExitedEvent {
  projectId: string;
  code: number | null;
}

export async function startProcess(
  projectId: string,
  command: string,
  cwd: string,
  env: Record<string, string> = {},
): Promise<number> {
  return invoke<number>("start_process", { projectId, command, cwd, env });
}

export async function stopProcess(projectId: string): Promise<void> {
  return invoke<void>("stop_process", { projectId });
}

export async function isProcessRunning(projectId: string): Promise<boolean> {
  return invoke<boolean>("is_process_running", { projectId });
}

export async function checkPort(port: number): Promise<PortOwner | null> {
  return invoke<PortOwner | null>("check_port", { port });
}

export function onProcessLog(callback: (event: ProcessLogEvent) => void): Promise<UnlistenFn> {
  return listen<ProcessLogEvent>("process-log", (e) => callback(e.payload));
}

export function onProcessExited(callback: (event: ProcessExitedEvent) => void): Promise<UnlistenFn> {
  return listen<ProcessExitedEvent>("process-exited", (e) => callback(e.payload));
}
