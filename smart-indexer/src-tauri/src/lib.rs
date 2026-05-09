mod commands;
mod config;
mod sitemap;
mod google_api;
mod quota;
mod types;
mod error;

use commands::*;
use log::info;
use std::panic;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    panic::set_hook(Box::new(|panic_info| {
        log::error!("Application panicked: {}", panic_info);
    }));

    info!("SmartIndexer starting...");

    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path_resolver().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_dir).ok();
            info!("App data directory: {:?}", app_dir);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sites,
            get_site,
            create_site,
            update_site,
            delete_site,
            get_urls,
            fetch_urls,
            reset_urls,
            mark_indexed,
            get_credentials,
            delete_credential,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
