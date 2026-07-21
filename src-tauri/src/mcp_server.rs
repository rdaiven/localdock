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
use tauri::AppHandle;

use crate::process_manager::{list_running_shared, start_process_shared, stop_process_shared, SharedProcessMap};
use crate::ports::check_port;

pub const MCP_PORT: u16 = 7420;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct StartProjectRequest {
    #[schemars(description = "A stable id for this project. Reuse the same id to restart it.")]
    pub project_id: String,
    #[schemars(description = "Shell command to run, e.g. \"npm run dev\"")]
    pub command: String,
    #[schemars(description = "Absolute working directory to run the command in")]
    pub cwd: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ProjectIdRequest {
    #[schemars(description = "The project id passed to start_project")]
    pub project_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct PortRequest {
    #[schemars(description = "TCP port number to check")]
    pub port: u16,
}

#[derive(Clone)]
pub struct LocalDockMcp {
    app: AppHandle,
    state: SharedProcessMap,
    tool_router: ToolRouter<Self>,
}

impl LocalDockMcp {
    pub fn new(app: AppHandle, state: SharedProcessMap) -> Self {
        Self { app, state, tool_router: Self::tool_router() }
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
        match start_process_shared(&self.app, &self.state, project_id.clone(), command, cwd, HashMap::new()) {
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

    #[tool(description = "List the project ids LocalDock currently has running.")]
    fn list_running_projects(&self) -> String {
        let ids = list_running_shared(&self.state);
        if ids.is_empty() {
            "No projects are currently running.".to_string()
        } else {
            ids.join(", ")
        }
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
            "LocalDock's process manager. Use these tools to start, stop, and inspect real dev-server \
             processes on the user's machine — every action is mirrored live in the LocalDock desktop app.",
        )
    }
}

pub fn spawn_mcp_server(app: AppHandle, state: SharedProcessMap) {
    tauri::async_runtime::spawn(async move {
        let service = StreamableHttpService::new(
            move || Ok(LocalDockMcp::new(app.clone(), state.clone())),
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
