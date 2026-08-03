use std::collections::HashMap;

use rmcp::{
    ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
};
use tauri::{AppHandle, Emitter};

use crate::ports::check_port;
use crate::process_manager::{
    console_tail, list_running_shared, restart_process_shared, start_process_shared,
    stop_process_shared, SharedLogBuffer, SharedProcessMap,
};
use crate::project_store;

pub const MCP_PORT: u16 = 7420;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct StartProjectRequest {
    #[schemars(description = "A stable id for this project. Reuse the same id to restart it. For a project the user already has in LocalDock, use the id from list_projects.")]
    pub project_id: String,
    #[schemars(description = "Shell command to run, e.g. \"npm run dev\"")]
    pub command: String,
    #[schemars(description = "Absolute working directory to run the command in")]
    pub cwd: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ProjectIdRequest {
    #[schemars(description = "The project id, as returned by list_projects or passed to start_project")]
    pub project_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ConsoleOutputRequest {
    #[schemars(description = "The project id, as returned by list_projects")]
    pub project_id: String,
    #[schemars(description = "How many of the most recent lines to return (default 50, max 500)")]
    pub lines: Option<usize>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct PortRequest {
    #[schemars(description = "TCP port number to check")]
    pub port: u16,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct AddProjectRequest {
    #[schemars(description = "Absolute path to the project folder")]
    pub path: String,
    #[schemars(description = "Display name. Defaults to the folder name.")]
    pub name: Option<String>,
    #[schemars(description = "Port the dev server listens on. Detected from the project when omitted.")]
    pub port: Option<u16>,
    #[schemars(description = "Command that starts the dev server. Detected from the project when omitted.")]
    pub command: Option<String>,
}

/// Payload for the event that asks the GUI to add a project. The frontend is
/// the single writer of the project list, so adds go through it rather than
/// writing projects.json from here.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AddProjectEvent {
    path: String,
    name: Option<String>,
    port: Option<u16>,
    command: Option<String>,
}

#[derive(Clone)]
pub struct LocalDockMcp {
    app: AppHandle,
    state: SharedProcessMap,
    logs: SharedLogBuffer,
    tool_router: ToolRouter<Self>,
}

impl LocalDockMcp {
    pub fn new(app: AppHandle, state: SharedProcessMap, logs: SharedLogBuffer) -> Self {
        Self { app, state, logs, tool_router: Self::tool_router() }
    }
}

#[tool_router]
impl LocalDockMcp {
    #[tool(
        description = "Start a project's dev server for real. Spawns the given command as a child process on this machine, tracked with a Windows Job Object so it (and everything it spawns) can be reliably killed later. Visible immediately in the LocalDock GUI."
    )]
    fn start_project(
        &self,
        Parameters(StartProjectRequest { project_id, command, cwd }): Parameters<StartProjectRequest>,
    ) -> String {
        match start_process_shared(
            &self.app,
            &self.state,
            &self.logs,
            project_id.clone(),
            command,
            cwd,
            HashMap::new(),
        ) {
            Ok(pid) => format!("Started \"{project_id}\" (pid {pid})."),
            Err(e) => format!("Failed to start \"{project_id}\": {e}"),
        }
    }

    #[tool(description = "Stop a project previously started with start_project, killing its full process tree.")]
    fn stop_project(&self, Parameters(ProjectIdRequest { project_id }): Parameters<ProjectIdRequest>) -> String {
        match stop_process_shared(&self.state, project_id.clone()) {
            Ok(()) => format!("Stopped \"{project_id}\"."),
            Err(e) => format!("Failed to stop \"{project_id}\": {e}"),
        }
    }

    #[tool(
        description = "Restart a running project, reusing the command and directory it was started with. Useful after changing config the dev server only reads at boot."
    )]
    fn restart_project(&self, Parameters(ProjectIdRequest { project_id }): Parameters<ProjectIdRequest>) -> String {
        match restart_process_shared(&self.app, &self.state, &self.logs, project_id.clone()) {
            Ok(pid) => format!("Restarted \"{project_id}\" (pid {pid})."),
            Err(e) => format!("Failed to restart \"{project_id}\": {e}"),
        }
    }

    #[tool(
        description = "List every project saved in LocalDock with its id, port, framework, group, and whether it's running right now. Call this first to discover project ids to use with the other tools."
    )]
    fn list_projects(&self) -> String {
        let saved = project_store::load(&self.app);
        let running = list_running_shared(&self.state);

        if saved.is_empty() && running.is_empty() {
            return "LocalDock has no saved projects yet.".to_string();
        }

        let mut out = Vec::new();
        for p in &saved {
            let state = if running.contains(&p.id) { "running" } else { "stopped" };
            let group = p.group.as_deref().filter(|g| !g.is_empty()).map(|g| format!(", group \"{g}\"")).unwrap_or_default();
            out.push(format!(
                "{} — id \"{}\", {}, port {}, {}{}\n    dir: {}\n    start: {}",
                p.name, p.id, p.framework, p.port, state, group, p.working_dir, p.start_command
            ));
        }
        // Anything running that isn't in the saved list (e.g. started by an
        // assistant with an ad-hoc id) still deserves to be reported.
        for id in &running {
            if !saved.iter().any(|p| &p.id == id) {
                out.push(format!("(unsaved) — id \"{id}\", running"));
            }
        }
        out.join("\n")
    }

    #[tool(
        description = "Read the most recent console output a project's dev server printed — the same output shown in LocalDock's log viewer. Use this to diagnose why a server failed to start or what it's serving."
    )]
    fn get_console_output(
        &self,
        Parameters(ConsoleOutputRequest { project_id, lines }): Parameters<ConsoleOutputRequest>,
    ) -> String {
        let limit = lines.unwrap_or(50).clamp(1, 500);
        let tail = console_tail(&self.logs, &project_id, limit);
        if tail.is_empty() {
            format!("No console output recorded for \"{project_id}\". It may not have been started by LocalDock in this session.")
        } else {
            tail.join("\n")
        }
    }

    #[tool(
        description = "Add a project folder to LocalDock so the user can manage it from the GUI. Framework, start command, and port are auto-detected from the folder when not given."
    )]
    fn add_project(
        &self,
        Parameters(AddProjectRequest { path, name, port, command }): Parameters<AddProjectRequest>,
    ) -> String {
        if !std::path::Path::new(&path).is_dir() {
            return format!("No folder at \"{path}\" — pass an absolute path to the project directory.");
        }
        match self.app.emit("mcp-add-project", AddProjectEvent { path: path.clone(), name, port, command }) {
            Ok(()) => format!("Added \"{path}\" to LocalDock. Call list_projects to get its id."),
            Err(e) => format!("Couldn't add \"{path}\": {e}"),
        }
    }

    #[tool(
        description = "Find dev servers running on this machine that LocalDock isn't managing — started by hand or by another tool. Reports each one's port, process, and working directory."
    )]
    fn scan_for_servers(&self) -> String {
        let found = crate::discover::scan_running_dev_servers();
        if found.is_empty() {
            return "No unmanaged dev servers found listening on this machine.".to_string();
        }
        found
            .iter()
            .map(|s| {
                let dir = s.cwd.as_deref().unwrap_or("(unknown directory)");
                format!("{} on port {} (pid {}) — {}", s.process_name, s.port, s.pid, dir)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[tool(description = "Check whether a TCP port is currently bound on this machine, and by which process.")]
    fn check_port_tool(&self, Parameters(PortRequest { port }): Parameters<PortRequest>) -> String {
        match check_port(port) {
            Some(owner) => format!("Port {port} is in use by \"{}\" (pid {}).", owner.name, owner.pid),
            None => format!("Port {port} is free."),
        }
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LocalDockMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "LocalDock's process manager. Use these tools to start, stop, restart, and inspect real \
             dev-server processes on the user's machine — every action is mirrored live in the \
             LocalDock desktop app. Call list_projects first to see what the user already has \
             configured and get project ids; use get_console_output to read a server's actual \
             output when diagnosing a failure.",
        )
    }
}

pub fn spawn_mcp_server(app: AppHandle, state: SharedProcessMap, logs: SharedLogBuffer) {
    tauri::async_runtime::spawn(async move {
        let service = StreamableHttpService::new(
            move || Ok(LocalDockMcp::new(app.clone(), state.clone(), logs.clone())),
            std::sync::Arc::new(LocalSessionManager::default()),
            StreamableHttpServerConfig::default(),
        );
        let router = axum::Router::new().nest_service("/mcp", service);
        let addr = format!("127.0.0.1:{MCP_PORT}");
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                let _ = axum::serve(listener, router).await;
            }
            Err(e) => {
                eprintln!("[mcp] failed to bind {addr}: {e}");
            }
        }
    });
}
