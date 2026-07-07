mod commands;
mod core;
mod error;

use commands::{backup_commands, file_commands, subscription_commands};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            file_commands::read_text_file,
            file_commands::write_text_file,
            backup_commands::list_backups,
            backup_commands::create_backup_snapshot,
            backup_commands::restore_backup,
            backup_commands::export_backup_package,
            subscription_commands::fetch_subscription_url
        ])
        .run(tauri::generate_context!())
        .expect("failed to run YAML proxy editor");
}
