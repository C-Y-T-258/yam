use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub struct DbConn(pub Mutex<Connection>);

#[derive(Serialize, Deserialize)]
pub struct School {
    pub school_id: String,
    pub name: String,
    pub province: Option<String>,
    pub level: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ScoreLine {
    pub year: i32,
    pub total: Option<i32>,
    pub politics: Option<i32>,
    pub english: Option<i32>,
    pub special_one: Option<i32>,
    pub special_two: Option<i32>,
    pub department_name: Option<String>,
}

pub fn get_schools(conn: &Connection, major_code: &str) -> Vec<School> {
    let mut stmt = conn
        .prepare("SELECT school_id, name, province, level FROM schools WHERE major_code = ?1 ORDER BY name")
        .unwrap();
    let rows = stmt
        .query_map([major_code], |row| {
            Ok(School {
                school_id: row.get(0)?,
                name: row.get(1)?,
                province: row.get(2)?,
                level: row.get(3)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_score_lines(conn: &Connection, school_id: &str, major_code: &str) -> Vec<ScoreLine> {
    let mut stmt = conn
        .prepare(
            "SELECT sl.year, sl.total, sl.politics, sl.english, sl.special_one, sl.special_two, d.name
             FROM score_lines sl
             LEFT JOIN departments d ON sl.department_id = d.department_id
             WHERE sl.school_id = ?1 AND sl.major_code = ?2
             ORDER BY sl.year DESC",
        )
        .unwrap();
    let rows = stmt
        .query_map([school_id, major_code], |row| {
            Ok(ScoreLine {
                year: row.get(0)?,
                total: row.get(1)?,
                politics: row.get(2)?,
                english: row.get(3)?,
                special_one: row.get(4)?,
                special_two: row.get(5)?,
                department_name: row.get(6)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}
