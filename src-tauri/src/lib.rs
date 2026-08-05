mod discover;
mod ide;
mod mcp_server;
mod ports;
mod process_manager;
mod project_store;
mod tray;

use process_manager::ProcessManagerState;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Fully exit the app. The window's close button only hides to the tray, so
/// an in-app quit (Settings) must exist alongside the tray menu — a user
/// whose tray icon is buried in the overflow area still needs a way out.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let process_state = ProcessManagerState::default();
    let shared_map = process_state.0.clone();
    let shared_logs = process_state.1.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(process_state)
        .setup(move |app| {
            mcp_server::spawn_mcp_server(app.handle().clone(), shared_map.clone(), shared_logs.clone());
            tray::setup_tray(app.handle())?;
            if !tray::should_start_minimized(app.handle()) {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if tray::should_close_to_tray(window.app_handle()) {
                    // Hide to tray: LocalDock keeps managing processes in
                    // the background; Quit lives in the tray menu/Settings.
                    let _ = window.hide();
                    api.prevent_close();
                } else {
                    // User opted out of tray-lingering — closing the window
                    // is a real quit (job objects stop every child server).
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            quit_app,
            process_manager::start_process,
            process_manager::stop_process,
            process_manager::is_process_running,
            process_manager::list_running_processes,
            process_manager::port_belongs_to_project,
            process_manager::get_project_stats,
            ports::check_port,
            ide::detect_ides,
            ide::open_in_ide,
            ide::open_terminal,
            discover::scan_running_dev_servers,
            tray::update_tray_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
