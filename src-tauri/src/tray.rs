use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

const TRAY_ID: &str = "main";

/// The slice of settings.json this side of the app reads. The file's schema
/// is OWNED by the frontend (src/lib/settingsApi.ts, PersistedSettings) —
/// this struct mirrors just the keys Rust needs and must be kept in sync
/// with it; settingsApi.ts carries the matching cross-reference comment.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PersistedSettings {
    start_minimized: bool,
    close_to_tray: bool,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            start_minimized: false,
            close_to_tray: true,
        }
    }
}

/// Best-effort read: a missing/unreadable settings file just means "use the
/// defaults", same as the frontend's own behavior.
fn read_settings(app: &AppHandle) -> PersistedSettings {
    let Ok(dir) = app.path().app_data_dir() else {
        return PersistedSettings::default();
    };
    let Ok(raw) = std::fs::read_to_string(dir.join("settings.json")) else {
        return PersistedSettings::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Whether to start hidden in the tray rather than showing the window.
pub fn should_start_minimized(app: &AppHandle) -> bool {
    read_settings(app).start_minimized
}

/// Whether the window close button hides to the tray (true, the default) or
/// fully quits the app (false). Read fresh on every close so a toggle in
/// Settings takes effect without a restart.
pub fn should_close_to_tray(app: &AppHandle) -> bool {
    read_settings(app).close_to_tray
}

/// One project's line in the tray menu, pushed from the frontend (which
/// owns the project list) whenever names or run-states change.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayProjectEntry {
    pub id: String,
    pub name: String,
    pub running: bool,
}

fn build_menu(app: &AppHandle, projects: &[TrayProjectEntry]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    // cap the list so a huge dock doesn't produce a comical tray menu
    for p in projects.iter().take(12) {
        let label = if p.running {
            format!("■  Stop {}", p.name)
        } else {
            format!("▶  Start {}", p.name)
        };
        menu.append(&MenuItem::with_id(app, format!("toggle:{}", p.id), label, true, None::<&str>)?)?;
    }
    if !projects.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&MenuItem::with_id(app, "open", "Open LocalDock", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;
    Ok(menu)
}

/// Replace the tray menu with fresh per-project start/stop entries.
#[tauri::command]
pub fn update_tray_menu(app: AppHandle, projects: Vec<TrayProjectEntry>) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(()); // tray failed to initialize — nothing to update
    };
    let menu = build_menu(&app, &projects).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &[])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("LocalDock")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            other => {
                if let Some(project_id) = other.strip_prefix("toggle:") {
                    // The frontend owns start/stop logic — hand it the id.
                    let _ = app.emit("tray-toggle-project", project_id.to_string());
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
