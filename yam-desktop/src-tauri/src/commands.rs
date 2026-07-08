use crate::db::{get_score_lines, get_schools, DbConn, ScoreLine, School};
use tauri::State;

#[tauri::command]
pub fn fetch_schools(state: State<'_, DbConn>, major_code: String) -> Vec<School> {
    let conn = state.0.lock().unwrap();
    get_schools(&conn, &major_code)
}

#[tauri::command]
pub fn fetch_score_lines(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
) -> Vec<ScoreLine> {
    let conn = state.0.lock().unwrap();
    get_score_lines(&conn, &school_id, &major_code)
}
