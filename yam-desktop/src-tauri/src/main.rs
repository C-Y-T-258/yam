#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use db::DbConn;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = app
                .path()
                .resolve(".yam/data/yam-desktop.db", tauri::path::BaseDirectory::Home)?;

            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let conn = Connection::open(&db_path).expect("Failed to open database");
            db::init_schema(&conn).expect("Failed to initialize database schema");
            db::seed_data(&conn).expect("Failed to seed database");
            app.manage(DbConn(Mutex::new(conn)));
            app.manage(commands::CrawlState::default());
            app.manage(commands::UpdateCatalogState::default());

            // 主窗口由 tauri.conf.json 配置自动创建；
            // debug 模式通过 additionalBrowserArgs 启用远程调试端口 9222。
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::fetch_schools,
            commands::fetch_score_lines,
            commands::fetch_workspace_data,
            commands::fetch_workspace_filter_options,
            commands::fetch_available_majors,
            commands::fetch_favorites,
            commands::toggle_favorite,
            commands::fetch_recent_views,
            commands::add_recent_view_command,
            commands::clear_recent_views_command,
            commands::sync_workspace_data,
            commands::run_crawl,
            commands::get_crawl_progress,
            commands::cancel_crawl,
            commands::reset_crawl,
            commands::check_login_status,
            commands::login_yanzhao,
            commands::search_majors,
            commands::update_majors_catalog,
            commands::cancel_catalog_update,
            commands::reset_catalog_update,
            commands::get_catalog_update_progress,
            commands::read_majors_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
