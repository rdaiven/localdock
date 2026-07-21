use listeners::SocketState;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct PortOwner {
    pub pid: u32,
    pub name: String,
}

/// A process actually *listening* on `port` — ignores non-listening
/// connections (e.g. a lingering TIME_WAIT socket from an unrelated request
/// that already closed), which would otherwise look like a false conflict.
fn listening_owner(port: u16) -> Option<PortOwner> {
    listeners::get_all()
        .ok()?
        .into_iter()
        .find(|l| {
            l.socket.port() == port && l.protocol == listeners::Protocol::TCP && l.state == SocketState::Listen
        })
        .map(|l| PortOwner { pid: l.process.pid, name: l.process.name })
}

#[tauri::command]
pub fn check_port(port: u16) -> Option<PortOwner> {
    listening_owner(port)
}

/// Just the PID of whatever's listening on `port`, if anything.
pub fn owner_pid(port: u16) -> Option<u32> {
    listening_owner(port).map(|o| o.pid)
}
