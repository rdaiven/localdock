import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface McpAddProjectPayload {
  path: string;
  name: string | null;
  port: number | null;
  command: string | null;
}

/** Fired when an AI assistant calls the MCP server's add_project tool. The
 * frontend owns projects.json, so the Rust side only validates the path
 * exists and hands off here to actually detect and save the project. */
export function onMcpAddProject(callback: (payload: McpAddProjectPayload) => void): Promise<UnlistenFn> {
  return listen<McpAddProjectPayload>("mcp-add-project", (e) => callback(e.payload));
}
