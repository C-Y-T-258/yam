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

#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspaceSchool {
    pub school_id: String,
    pub major_code: String,
    pub name: String,
    pub province: String,
    pub level: String,
    pub min_score: i32,
    pub enroll_count: i32,
    pub self_scoring: bool,
    pub doctoral_program: bool,
    pub double_first_class: bool,
    pub school_code: String,
    pub province_code: String,
    pub is_985: bool,
    pub is_211: bool,
    pub display_order: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspaceDepartment {
    pub department_id: i64,
    pub school_id: String,
    pub major_code: String,
    pub name: String,
    pub research_direction: String,
    pub exam_subjects: Vec<String>,
    pub study_mode: String,
    pub exam_type: String,
    pub special_plans: Vec<String>,
    pub years: Vec<WorkspaceYear>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspaceYear {
    pub year: i32,
    pub enroll_count: i32,
    pub min_score: i32,
    pub politics: i32,
    pub english: i32,
    pub math: i32,
    pub specialized: i32,
}

pub fn init_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(SCHEMA)?;
    migrate_schema(conn)?;
    Ok(())
}

pub fn migrate_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    // If the old workspace_schools table lacks major_code, drop workspace tables and recreate.
    // Favorites / recent_views are preserved.
    let has_major_code: bool = conn
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM pragma_table_info('workspace_schools') WHERE name = 'major_code'
            )",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !has_major_code {
        conn.execute_batch(
            "DROP TABLE IF EXISTS workspace_department_years;
             DROP TABLE IF EXISTS workspace_departments;
             DROP TABLE IF EXISTS workspace_schools;",
        )?;
        conn.execute_batch(SCHEMA)?;
    }

    // Add individual missing columns defensively.
    let add_if_missing = |conn: &Connection, table: &str, column: &str, def: &str| -> Result<(), rusqlite::Error> {
        let exists: bool = conn
            .query_row(
                &format!("SELECT EXISTS(SELECT 1 FROM pragma_table_info('{}') WHERE name = ?)", table),
                [column],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !exists {
            conn.execute(
                &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, def),
                [],
            )?;
        }
        Ok(())
    };

    add_if_missing(conn, "workspace_schools", "self_scoring", "INTEGER NOT NULL DEFAULT 0")?;
    add_if_missing(conn, "workspace_schools", "doctoral_program", "INTEGER NOT NULL DEFAULT 0")?;
    add_if_missing(conn, "workspace_schools", "double_first_class", "INTEGER NOT NULL DEFAULT 0")?;
    add_if_missing(conn, "workspace_schools", "school_code", "TEXT NOT NULL DEFAULT ''")?;
    add_if_missing(conn, "workspace_schools", "province_code", "TEXT NOT NULL DEFAULT ''")?;
    add_if_missing(conn, "workspace_schools", "is_985", "INTEGER NOT NULL DEFAULT 0")?;
    add_if_missing(conn, "workspace_schools", "is_211", "INTEGER NOT NULL DEFAULT 0")?;
    add_if_missing(conn, "workspace_schools", "display_order", "INTEGER NOT NULL DEFAULT 0")?;
    add_if_missing(conn, "workspace_departments", "study_mode", "TEXT NOT NULL DEFAULT ''")?;
    add_if_missing(conn, "workspace_departments", "exam_type", "TEXT NOT NULL DEFAULT ''")?;
    add_if_missing(conn, "workspace_departments", "special_plans", "TEXT NOT NULL DEFAULT '[]'")?;

    Ok(())
}

const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS schools (
        school_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        province TEXT,
        level TEXT
    );

    CREATE TABLE IF NOT EXISTS score_lines (
        score_line_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        year INTEGER NOT NULL,
        total INTEGER,
        politics INTEGER,
        english INTEGER,
        special_one INTEGER,
        special_two INTEGER,
        department_name TEXT
    );

    CREATE TABLE IF NOT EXISTS workspace_schools (
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        name TEXT NOT NULL,
        province TEXT NOT NULL,
        level TEXT NOT NULL,
        min_score INTEGER NOT NULL,
        enroll_count INTEGER NOT NULL,
        self_scoring INTEGER NOT NULL DEFAULT 0,
        doctoral_program INTEGER NOT NULL DEFAULT 0,
        double_first_class INTEGER NOT NULL DEFAULT 0,
        school_code TEXT NOT NULL DEFAULT '',
        province_code TEXT NOT NULL DEFAULT '',
        is_985 INTEGER NOT NULL DEFAULT 0,
        is_211 INTEGER NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (school_id, major_code)
    );

    CREATE TABLE IF NOT EXISTS workspace_departments (
        department_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        name TEXT NOT NULL,
        research_direction TEXT NOT NULL,
        exam_subjects TEXT NOT NULL,
        study_mode TEXT NOT NULL DEFAULT '',
        exam_type TEXT NOT NULL DEFAULT '',
        special_plans TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (school_id, major_code) REFERENCES workspace_schools(school_id, major_code)
    );

    CREATE TABLE IF NOT EXISTS workspace_department_years (
        year_id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        enroll_count INTEGER NOT NULL,
        min_score INTEGER NOT NULL,
        politics INTEGER NOT NULL,
        english INTEGER NOT NULL,
        math INTEGER NOT NULL,
        specialized INTEGER NOT NULL,
        FOREIGN KEY (department_id) REFERENCES workspace_departments(department_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
        favorite_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        major_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(school_id, major_code)
    );

    CREATE TABLE IF NOT EXISTS recent_views (
        recent_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        major_name TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        UNIQUE(school_id, major_code)
    );
";

pub fn seed_data(conn: &Connection) -> Result<(), rusqlite::Error> {
    let has_data: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM workspace_schools LIMIT 1)",
        [],
        |row| row.get(0),
    )?;

    if has_data {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    let major_code = "085400";

    let schools = [
        ("1", "清华大学", "北京", "985 / 211 / 双一流", 672, 45, true, true, true),
        ("2", "北京大学", "北京", "985 / 211 / 双一流", 669, 40, true, true, true),
        ("3", "上海交通大学", "上海", "985 / 211 / 双一流", 660, 50, true, true, true),
        ("4", "浙江大学", "浙江", "985 / 211 / 双一流", 657, 48, true, true, true),
        ("5", "南京大学", "江苏", "985 / 211 / 双一流", 650, 42, true, true, true),
        ("6", "中国科学技术大学", "安徽", "985 / 211 / 双一流", 645, 35, true, true, true),
        ("7", "哈尔滨工业大学", "黑龙江", "985 / 211 / 双一流", 642, 60, false, true, true),
        ("8", "北京航空航天大学", "北京", "985 / 211 / 双一流", 641, 55, true, true, true),
        ("9", "同济大学", "上海", "985 / 211 / 双一流", 637, 45, true, true, true),
        ("10", "华中科技大学", "湖北", "985 / 211 / 双一流", 635, 50, false, true, true),
    ];

    for (id, name, province, level, min_score, enroll_count, self_scoring, doctoral_program, double_first_class) in schools {
        tx.execute(
            "INSERT OR IGNORE INTO workspace_schools
             (school_id, major_code, name, province, level, min_score, enroll_count, self_scoring, doctoral_program, double_first_class)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            [
                id,
                major_code,
                name,
                province,
                level,
                &min_score.to_string(),
                &enroll_count.to_string(),
                &(self_scoring as i32).to_string(),
                &(doctoral_program as i32).to_string(),
                &(double_first_class as i32).to_string(),
            ],
        )?;
    }

    let departments: Vec<(&str, &str, &str, &str, Vec<&str>, &str, &str, Vec<&str>, Vec<(i32, i32, i32, i32, i32, i32, i32)>)> = vec![
        (
            "1", "085400", "计算机科学与技术（学术学位）",
            "机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。",
            vec!["① 101 思想政治理论", "② 201 英语（一）", "③ 301 数学（一）", "④ 408 计算机学科专业基础"],
            "全日制", "统考", vec![],
            vec![(2026, 28, 681, 70, 70, 110, 120), (2025, 26, 672, 68, 68, 105, 115), (2024, 24, 663, 67, 67, 105, 114), (2023, 26, 654, 65, 65, 100, 110)],
        ),
        (
            "1", "085400", "人工智能（专业学位）",
            "机器学习、深度学习、计算机视觉、自然语言处理等。",
            vec!["① 101 思想政治理论", "② 204 英语（二）", "③ 302 数学（二）", "④ 408 计算机学科专业基础"],
            "全日制", "统考", vec![],
            vec![(2026, 45, 670, 68, 68, 105, 115)],
        ),
        (
            "1", "085400", "软件工程（专业学位）",
            "软件工程理论与方法、软件工程技术、软件项目管理等。",
            vec!["① 101 思想政治理论", "② 204 英语（二）", "③ 302 数学（二）", "④ 408 计算机学科专业基础"],
            "全日制", "统考", vec!["退役大学生士兵"],
            vec![(2026, 35, 665, 66, 66, 102, 112)],
        ),
        (
            "1", "085400", "控制科学与工程（学术学位）",
            "控制理论与控制工程、模式识别与智能系统、导航制导与控制等。",
            vec!["① 101 思想政治理论", "② 201 英语（一）", "③ 301 数学（一）", "④ 408 计算机学科专业基础"],
            "全日制", "统考", vec![],
            vec![(2026, 22, 658, 65, 65, 102, 112)],
        ),
    ];

    for (school_id, major_code, name, research_direction, exam_subjects, study_mode, exam_type, special_plans, years) in departments {
        tx.execute(
            "INSERT INTO workspace_departments
             (school_id, major_code, name, research_direction, exam_subjects, study_mode, exam_type, special_plans)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            [
                school_id,
                major_code,
                name,
                research_direction,
                &exam_subjects.join(","),
                study_mode,
                exam_type,
                &serde_json::to_string(&special_plans).unwrap_or_else(|_| "[]".to_string()),
            ],
        )?;
        let department_id = tx.last_insert_rowid();

        for (year, enroll_count, min_score, politics, english, math, specialized) in years {
            tx.execute(
                "INSERT INTO workspace_department_years
                 (department_id, year, enroll_count, min_score, politics, english, math, specialized)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                [
                    &department_id.to_string(),
                    &year.to_string(),
                    &enroll_count.to_string(),
                    &min_score.to_string(),
                    &politics.to_string(),
                    &english.to_string(),
                    &math.to_string(),
                    &specialized.to_string(),
                ],
            )?;
        }
    }

    tx.commit()
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
            "SELECT sl.year, sl.total, sl.politics, sl.english, sl.special_one, sl.special_two, sl.department_name
             FROM score_lines sl
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

struct ClassifiedSubjects {
    foreign: Vec<String>,
    business_one: Vec<String>,
    business_two: Vec<String>,
}

fn classify_exam_subjects(subjects: &[String]) -> ClassifiedSubjects {
    let mut foreign: Vec<String> = Vec::new();
    let mut business_one: Vec<String> = Vec::new();
    let mut business_two: Vec<String> = Vec::new();
    for s in subjects {
        let is_politics = s.contains("政治") || s.contains("思想");
        let is_math = s.contains("数学");
        let is_foreign = !is_politics && !is_math && (
            s.contains("英语") || s.contains("日语") || s.contains("俄语")
            || s.contains("法语") || s.contains("德语") || s.contains("外语")
        );
        if is_foreign && !foreign.iter().any(|e| e == s) {
            foreign.push(s.clone());
        } else if is_math && !business_one.iter().any(|m| m == s) {
            business_one.push(s.clone());
        } else if !is_politics && !is_foreign && !is_math && !business_two.iter().any(|sp| sp == s) {
            business_two.push(s.clone());
        }
    }
    foreign.sort();
    business_one.sort();
    business_two.sort();
    ClassifiedSubjects { foreign, business_one, business_two }
}

fn is_research_institute(name: &str) -> bool {
    ["研究院", "研究所", "科学院", "研究生院"]
        .iter()
        .any(|pat| name.contains(pat))
}

const YANZHAO_PROVINCE_ORDER: &[&str] = &[
    "北京", "天津", "河北", "山西", "内蒙古",
    "辽宁", "吉林", "黑龙江",
    "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东",
    "河南", "湖北", "湖南", "广东", "海南", "广西",
    "四川", "重庆", "贵州", "云南", "西藏",
    "陕西", "甘肃", "青海", "宁夏", "新疆",
];

const LEVEL_TAG_ORDER: &[&str] = &[
    "985", "211", "双一流", "自划线", "科研院所", "博士点", "普通本科",
];

fn region_provinces(region: &str) -> &'static [&'static str] {
    match region {
        "一区" => &[
            "北京", "天津", "河北", "山西", "辽宁", "吉林", "黑龙江",
            "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东",
            "河南", "湖北", "湖南", "广东", "重庆", "四川", "陕西",
        ],
        "二区" => &[
            "内蒙古", "广西", "海南", "贵州", "云南", "西藏",
            "甘肃", "青海", "宁夏", "新疆",
        ],
        _ => &[],
    }
}

#[derive(Default)]
pub struct WorkspaceFilterParams<'a> {
    pub province: Option<&'a str>,
    pub provinces: Option<&'a [&'a str]>,
    pub region_group: Option<&'a str>,
    pub levels: Option<&'a [&'a str]>,
    pub sort_by: Option<&'a str>,
    pub sort_order: Option<&'a str>,
    pub min_score_min: Option<i32>,
    pub min_score_max: Option<i32>,
    pub enroll_count_min: Option<i32>,
    pub enroll_count_max: Option<i32>,
    pub department_name: Option<&'a str>,
    pub study_modes: Option<&'a [&'a str]>,
    pub exam_types: Option<&'a [&'a str]>,
    pub self_scoring: Option<bool>,
    pub doctoral_program: Option<bool>,
    pub double_first_class: Option<bool>,
    pub special_plans: Option<&'a [&'a str]>,
    pub english_min: Option<i32>,
    pub english_max: Option<i32>,
    pub business_one_min: Option<i32>,
    pub business_one_max: Option<i32>,
    pub business_two_min: Option<i32>,
    pub business_two_max: Option<i32>,
    pub foreign_subjects: Option<&'a [&'a str]>,
    pub business_one_subjects: Option<&'a [&'a str]>,
    pub business_two_subjects: Option<&'a [&'a str]>,
}

pub fn get_workspace_schools(
    conn: &Connection,
    major_code: &str,
    params: WorkspaceFilterParams,
) -> Vec<WorkspaceSchool> {
    let order_field = match params.sort_by.unwrap_or("min_score") {
        "enroll_count" => "s.enroll_count",
        "name" => "s.name",
        "school_code" => "s.school_code",
        "default" => "s.display_order",
        _ => "s.min_score",
    };
    let order_dir = if params.sort_order.unwrap_or("desc") == "asc" { "ASC" } else { "DESC" };
    let order_sql = if order_field == "s.name" {
        format!("{} {}, s.min_score DESC", order_field, order_dir)
    } else if order_field == "s.display_order" || order_field == "s.school_code" {
        // 默认排序与国标代码排序始终升序，DESC 时翻转
        format!("{} {}, s.name ASC", order_field, order_dir)
    } else {
        format!("{} {}, s.name", order_field, order_dir)
    };

    // Build dynamic SQL and owned parameter values.
    let mut conditions: Vec<String> = vec!["s.major_code = ?1".to_string()];
    let mut values: Vec<rusqlite::types::Value> = vec![rusqlite::types::Value::Text(major_code.to_string())];
    let mut idx: usize = 2;

    fn push_opt(
        conditions: &mut Vec<String>,
        values: &mut Vec<rusqlite::types::Value>,
        idx: &mut usize,
        cond: &str,
        value: Option<rusqlite::types::Value>,
    ) {
        if let Some(v) = value {
            conditions.push(cond.replace("__IDX__", &idx.to_string()));
            values.push(v);
            *idx += 1;
        }
    }

    // Province filters: explicit list takes precedence, then single, then region group.
    let selected_provinces: Vec<&str> = if let Some(list) = params.provinces {
        list.to_vec()
    } else if let Some(region) = params.region_group {
        region_provinces(region).to_vec()
    } else if let Some(p) = params.province {
        vec![p]
    } else {
        vec![]
    };

    if !selected_provinces.is_empty() {
        let placeholders: Vec<String> = selected_provinces
            .iter()
            .map(|_| {
                let placeholder = format!("?{}", idx);
                idx += 1;
                placeholder
            })
            .collect();
        conditions.push(format!("s.province IN ({})", placeholders.join(",")));
        values.extend(selected_provinces.iter().map(|p| rusqlite::types::Value::Text((*p).to_string())));
    }

    if let Some(levels) = params.levels {
        if !levels.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for level in levels {
                match *level {
                    "自划线" => or_conditions.push("s.self_scoring = 1".to_string()),
                    "科研院所" => or_conditions.push("(s.name LIKE '%研究院%' OR s.name LIKE '%研究所%' OR s.name LIKE '%科学院%' OR s.name LIKE '%研究生院%')".to_string()),
                    "博士点" => or_conditions.push("s.doctoral_program = 1".to_string()),
                    "985" => or_conditions.push("s.is_985 = 1".to_string()),
                    "211" => or_conditions.push("s.is_211 = 1".to_string()),
                    "双一流" => or_conditions.push("s.double_first_class = 1".to_string()),
                    _ => {
                        or_conditions.push(format!("s.level LIKE ?{}", idx));
                        values.push(rusqlite::types::Value::Text(format!("%{}%", level)));
                        idx += 1;
                    }
                }
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }

    push_opt(&mut conditions, &mut values, &mut idx, "s.min_score >= ?__IDX__", params.min_score_min.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "s.min_score <= ?__IDX__", params.min_score_max.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "s.enroll_count >= ?__IDX__", params.enroll_count_min.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "s.enroll_count <= ?__IDX__", params.enroll_count_max.map(Into::into));

    if let Some(name) = params.department_name {
        conditions.push(format!("d.name LIKE '%' || ?{} || '%'", idx));
        values.push(rusqlite::types::Value::Text(name.to_string()));
        idx += 1;
    }

    // School features
    if params.self_scoring == Some(true) {
        conditions.push("s.self_scoring = 1".to_string());
    }
    if params.doctoral_program == Some(true) {
        conditions.push("s.doctoral_program = 1".to_string());
    }
    if params.double_first_class == Some(true) {
        conditions.push("s.double_first_class = 1".to_string());
    }

    // Department-level filters using LIKE to support comma-separated multi-values.
    if let Some(modes) = params.study_modes {
        if !modes.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for mode in modes {
                or_conditions.push(format!(
                    "(',' || COALESCE(d.study_mode,'') || ',') LIKE '%{},%'",
                    mode.replace('\'', "''")
                ));
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }

    if let Some(types) = params.exam_types {
        if !types.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for t in types {
                or_conditions.push(format!(
                    "(',' || COALESCE(d.exam_type,'') || ',') LIKE '%{},%'",
                    t.replace('\'', "''")
                ));
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }

    if let Some(plans) = params.special_plans {
        if !plans.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for plan in plans {
                or_conditions.push(format!(
                    "d.special_plans LIKE '%{}%'",
                    plan.replace('\'', "''")
                ));
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }

    // Exam subject filters (multi-select, at least one selected subject matches).
    if let Some(subjects) = params.foreign_subjects {
        if !subjects.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for subject in subjects {
                or_conditions.push(format!("d.exam_subjects LIKE ?{}", idx));
                values.push(rusqlite::types::Value::Text(format!("%{}%", subject)));
                idx += 1;
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }
    if let Some(subjects) = params.business_one_subjects {
        if !subjects.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for subject in subjects {
                or_conditions.push(format!("d.exam_subjects LIKE ?{}", idx));
                values.push(rusqlite::types::Value::Text(format!("%{}%", subject)));
                idx += 1;
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }
    if let Some(subjects) = params.business_two_subjects {
        if !subjects.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for subject in subjects {
                or_conditions.push(format!("d.exam_subjects LIKE ?{}", idx));
                values.push(rusqlite::types::Value::Text(format!("%{}%", subject)));
                idx += 1;
            }
            conditions.push(format!("({})", or_conditions.join(" OR ")));
        }
    }

    // Subject score filters on workspace_department_years (at least one year matches).
    push_opt(&mut conditions, &mut values, &mut idx, "y.english >= ?__IDX__", params.english_min.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "y.english <= ?__IDX__", params.english_max.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "y.math >= ?__IDX__", params.business_one_min.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "y.math <= ?__IDX__", params.business_one_max.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "y.specialized >= ?__IDX__", params.business_two_min.map(Into::into));
    push_opt(&mut conditions, &mut values, &mut idx, "y.specialized <= ?__IDX__", params.business_two_max.map(Into::into));

    let where_sql = conditions.join(" AND ");

    let sql = format!(
        "SELECT DISTINCT s.school_id, s.major_code, s.name, s.province, s.level, s.min_score, s.enroll_count,
                s.self_scoring, s.doctoral_program, s.double_first_class,
                s.school_code, s.province_code, s.is_985, s.is_211, s.display_order
         FROM workspace_schools s
         JOIN workspace_departments d ON d.school_id = s.school_id AND d.major_code = s.major_code
         LEFT JOIN workspace_department_years y ON y.department_id = d.department_id
         WHERE {}
         ORDER BY {}",
        where_sql, order_sql
    );

    let mut stmt = conn.prepare(&sql).unwrap();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(values.iter()), |row| {
            Ok(WorkspaceSchool {
                school_id: row.get(0)?,
                major_code: row.get(1)?,
                name: row.get(2)?,
                province: row.get(3)?,
                level: row.get(4)?,
                min_score: row.get(5)?,
                enroll_count: row.get(6)?,
                self_scoring: row.get::<_, i32>(7)? != 0,
                doctoral_program: row.get::<_, i32>(8)? != 0,
                double_first_class: row.get::<_, i32>(9)? != 0,
                school_code: row.get::<_, String>(10)?,
                province_code: row.get::<_, String>(11)?,
                is_985: row.get::<_, i32>(12)? != 0,
                is_211: row.get::<_, i32>(13)? != 0,
                display_order: row.get::<_, i32>(14)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

#[derive(Serialize, Debug)]
pub struct FilterOptions {
    pub provinces: Vec<String>,
    pub region_groups: Vec<String>,
    pub levels: Vec<String>,
    pub level_tags: Vec<String>,
    pub study_modes: Vec<String>,
    pub exam_types: Vec<String>,
    pub special_plans: Vec<String>,
    pub foreign_subjects: Vec<String>,
    pub business_one_subjects: Vec<String>,
    pub business_two_subjects: Vec<String>,
    pub has_self_scoring: bool,
    pub has_doctoral: bool,
    pub has_double_first_class: bool,
    pub has_self_scoring_tag: bool,
    pub has_research_institute: bool,
}

#[derive(Serialize, Debug)]
pub struct AvailableMajor {
    pub major_code: String,
    pub school_count: i64,
}

pub fn get_available_majors(conn: &Connection) -> Vec<AvailableMajor> {
    let mut stmt = conn
        .prepare(
            "SELECT major_code, COUNT(*) AS school_count
             FROM workspace_schools
             GROUP BY major_code
             ORDER BY major_code"
        )
        .unwrap();
    let rows = stmt
        .query_map([], |row| {
            Ok(AvailableMajor {
                major_code: row.get(0)?,
                school_count: row.get(1)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_workspace_filter_options(conn: &Connection, major_code: &str) -> FilterOptions {
    // 省份按研招网顺序排序（未在常量中的省份排末尾）
    let provinces: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT province
                 FROM workspace_schools
                 WHERE major_code = ?1 AND province <> ''
                 ORDER BY province"
            )
            .unwrap();
        let rows = stmt
            .query_map([major_code], |row| row.get::<_, String>(0))
            .unwrap();
        let mut raw: Vec<String> = rows.filter_map(|r| r.ok()).collect();
        raw.sort_by_key(|p| {
            YANZHAO_PROVINCE_ORDER
                .iter()
                .position(|x| x == p)
                .unwrap_or(usize::MAX)
        });
        raw
    };

    let region_groups: Vec<String> = {
        let mut groups = Vec::new();
        let region1: Vec<&str> = region_provinces("一区").to_vec();
        let region2: Vec<&str> = region_provinces("二区").to_vec();
        let has_region1 = provinces.iter().any(|p| region1.contains(&p.as_str()));
        let has_region2 = provinces.iter().any(|p| region2.contains(&p.as_str()));
        if has_region1 {
            groups.push("一区".to_string());
        }
        if has_region2 {
            groups.push("二区".to_string());
        }
        groups
    };

    // 层次标签固定按 LEVEL_TAG_ORDER 显示（不再依赖数据动态提取）
    let level_tags: Vec<String> = LEVEL_TAG_ORDER.iter().map(|s| s.to_string()).collect();

    // 实际数据中存在的层次组合（用于 levels 字段）
    let school_levels: Vec<(String, bool, String, bool, bool)> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT level, self_scoring, name, doctoral_program, double_first_class
                 FROM workspace_schools
                 WHERE major_code = ?1 AND level <> ''"
            )
            .unwrap();
        let rows = stmt
            .query_map([major_code], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i32>(1)? != 0,
                    row.get::<_, String>(2)?,
                    row.get::<_, i32>(3)? != 0,
                    row.get::<_, i32>(4)? != 0,
                ))
            })
            .unwrap();
        rows.filter_map(|r| r.ok()).collect()
    };
    let levels: Vec<String> = school_levels.iter().map(|(l, _, _, _, _)| l.clone()).collect();
    let has_self_scoring_tag = school_levels.iter().any(|(_, s, _, _, _)| *s);
    let has_research_institute = school_levels.iter().any(|(_, _, n, _, _)| is_research_institute(n));

    let study_modes: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT study_mode
                 FROM workspace_departments
                 WHERE major_code = ?1 AND study_mode <> ''"
            )
            .unwrap();
        let rows = stmt
            .query_map([major_code], |row| row.get::<_, String>(0))
            .unwrap();
        let mut modes: Vec<String> = Vec::new();
        for row in rows.filter_map(|r| r.ok()) {
            for part in row.split(',') {
                let trimmed = part.trim();
                if !trimmed.is_empty() && !modes.iter().any(|m| m == trimmed) {
                    modes.push(trimmed.to_string());
                }
            }
        }
        modes.sort();
        modes
    };

    let exam_types: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT exam_type
                 FROM workspace_departments
                 WHERE major_code = ?1 AND exam_type <> ''
                 ORDER BY exam_type"
            )
            .unwrap();
        let rows = stmt
            .query_map([major_code], |row| row.get::<_, String>(0))
            .unwrap();
        rows.filter_map(|r| r.ok()).collect()
    };

    let special_plans: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT special_plans
                 FROM workspace_departments
                 WHERE major_code = ?1 AND special_plans <> '[]' AND special_plans <> ''"
            )
            .unwrap();
        let rows = stmt
            .query_map([major_code], |row| row.get::<_, String>(0))
            .unwrap();
        let mut plans: Vec<String> = Vec::new();
        for row in rows.filter_map(|r| r.ok()) {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(&row) {
                for plan in arr {
                    if !plan.trim().is_empty() && !plans.iter().any(|p| p == &plan) {
                        plans.push(plan);
                    }
                }
            }
        }
        plans.sort();
        plans
    };

    let classified_subjects = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT exam_subjects
                 FROM workspace_departments
                 WHERE major_code = ?1 AND exam_subjects <> ''"
            )
            .unwrap();
        let rows = stmt
            .query_map([major_code], |row| row.get::<_, String>(0))
            .unwrap();
        let mut all: Vec<String> = Vec::new();
        for row in rows.filter_map(|r| r.ok()) {
            for part in row.split(',') {
                let trimmed = part.trim().to_string();
                if !trimmed.is_empty() && !all.iter().any(|s| s == &trimmed) {
                    all.push(trimmed);
                }
            }
        }
        classify_exam_subjects(&all)
    };

    let (has_self_scoring, has_doctoral, has_double_first_class) = {
        let mut stmt = conn
            .prepare(
                "SELECT MAX(self_scoring), MAX(doctoral_program), MAX(double_first_class)
                 FROM workspace_schools
                 WHERE major_code = ?1"
            )
            .unwrap();
        stmt
            .query_row([major_code], |row| {
                Ok((
                    row.get::<_, i32>(0).unwrap_or(0) > 0,
                    row.get::<_, i32>(1).unwrap_or(0) > 0,
                    row.get::<_, i32>(2).unwrap_or(0) > 0,
                ))
            })
            .unwrap_or((false, false, false))
    };

    FilterOptions {
        provinces,
        region_groups,
        levels,
        level_tags,
        study_modes,
        exam_types,
        special_plans,
        foreign_subjects: classified_subjects.foreign,
        business_one_subjects: classified_subjects.business_one,
        business_two_subjects: classified_subjects.business_two,
        has_self_scoring,
        has_doctoral,
        has_double_first_class,
        has_self_scoring_tag,
        has_research_institute,
    }
}

pub fn get_workspace_departments(conn: &Connection, school_id: &str, major_code: &str) -> Vec<WorkspaceDepartment> {
    let mut stmt = conn
        .prepare(
            "SELECT department_id, school_id, major_code, name, research_direction, exam_subjects,
                    study_mode, exam_type, special_plans
             FROM workspace_departments
             WHERE school_id = ?1 AND major_code = ?2
             ORDER BY department_id"
        )
        .unwrap();
    let rows = stmt
        .query_map([school_id, major_code], |row| {
            let department_id: i64 = row.get(0)?;
            let exam_subjects_str: String = row.get(5)?;
            let special_plans_str: String = row.get(8)?;
            let special_plans: Vec<String> = serde_json::from_str(&special_plans_str).unwrap_or_default();
            let years = get_department_years(conn, department_id);
            Ok(WorkspaceDepartment {
                department_id,
                school_id: row.get(1)?,
                major_code: row.get(2)?,
                name: row.get(3)?,
                research_direction: row.get(4)?,
                exam_subjects: exam_subjects_str.split(',').map(|s| s.to_string()).collect(),
                study_mode: row.get(6)?,
                exam_type: row.get(7)?,
                special_plans,
                years,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

fn get_department_years(conn: &Connection, department_id: i64) -> Vec<WorkspaceYear> {
    let mut stmt = conn
        .prepare(
            "SELECT year, enroll_count, min_score, politics, english, math, specialized
             FROM workspace_department_years
             WHERE department_id = ?1
             ORDER BY year DESC"
        )
        .unwrap();
    let rows = stmt
        .query_map([department_id], |row| {
            Ok(WorkspaceYear {
                year: row.get(0)?,
                enroll_count: row.get(1)?,
                min_score: row.get(2)?,
                politics: row.get(3)?,
                english: row.get(4)?,
                math: row.get(5)?,
                specialized: row.get(6)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

#[derive(Serialize, Debug)]
pub struct FavoriteYear {
    pub english: i32,
    pub math: i32,
    pub specialized: i32,
}

#[derive(Serialize, Debug)]
pub struct FavoriteDepartment {
    pub name: String,
    pub study_mode: String,
    pub exam_type: String,
    pub exam_subjects: Vec<String>,
    pub special_plans: Vec<String>,
    pub years: Vec<FavoriteYear>,
}

#[derive(Serialize, Debug)]
pub struct Favorite {
    pub school_id: String,
    pub major_code: String,
    pub major_name: String,
    pub name: String,
    pub province: String,
    pub level: String,
    pub min_score: i32,
    pub enroll_count: i32,
    pub created_at: i64,
    pub self_scoring: bool,
    pub doctoral_program: bool,
    pub double_first_class: bool,
    pub departments: Vec<FavoriteDepartment>,
}

#[derive(Serialize, Debug)]
pub struct RecentView {
    pub school_id: String,
    pub major_code: String,
    pub major_name: String,
    pub name: String,
    pub province: String,
    pub level: String,
    pub viewed_at: i64,
}

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

pub fn get_favorites(conn: &Connection, major_code: Option<&str>) -> Vec<Favorite> {
    let sql =
        "SELECT f.school_id, f.major_code, f.major_name, f.created_at,
                s.name, s.province, s.level, s.min_score, s.enroll_count,
                s.self_scoring, s.doctoral_program, s.double_first_class
         FROM favorites f
         JOIN workspace_schools s ON s.school_id = f.school_id AND s.major_code = f.major_code
         WHERE (?1 IS NULL OR f.major_code = ?1)
         ORDER BY f.created_at DESC";
    let mut stmt = conn.prepare(sql).unwrap();
    let rows = stmt
        .query_map([major_code], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, i32>(8)?,
                row.get::<_, i32>(9)? != 0,
                row.get::<_, i32>(10)? != 0,
                row.get::<_, i32>(11)? != 0,
            ))
        })
        .unwrap();

    let mut favorites: Vec<Favorite> = Vec::new();
    for row in rows.filter_map(|r| r.ok()) {
        let (
            school_id,
            major_code,
            major_name,
            created_at,
            name,
            province,
            level,
            min_score,
            enroll_count,
            self_scoring,
            doctoral_program,
            double_first_class,
        ) = row;
        favorites.push(Favorite {
            school_id,
            major_code,
            major_name,
            created_at,
            name,
            province,
            level,
            min_score,
            enroll_count,
            self_scoring,
            doctoral_program,
            double_first_class,
            departments: Vec::new(),
        });
    }

    if favorites.is_empty() {
        return favorites;
    }

    let school_ids: Vec<String> = favorites.iter().map(|f| f.school_id.clone()).collect();
    let major_codes: Vec<String> = favorites.iter().map(|f| f.major_code.clone()).collect();

    let placeholders = school_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut dept_stmt = conn
        .prepare(&format!(
            "SELECT department_id, school_id, major_code, name, study_mode, exam_type, exam_subjects, special_plans
             FROM workspace_departments
             WHERE school_id IN ({}) AND major_code IN ({})",
            placeholders, placeholders
        ))
        .unwrap();
    let mut dept_params: Vec<rusqlite::types::Value> = Vec::new();
    for id in &school_ids {
        dept_params.push(rusqlite::types::Value::Text(id.clone()));
    }
    for m in &major_codes {
        dept_params.push(rusqlite::types::Value::Text(m.clone()));
    }
    let dept_rows = dept_stmt
        .query_map(rusqlite::params_from_iter(dept_params.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .unwrap();

    let mut depts_by_pair: std::collections::HashMap<(String, String), Vec<FavoriteDepartment>> =
        std::collections::HashMap::new();
    let mut dept_id_to_pair: std::collections::HashMap<i64, ((String, String), usize)> =
        std::collections::HashMap::new();
    let mut all_dept_ids: Vec<i64> = Vec::new();

    for row in dept_rows.filter_map(|r| r.ok()) {
        let (dept_id, sid, mcode, name, study_mode, exam_type, exam_subjects_str, special_plans_str) = row;
        let exam_subjects: Vec<String> = exam_subjects_str.split(',').map(|s| s.to_string()).collect();
        let special_plans: Vec<String> =
            serde_json::from_str(&special_plans_str).unwrap_or_default();
        let entry = depts_by_pair
            .entry((sid.clone(), mcode.clone()))
            .or_default();
        entry.push(FavoriteDepartment {
            name,
            study_mode,
            exam_type,
            exam_subjects,
            special_plans,
            years: Vec::new(),
        });
        let idx = entry.len() - 1;
        all_dept_ids.push(dept_id);
        dept_id_to_pair.insert(dept_id, ((sid, mcode), idx));
    }

    if !all_dept_ids.is_empty() {
        let placeholders = all_dept_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let mut year_stmt = conn
            .prepare(&format!(
                "SELECT department_id, english, math, specialized
                 FROM workspace_department_years
                 WHERE department_id IN ({})",
                placeholders
            ))
            .unwrap();
        let year_rows = year_stmt
            .query_map(rusqlite::params_from_iter(all_dept_ids.iter()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .unwrap();
        for row in year_rows.filter_map(|r| r.ok()) {
            let (dept_id, english, math, specialized) = row;
            if let Some(((sid, mcode), idx)) = dept_id_to_pair.get(&dept_id) {
                if let Some(depts) = depts_by_pair.get_mut(&(sid.clone(), mcode.clone())) {
                    if let Some(d) = depts.get_mut(*idx) {
                        d.years.push(FavoriteYear {
                            english,
                            math,
                            specialized,
                        });
                    }
                }
            }
        }
    }

    for fav in favorites.iter_mut() {
        if let Some(depts) = depts_by_pair.remove(&(fav.school_id.clone(), fav.major_code.clone())) {
            fav.departments = depts;
        }
    }

    favorites
}

pub fn add_favorite(conn: &Connection, school_id: &str, major_code: &str, major_name: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO favorites (school_id, major_code, major_name, created_at) VALUES (?1, ?2, ?3, ?4)",
        [school_id, major_code, major_name, &now_unix_secs().to_string()],
    )?;
    Ok(())
}

pub fn remove_favorite(conn: &Connection, school_id: &str, major_code: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM favorites WHERE school_id = ?1 AND major_code = ?2",
        [school_id, major_code],
    )?;
    Ok(())
}

pub fn is_favorite(conn: &Connection, school_id: &str, major_code: &str) -> bool {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM favorites WHERE school_id = ?1 AND major_code = ?2",
            [school_id, major_code],
            |row| row.get(0),
        )
        .unwrap_or(0);
    count > 0
}

pub fn get_recent_views(conn: &Connection, limit: i64) -> Vec<RecentView> {
    let mut stmt = conn
        .prepare(
            "SELECT r.school_id, r.major_code, r.major_name, r.viewed_at,
                    s.name, s.province, s.level
             FROM recent_views r
             JOIN workspace_schools s ON s.school_id = r.school_id AND s.major_code = r.major_code
             ORDER BY r.viewed_at DESC
             LIMIT ?1"
        )
        .unwrap();
    let rows = stmt
        .query_map([limit], |row| {
            Ok(RecentView {
                school_id: row.get(0)?,
                major_code: row.get(1)?,
                major_name: row.get(2)?,
                viewed_at: row.get(3)?,
                name: row.get(4)?,
                province: row.get(5)?,
                level: row.get(6)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn add_recent_view(conn: &Connection, school_id: &str, major_code: &str, major_name: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO recent_views (school_id, major_code, major_name, viewed_at) VALUES (?1, ?2, ?3, ?4)",
        [school_id, major_code, major_name, &now_unix_secs().to_string()],
    )?;
    Ok(())
}

pub fn clear_recent_views(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM recent_views", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_get_available_majors() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO workspace_schools (school_id, major_code, name, province, level, min_score, enroll_count, self_scoring, doctoral_program, double_first_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ("1", "085410", "Test School", "Beijing", "211", 300, 20, 0, 0, 0)
        ).unwrap();
        conn.execute(
            "INSERT INTO workspace_schools (school_id, major_code, name, province, level, min_score, enroll_count, self_scoring, doctoral_program, double_first_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ("2", "085410", "Test School 2", "Beijing", "211", 310, 25, 0, 0, 0)
        ).unwrap();
        conn.execute(
            "INSERT INTO workspace_schools (school_id, major_code, name, province, level, min_score, enroll_count, self_scoring, doctoral_program, double_first_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ("3", "085400", "Test School 3", "Shanghai", "985", 320, 30, 0, 0, 0)
        ).unwrap();

        let majors = get_available_majors(&conn);
        assert_eq!(majors.len(), 2);
        let m085410 = majors.iter().find(|m| m.major_code == "085410").unwrap();
        assert_eq!(m085410.school_count, 2);
        let m085400 = majors.iter().find(|m| m.major_code == "085400").unwrap();
        assert_eq!(m085400.school_count, 1);
    }
}
