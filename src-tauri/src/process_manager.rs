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
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const STILL_ACTIVE: u32 = 259;

struct SendHandle(HANDLE);
unsafe impl Send for SendHandle {}

pub(crate) struct ManagedProcess {
    child: std::process::Child,
    job: SendHandle,
    stopping: Arc<AtomicBool>,
}

pub type SharedProcessMap = Arc<Mutex<HashMap<String, ManagedProcess>>>;

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

/// Core start logic shared by the Tauri command and the MCP tool handler —
/// both drive the same real process map, so a project started by an AI
/// agent shows up in the GUI and vice versa.
pub fn start_process_shared(
    app: &AppHandle,
    state: &SharedProcessMap,
    project_id: String,
    command: String,
    cwd: String,
    env: HashMap<String, String>,
) -> Result<u32, String> {
    let mut map = state.lock().map_err(|e| e.to_string())?;

    if let Some(existing) = map.remove(&project_id) {
        existing.stopping.store(true, Ordering::SeqCst);
        unsafe {
            let _ = TerminateJobObject(existing.job.0, 1);
            let _ = CloseHandle(existing.job.0);
        }
    }

    let mut child = Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&cwd)
        .envs(env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Couldn't start this project: {e}"))?;

    let pid = child.id();
    let raw_handle = child.as_raw_handle();
    let process_handle = HANDLE(raw_handle);

    let job = create_job_for_kill_on_close()?;
    unsafe {
        AssignProcessToJobObject(job, process_handle).map_err(|e| e.to_string())?;
    }

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

    {
        let app = app.clone();
        let project_id = project_id.clone();
        let stopping = stopping.clone();
        let process_handle = SendHandle(process_handle);
        std::thread::spawn(move || {
            // Polls the raw process handle instead of Child::wait(), since the Child itself
            // is owned by the managed-process map, not this thread.
            let process_handle: SendHandle = process_handle;
            let process_handle = process_handle.0;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(400));
                let mut still_running = true;
                unsafe {
                    use windows::Win32::System::Threading::GetExitCodeProcess;
                    let mut exit_code: u32 = 0;
                    if GetExitCodeProcess(process_handle, &mut exit_code).is_ok() {
                        if exit_code != STILL_ACTIVE {
                            still_running = false;
                            if !stopping.load(Ordering::SeqCst) {
                                let _ = app.emit(
                                    "process-exited",
                                    ProcessExitedPayload {
                                        project_id: project_id.clone(),
                                        code: Some(exit_code as i32),
                                    },
                                );
                            }
                        }
                    }
                }
                if !still_running {
                    break;
                }
            }
        });
    }

    map.insert(project_id, ManagedProcess { child, job: SendHandle(job), stopping });

    Ok(pid)
}

pub fn stop_process_shared(state: &SharedProcessMap, project_id: String) -> Result<(), String> {
    let mut map = state.lock().map_err(|e| e.to_string())?;
    if let Some(mut managed) = map.remove(&project_id) {
        managed.stopping.store(true, Ordering::SeqCst);
        unsafe {
            TerminateJobObject(managed.job.0, 0).map_err(|e| e.to_string())?;
            let _ = CloseHandle(managed.job.0);
        }
        let _ = managed.child.wait();
    }
    Ok(())
}

pub fn list_running_shared(state: &SharedProcessMap) -> Vec<String> {
    match state.lock() {
        Ok(map) => map.keys().cloned().collect(),
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
    Ok(map.contains_key(&project_id))
}
