use listeners::SocketState;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct PortOwner {
    pub pid: u32,
    pub name: String,
}

/// Every TCP socket currently in LISTEN state — the single definition of
/// "listening" shared by port-conflict checks here and dev-server discovery
/// in discover.rs. Ignores non-listening connections (e.g. a lingering
/// TIME_WAIT socket from a request that already closed), which would
/// otherwise look like false conflicts / false discoveries.
pub fn all_tcp_listening() -> Vec<listeners::Listener> {
    listeners::get_all()
        .map(|all| {
            all.into_iter()
                .filter(|l| l.protocol == listeners::Protocol::TCP && l.state == SocketState::Listen)
                .collect()
        })
        .unwrap_or_default()
}

fn listening_owner(port: u16) -> Option<PortOwner> {
    all_tcp_listening()
        .into_iter()
        .find(|l| l.socket.port() == port)
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
