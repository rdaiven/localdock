use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicProcessIdList,
    JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_BASIC_PROCESS_ID_LIST, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct SendHandle(HANDLE);
unsafe impl Send for SendHandle {}

pub(crate) struct ManagedProcess {
    child: std::process::Child,
    job: SendHandle,
    stopping: Arc<AtomicBool>,
}

/// A start that's still spawning — the OS process may not exist yet, but a
/// concurrent stop_project call still needs something to cancel.
pub(crate) struct PendingStart {
    cancel_requested: Arc<AtomicBool>,
}

pub(crate) enum Slot {
    Pending(PendingStart),
    Running(ManagedProcess),
}

pub type SharedProcessMap = Arc<Mutex<HashMap<String, Slot>>>;

#[derive(Default, Clone)]
pub struct ProcessManagerState(pub SharedProcessMap);

#[derive(Clone, Serialize)]
struct ProcessLogPayload {
    #[serde(rename = "projectId")]
    project_id: String,
    stream: &'static str,
    line: String,
}

#[derive(Clone, Serialize)]
struct ProcessExitedPayload {
    #[serde(rename = "projectId")]
    project_id: String,
    code: Option<i32>,
}

fn create_job_for_kill_on_close() -> Result<HANDLE, String> {
    unsafe {
        let job = CreateJobObjectW(None, None).map_err(|e| e.to_string())?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
        .map_err(|e| e.to_string())?;
        Ok(job)
    }
}

/// Every process id currently assigned to `job`, including grandchildren.
/// Used to confirm a bound port actually belongs to something *we* spawned,
/// not just any process that happens to be listening on it.
fn job_process_ids(job: HANDLE) -> Vec<u32> {
    const MAX_PIDS: usize = 256;
    let header_size = std::mem::size_of::<JOBOBJECT_BASIC_PROCESS_ID_LIST>();
    let buf_size = header_size + (MAX_PIDS - 1) * std::mem::size_of::<usize>();
    let mut buf: Vec<u8> = vec![0u8; buf_size];

    unsafe {
        let ptr = buf.as_mut_ptr() as *mut core::ffi::c_void;
        let mut returned: u32 = 0;
        let ok = QueryInformationJobObject(
            Some(job),
            JobObjectBasicProcessIdList,
            ptr,
            buf.len() as u32,
            Some(&mut returned),
        );
        if ok.is_err() {
            return Vec::new();
        }
        let list = &*(ptr as *const JOBOBJECT_BASIC_PROCESS_ID_LIST);
        let count = (list.NumberOfProcessIdsInList as usize).min(MAX_PIDS);
        let pid_ptr = list.ProcessIdList.as_ptr();
        (0..count).map(|i| *pid_ptr.add(i) as u32).collect()
    }
}

/// True if `port` is currently bound by a process that belongs to the job
/// object tracking `project_id` (i.e. the process we spawned, or something
/// it forked) — not just "some process, anywhere, is using this port".
pub fn port_owned_by_project(state: &SharedProcessMap, project_id: &str, port: u16) -> bool {
    let owner_pid = match crate::ports::owner_pid(port) {
        Some(pid) => pid,
        None => return false,
    };
    let map = match state.lock() {
        Ok(m) => m,
        Err(_) => return false,
    };
    match map.get(project_id) {
        Some(Slot::Running(managed)) => job_process_ids(managed.job.0).contains(&owner_pid),
        _ => false,
    }
}

pub fn start_process_shared(
    app: &AppHandle,
    state: &SharedProcessMap,
    project_id: String,
    command: String,
    cwd: String,
    env: HashMap<String, String>,
) -> Result<u32, String> {
    let cancel_requested = Arc::new(AtomicBool::new(false));

    {
        let mut map = state.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = map.remove(&project_id) {
            match existing {
                Slot::Running(running) => {
                    running.stopping.store(true, Ordering::SeqCst);
                    unsafe {
                        let _ = TerminateJobObject(running.job.0, 1);
                        let _ = CloseHandle(running.job.0);
                    }
                }
                Slot::Pending(pending) => {
                    // A start for this id was already in flight — tell it to
                    // self-cancel once it finishes spawning, so it doesn't
                    // clobber the attempt we're about to register.
                    pending.cancel_requested.store(true, Ordering::SeqCst);
                }
            }
        }
        map.insert(
            project_id.clone(),
            Slot::Pending(PendingStart { cancel_requested: cancel_requested.clone() }),
        );
    }

    let spawn_result: Result<(std::process::Child, HANDLE, HANDLE), String> = (|| {
        let mut child = Command::new("cmd")
            .args(["/C", &command])
            .current_dir(&cwd)
            .envs(env)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Couldn't start this project: {e}"))?;

        let raw_handle = child.as_raw_handle();
        let process_handle = HANDLE(raw_handle);

        let job = match create_job_for_kill_on_close() {
            Ok(j) => j,
            Err(e) => {
                let _ = child.kill();
                return Err(e);
            }
        };
        unsafe {
            if let Err(e) = AssignProcessToJobObject(job, process_handle) {
                let _ = child.kill();
                let _ = CloseHandle(job);
                return Err(e.to_string());
            }
        }
        Ok((child, process_handle, job))
    })();

    let (mut child, process_handle, job) = match spawn_result {
        Ok(v) => v,
        Err(e) => {
            // Remove our own Pending marker — but only if nobody has already
            // superseded it with a newer attempt.
            if let Ok(mut map) = state.lock() {
                let still_ours = matches!(
                    map.get(&project_id),
                    Some(Slot::Pending(p)) if Arc::ptr_eq(&p.cancel_requested, &cancel_requested)
                );
                if still_ours {
                    map.remove(&project_id);
                }
            }
            return Err(e);
        }
    };

    if cancel_requested.load(Ordering::SeqCst) {
        let _ = child.kill();
        unsafe {
            let _ = TerminateJobObject(job, 1);
            let _ = CloseHandle(job);
        }
        return Err("Cancelled before it finished starting.".to_string());
    }

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stopping = Arc::new(AtomicBool::new(false));

    if let Some(stdout) = stdout {
        let app = app.clone();
        let project_id = project_id.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().flatten() {
                let _ = app.emit(
                    "process-log",
                    ProcessLogPayload { project_id: project_id.clone(), stream: "stdout", line },
                );
            }
        });
    }

    if let Some(stderr) = stderr {
        let app = app.clone();
        let project_id = project_id.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().flatten() {
                let _ = app.emit(
                    "process-log",
                    ProcessLogPayload { project_id: project_id.clone(), stream: "stderr", line },
                );
            }
        });
    }

    // Blocks until the process actually exits — immediate notification, no
    // polling. On a genuine (unrequested) exit it also removes our own map
    // entry, so a crashed project stops being reported as running.
    {
        let app = app.clone();
        let project_id = project_id.clone();
        let stopping = stopping.clone();
        let state = state.clone();
        let process_handle = SendHandle(process_handle);
        std::thread::spawn(move || {
            let process_handle: SendHandle = process_handle;
            let process_handle = process_handle.0;
            unsafe {
                let _ = WaitForSingleObject(process_handle, INFINITE);
            }
            let was_stopping = stopping.load(Ordering::SeqCst);
            if !was_stopping {
                if let Ok(mut map) = state.lock() {
                    let still_ours = matches!(
                        map.get(&project_id),
                        Some(Slot::Running(managed)) if Arc::ptr_eq(&managed.stopping, &stopping)
                    );
                    if still_ours {
                        map.remove(&project_id);
                    }
                }
                let mut exit_code: u32 = 0;
                unsafe {
                    let _ = GetExitCodeProcess(process_handle, &mut exit_code);
                }
                let _ = app.emit(
                    "process-exited",
                    ProcessExitedPayload { project_id: project_id.clone(), code: Some(exit_code as i32) },
                );
            }
        });
    }

    {
        let mut map = state.lock().map_err(|e| e.to_string())?;
        let still_ours = matches!(
            map.get(&project_id),
            Some(Slot::Pending(p)) if Arc::ptr_eq(&p.cancel_requested, &cancel_requested)
        );
        if still_ours {
            map.insert(project_id, Slot::Running(ManagedProcess { child, job: SendHandle(job), stopping }));
        } else {
            // Cancelled or superseded while we were spawning — set `stopping`
            // first so the watcher thread above suppresses its exit event.
            stopping.store(true, Ordering::SeqCst);
            let _ = child.kill();
            unsafe {
                let _ = TerminateJobObject(job, 1);
                let _ = CloseHandle(job);
            }
        }
    }

    Ok(pid)
}

pub fn stop_process_shared(state: &SharedProcessMap, project_id: String) -> Result<(), String> {
    let mut map = state.lock().map_err(|e| e.to_string())?;
    match map.get_mut(&project_id) {
        Some(Slot::Pending(pending)) => {
            pending.cancel_requested.store(true, Ordering::SeqCst);
            map.remove(&project_id);
            Ok(())
        }
        Some(Slot::Running(managed)) => {
            managed.stopping.store(true, Ordering::SeqCst);
            let job_handle = managed.job.0;
            if let Err(e) = unsafe { TerminateJobObject(job_handle, 0) } {
                // Leave the entry in the map — it's still tracked and the
                // caller can see/retry it, instead of silently losing it.
                managed.stopping.store(false, Ordering::SeqCst);
                return Err(e.to_string());
            }
            if let Some(Slot::Running(mut managed)) = map.remove(&project_id) {
                unsafe {
                    let _ = CloseHandle(managed.job.0);
                }
                let _ = managed.child.wait();
            }
            Ok(())
        }
        None => Ok(()),
    }
}

pub fn list_running_shared(state: &SharedProcessMap) -> Vec<String> {
    match state.lock() {
        Ok(map) => map
            .iter()
            .filter_map(|(id, slot)| matches!(slot, Slot::Running(_)).then(|| id.clone()))
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn start_process(
    app: AppHandle,
    state: State<ProcessManagerState>,
    project_id: String,
    command: String,
    cwd: String,
    env: HashMap<String, String>,
) -> Result<u32, String> {
    start_process_shared(&app, &state.0, project_id, command, cwd, env)
}

#[tauri::command]
pub fn stop_process(state: State<ProcessManagerState>, project_id: String) -> Result<(), String> {
    stop_process_shared(&state.0, project_id)
}

#[tauri::command]
pub fn is_process_running(state: State<ProcessManagerState>, project_id: String) -> Result<bool, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    Ok(matches!(map.get(&project_id), Some(Slot::Running(_))))
}

#[tauri::command]
pub fn list_running_processes(state: State<ProcessManagerState>) -> Result<Vec<String>, String> {
    Ok(list_running_shared(&state.0))
}

#[tauri::command]
pub fn port_belongs_to_project(
    state: State<ProcessManagerState>,
    project_id: String,
    port: u16,
) -> bool {
    port_owned_by_project(&state.0, &project_id, port)
}
