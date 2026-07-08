#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use db::DbConn;
use rusqlite::Connection;
use std::sync::Mutex;

fn main() {
    let conn = Connection::open("yam.db").expect("Failed to open database");
    let db_state = DbConn(Mutex::new(conn));

    tauri::Builder::default()
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![
            commands::fetch_schools,
            commands::fetch_score_lines,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
