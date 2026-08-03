#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod diagnostics;

use db::DbConn;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    diagnostics::init();
    let original_panic_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(String::as_str)
            })
            .unwrap_or("non-string panic payload");
        let location = panic_info
            .location()
            .map(|location| {
                format!(
                    "{}:{}:{}",
                    location.file(),
                    location.line(),
                    location.column()
                )
            })
            .unwrap_or_else(|| "unknown".to_string());
        diagnostics::log(
            "ERROR",
            "panic",
            &format!("payload={payload} location={location}"),
        );
        original_panic_hook(panic_info);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_path = app
                .path()
                .resolve(".yam/data/yam-desktop.db", tauri::path::BaseDirectory::Home)?;

            let (conn, database_status) =
                db::open_or_recover_database(&db_path).map_err(|err| {
                    diagnostics::log("ERROR", "database_open_failed", &err);
                    format!("数据库启动失败: {err}")
                })?;
            if database_status.recovered {
                diagnostics::log(
                    "WARN",
                    "database_recovered",
                    "database recovery completed; original database was backed up",
                );
            }
            app.manage(DbConn(Mutex::new(conn)));
            app.manage(database_status);
            app.manage(commands::CrawlState::default());
            app.manage(commands::UpdateCatalogState::default());
            app.manage(commands::ExportState::default());

            // 主窗口由 tauri.conf.json 配置自动创建；
            // debug 模式通过 additionalBrowserArgs 启用远程调试端口 9223。
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_database_status,
            commands::get_backend_runtime_status,
            commands::get_diagnostics_info,
            commands::open_diagnostics_directory,
            commands::fetch_schools,
            commands::fetch_score_lines,
            commands::fetch_workspace_data,
            commands::fetch_workspace_schools_page,
            commands::fetch_workspace_departments,
            commands::fetch_workspace_plans,
            commands::fetch_workspace_plans_page,
            commands::fetch_workspace_filter_options,
            commands::fetch_available_majors,
            commands::fetch_favorites,
            commands::toggle_favorite,
            commands::fetch_plan_favorites,
            commands::toggle_plan_favorite,
            commands::remove_plan_favorite,
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
            commands::refresh_login,
            commands::clear_login,
            commands::search_majors,
            commands::update_majors_catalog,
            commands::cancel_catalog_update,
            commands::reset_catalog_update,
            commands::get_catalog_update_progress,
            commands::read_majors_catalog,
            commands::get_export_settings,
            commands::choose_export_directory,
            commands::clear_export_directory,
            commands::start_plan_export,
            commands::get_export_progress,
            commands::cancel_export,
            commands::export_file,
            commands::export_excel,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            diagnostics::log("ERROR", "tauri_run_failed", &err.to_string());
            eprintln!("Tauri 应用启动或运行失败: {err}");
        });
}
