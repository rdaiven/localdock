use std::path::PathBuf;

use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct DetectedIde {
    id: String,
    name: String,
    path: String,
}

struct IdeCandidate {
    id: &'static str,
    name: &'static str,
    relative_paths: &'static [&'static str],
}

const CANDIDATES: &[IdeCandidate] = &[
    IdeCandidate {
        id: "vscode",
        name: "VS Code",
        relative_paths: &["Programs\\Microsoft VS Code\\Code.exe"],
    },
    IdeCandidate {
        id: "cursor",
        name: "Cursor",
        relative_paths: &["Programs\\cursor\\Cursor.exe"],
    },
    IdeCandidate {
        id: "windsurf",
        name: "Windsurf",
        relative_paths: &["Programs\\Windsurf\\Windsurf.exe"],
    },
    IdeCandidate {
        id: "zed",
        name: "Zed",
        relative_paths: &["Programs\\Zed\\Zed.exe"],
    },
];

#[tauri::command]
pub fn detect_ides() -> Vec<DetectedIde> {
    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(v) => PathBuf::from(v),
        Err(_) => return Vec::new(),
    };

    let mut found = Vec::new();
    for candidate in CANDIDATES {
        for rel in candidate.relative_paths {
            let full = local_app_data.join(rel);
            if full.exists() {
                found.push(DetectedIde {
                    id: candidate.id.to_string(),
                    name: candidate.name.to_string(),
                    path: full.to_string_lossy().to_string(),
                });
                break;
            }
        }
    }
    found
}

#[tauri::command]
pub fn open_in_ide(ide_path: String, project_dir: String) -> Result<(), String> {
    std::process::Command::new(ide_path)
        .arg(project_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Open an interactive terminal in `project_dir` — Windows Terminal if it's
/// installed (on PATH), otherwise a plain cmd.exe window.
///
/// The working directory is set through the process-spawn API, never
/// interpolated into a command string: a folder name containing cmd.exe
/// metacharacters (`&`, `^`, …) must stay data, not become shell input.
#[tauri::command]
pub fn open_terminal(project_dir: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

    let dir = std::path::Path::new(&project_dir);
    if !dir.is_dir() {
        return Err(format!("Not a folder: {project_dir}"));
    }

    // wt passes -d as a plain argv entry — no shell parsing involved.
    if std::process::Command::new("wt")
        .args(["-d", &project_dir])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // CREATE_NEW_CONSOLE so the fallback opens its own window even when the
    // parent (a dev build) already owns a console.
    std::process::Command::new("cmd")
        .arg("/K")
        .current_dir(dir)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
