use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct PortOwner {
    pid: u32,
    name: String,
}

#[tauri::command]
pub fn check_port(port: u16) -> Option<PortOwner> {
    listeners::get_process_by_port(port, listeners::Protocol::TCP)
        .ok()
        .map(|p| PortOwner { pid: p.pid, name: p.name })
}
