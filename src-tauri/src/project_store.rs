//! Read-only Rust view of the user's saved project list.
//!
//! The frontend OWNS projects.json (src/lib/projectsStorage.ts writes it, and
//! is the single writer — see jsonStorage.ts for the write serialization).
//! This module only ever reads it, so the MCP server can answer questions
//! about projects the user configured in the GUI. Anything that needs to
//! *change* a project goes through the frontend via an event instead.

use tauri::{AppHandle, Manager};

/// Mirrors the fields of the frontend's `Project` (src/types.ts) that the
/// Rust side needs. Must be kept in sync with that interface; unknown fields
/// are ignored so frontend-only additions don't break this reader.
#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredProject {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub framework: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub start_command: String,
    #[serde(default)]
    pub working_dir: String,
    #[serde(default)]
    pub group: Option<String>,
}

/// Every project the user has saved, or an empty list if the file is missing
/// or unreadable (a fresh install, or the GUI hasn't written it yet).
pub fn load(app: &AppHandle) -> Vec<StoredProject> {
    let Ok(dir) = app.path().app_data_dir() else {
        return Vec::new();
    };
    let Ok(raw) = std::fs::read_to_string(dir.join("projects.json")) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}
