//! Best-effort discovery of dev servers LocalDock didn't spawn itself —
//! e.g. something started directly via a shell (including another tool's
//! Bash-style background task) instead of through LocalDock's own
//! start_project. We can't attribute these with certainty, only suggest.
//!
//! The technique: enumerate every listening TCP port (already have this via
//! the `listeners` crate), then for each owning PID, read its *real* current
//! working directory straight out of its PEB (Process Environment Block) —
//! the same approach tools like Process Explorer use to show a process's
//! "Current Directory". This only works for processes we're allowed to open
//! (same user, not elevated/protected) and only for native x64 processes —
//! anything else just yields no cwd, which callers treat as "skip", never
//! as a crash.

use std::ffi::c_void;

use serde::Serialize;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};

// Stable, widely-documented x64 offsets (unchanged since Windows XP x64) —
// see PEB.ProcessParameters and RTL_USER_PROCESS_PARAMETERS.CurrentDirectory.
const PEB_PROCESS_PARAMETERS_OFFSET: usize = 0x20;
const CURRENT_DIRECTORY_LENGTH_OFFSET: usize = 0x38;
const CURRENT_DIRECTORY_BUFFER_OFFSET: usize = 0x40;

#[repr(C)]
struct ProcessBasicInformation {
    exit_status: i32,
    peb_base_address: usize,
    affinity_mask: usize,
    base_priority: i32,
    unique_process_id: usize,
    inherited_from_unique_process_id: usize,
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryInformationProcess(
        process_handle: HANDLE,
        info_class: u32,
        info: *mut c_void,
        info_len: u32,
        return_len: *mut u32,
    ) -> i32;
}

fn read_bytes(handle: HANDLE, address: usize, buf: &mut [u8]) -> bool {
    if address == 0 {
        return false;
    }
    unsafe {
        ReadProcessMemory(handle, address as *const c_void, buf.as_mut_ptr() as *mut c_void, buf.len(), None)
    }
    .is_ok()
}

fn read_usize(handle: HANDLE, address: usize) -> Option<usize> {
    let mut buf = [0u8; 8];
    read_bytes(handle, address, &mut buf).then(|| usize::from_le_bytes(buf))
}

/// The real current working directory of `pid`, or `None` if it can't be
/// read (different user, elevated/protected process, 32-bit process, or
/// any other failure along the chain) — never panics.
fn process_cwd(pid: u32) -> Option<String> {
    use windows::core::BOOL;
    use windows::Win32::System::Threading::IsWow64Process;

    let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) }.ok()?;
    let cwd = (|| {
        // The PEB offsets below are for native x64 processes only. A WOW64
        // (32-bit) process has a differently-laid-out PEB at that address —
        // reading it wouldn't fail, it would "succeed" with garbage that
        // could look like a plausible path. Skip such processes entirely
        // rather than surface a wrong directory as a suggestion.
        let mut is_wow64 = BOOL(0);
        if unsafe { IsWow64Process(handle, &mut is_wow64) }.is_err() || is_wow64.as_bool() {
            return None;
        }
        let mut pbi = ProcessBasicInformation {
            exit_status: 0,
            peb_base_address: 0,
            affinity_mask: 0,
            base_priority: 0,
            unique_process_id: 0,
            inherited_from_unique_process_id: 0,
        };
        let mut return_len = 0u32;
        let status = unsafe {
            NtQueryInformationProcess(
                handle,
                0, // ProcessBasicInformation
                &mut pbi as *mut _ as *mut c_void,
                std::mem::size_of::<ProcessBasicInformation>() as u32,
                &mut return_len,
            )
        };
        if status != 0 || pbi.peb_base_address == 0 {
            return None;
        }

        let params_ptr = read_usize(handle, pbi.peb_base_address + PEB_PROCESS_PARAMETERS_OFFSET)?;

        let mut len_buf = [0u8; 2];
        if !read_bytes(handle, params_ptr + CURRENT_DIRECTORY_LENGTH_OFFSET, &mut len_buf) {
            return None;
        }
        let len_bytes = u16::from_le_bytes(len_buf) as usize;
        if len_bytes == 0 || len_bytes > 32_768 {
            return None;
        }

        let buffer_ptr = read_usize(handle, params_ptr + CURRENT_DIRECTORY_BUFFER_OFFSET)?;

        let mut utf16_bytes = vec![0u8; len_bytes];
        if !read_bytes(handle, buffer_ptr, &mut utf16_bytes) {
            return None;
        }
        let utf16: Vec<u16> = utf16_bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        let path = String::from_utf16_lossy(&utf16);
        let trimmed = path.trim_end_matches('\\').to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })();
    let _ = unsafe { CloseHandle(handle) };
    cwd
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredServer {
    pub pid: u32,
    pub port: u16,
    pub process_name: String,
    pub cwd: Option<String>,
}

// Common noise that's virtually never someone's dev server, worth filtering
// out so the suggestion list stays useful instead of full of browsers/OS bits.
const IGNORED_PROCESS_NAMES: &[&str] = &[
    "svchost.exe",
    "System",
    "Idle",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "dllhost.exe",
    "spoolsv.exe",
];

#[tauri::command]
pub fn scan_running_dev_servers() -> Vec<DiscoveredServer> {
    let own_pid = std::process::id();
    let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut results = Vec::new();

    // ports::all_tcp_listening is the shared definition of "listening" —
    // same filter the port-conflict checks use, so the two can't diverge.
    for l in crate::ports::all_tcp_listening() {
        // Never discover ourselves: LocalDock's own MCP server listens on a
        // TCP port too, and suggesting it as an addable project (named after
        // whatever our cwd happens to be) is pure confusion.
        if l.process.pid == own_pid {
            continue;
        }
        if IGNORED_PROCESS_NAMES.contains(&l.process.name.as_str()) {
            continue;
        }
        if !seen_pids.insert(l.process.pid) {
            continue; // one cwd lookup per pid even if it's listening on several ports
        }
        results.push(DiscoveredServer {
            pid: l.process.pid,
            port: l.socket.port(),
            process_name: l.process.name.clone(),
            cwd: process_cwd(l.process.pid),
        });
    }

    results
}
