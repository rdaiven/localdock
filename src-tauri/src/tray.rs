use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

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

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open LocalDock", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("LocalDock")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
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
