mod ide;
mod mcp_server;
mod ports;
mod process_manager;

use process_manager::ProcessManagerState;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let process_state = ProcessManagerState::default();
    let shared_map = process_state.0.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(process_state)
        .setup(move |app| {
            mcp_server::spawn_mcp_server(app.handle().clone(), shared_map.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            process_manager::start_process,
            process_manager::stop_process,
            process_manager::is_process_running,
            ports::check_port,
            ide::detect_ides,
            ide::open_in_ide,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
