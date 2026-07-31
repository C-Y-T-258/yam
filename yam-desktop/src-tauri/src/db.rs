use chrono::Local;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct DbConn(pub Mutex<Connection>);

#[derive(Serialize, Clone, Debug)]
pub struct DatabaseStatus {
    pub database_path: String,
    pub recovered: bool,
    pub backup_path: Option<String>,
    pub message: Option<String>,
}

fn initialize_database(conn: &Connection) -> Result<(), String> {
    init_schema(conn).map_err(|err| format!("初始化数据库结构失败: {err}"))?;
    seed_data(conn).map_err(|err| format!("初始化数据库数据失败: {err}"))?;
    Ok(())
}

fn check_database(conn: &Connection) -> Result<(), String> {
    let result: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|err| format!("数据库完整性检查失败: {err}"))?;
    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!("数据库完整性检查未通过: {result}"))
    }
}

fn unique_backup_path(db_path: &Path) -> Result<PathBuf, String> {
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "数据库文件名不是有效的 UTF-8 路径".to_string())?;
    let timestamp = Local::now().format("%Y%m%d-%H%M%S");
    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    for index in 0.. {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("-{index}")
        };
        let candidate = parent.join(format!("{file_name}.corrupt-{timestamp}{suffix}"));
        if !candidate.exists()
            && !PathBuf::from(format!("{}-wal", candidate.display())).exists()
            && !PathBuf::from(format!("{}-shm", candidate.display())).exists()
        {
            return Ok(candidate);
        }
    }
    unreachable!()
}

fn move_database_files(db_path: &Path, backup_path: &Path) -> Result<(), String> {
    std::fs::rename(db_path, backup_path).map_err(|err| {
        format!(
            "备份损坏数据库失败（{} -> {}）: {err}",
            db_path.display(),
            backup_path.display()
        )
    })?;

    for suffix in ["-wal", "-shm"] {
        let source = PathBuf::from(format!("{}{suffix}", db_path.display()));
        if source.exists() {
            let target = PathBuf::from(format!("{}{suffix}", backup_path.display()));
            if let Err(err) = std::fs::rename(&source, &target) {
                eprintln!(
                    "数据库主文件已备份，但附属文件 {} 移动失败，将保留在原位置: {err}",
                    source.display()
                );
            }
        }
    }
    Ok(())
}

pub fn open_or_recover_database(db_path: &Path) -> Result<(Connection, DatabaseStatus), String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("创建数据库目录 {} 失败: {err}", parent.display()))?;
    }

    let database_path = db_path.to_string_lossy().into_owned();
    if !db_path.exists() {
        let conn = Connection::open(db_path)
            .map_err(|err| format!("创建数据库 {} 失败: {err}", db_path.display()))?;
        initialize_database(&conn)?;
        return Ok((
            conn,
            DatabaseStatus {
                database_path,
                recovered: false,
                backup_path: None,
                message: None,
            },
        ));
    }

    let validation = Connection::open(db_path)
        .map_err(|err| format!("打开数据库失败: {err}"))
        .and_then(|conn| {
            check_database(&conn)?;
            initialize_database(&conn)?;
            Ok(conn)
        });
    match validation {
        Ok(conn) => {
            return Ok((
                conn,
                DatabaseStatus {
                    database_path,
                    recovered: false,
                    backup_path: None,
                    message: None,
                },
            ));
        }
        Err(err) => eprintln!(
            "数据库 {} 校验或迁移失败，将备份并创建新库: {err}",
            db_path.display()
        ),
    }

    let backup_path = unique_backup_path(db_path)?;
    move_database_files(db_path, &backup_path)?;

    let conn = Connection::open(db_path)
        .map_err(|err| format!("原数据库已备份，但创建新数据库失败: {err}"))?;
    initialize_database(&conn)
        .map_err(|err| format!("原数据库已备份，但初始化新数据库失败: {err}"))?;
    let backup_path_string = backup_path.to_string_lossy().into_owned();
    Ok((
        conn,
        DatabaseStatus {
            database_path,
            recovered: true,
            backup_path: Some(backup_path_string.clone()),
            message: Some(format!(
                "检测到数据库损坏或无法迁移，已创建新库；原库已备份到 {backup_path_string}。现有工作区可能为空，可重新同步。"
            )),
        },
    ))
}

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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceSchool {
    pub school_id: String,
    pub major_code: String,
    pub name: String,
    pub province: String,
    pub level: String,
    pub min_score: i32,
    pub reference_score: i32,
    pub reference_year: i32,
    pub reference_scope: String,
    pub latest_request_year: i32,
    pub latest_request_status: String,
    pub latest_request_error: String,
    pub enroll_count: i32,
    pub self_scoring: bool,
    pub doctoral_program: bool,
    pub double_first_class: bool,
    pub school_code: String,
    pub province_code: String,
    pub is_985: bool,
    pub is_211: bool,
    pub display_order: i32,
    pub source: String,
    pub updated_at: String,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceSchoolPage {
    pub items: Vec<WorkspaceSchool>,
    pub total: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspaceDepartment {
    pub department_id: i64,
    pub source_department_id: String,
    pub plan_key: String,
    pub school_id: String,
    pub major_code: String,
    pub name: String,
    pub research_direction: String,
    pub exam_subjects: Vec<String>,
    pub study_mode: String,
    pub exam_type: String,
    pub special_plans: Vec<String>,
    pub enrollment_count: i32,
    pub source: String,
    pub updated_at: String,
    pub years: Vec<WorkspaceYear>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceYear {
    pub year: i32,
    pub enroll_count: i32,
    pub min_score: i32,
    pub politics: i32,
    pub english: i32,
    pub math: i32,
    pub specialized: i32,
    pub score_scope: String,
    pub source: String,
    pub updated_at: String,
    pub match_note: String,
}

// ISSUE-027 阶段 2：招生计划视图扁平行。每行 = (院校, 专业, 院系, 方向, 考试科目, 最新年份分数线)。
#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspacePlanRow {
    // 院校级
    pub school_id: String,
    pub school_code: String,
    pub school_name: String,
    pub province: String,
    pub level: String,
    pub is_985: bool,
    pub is_211: bool,
    pub double_first_class: bool,
    pub self_scoring: bool,
    pub doctoral_program: bool,
    pub display_order: i32,
    pub school_source: String,
    pub school_updated_at: String,
    // 专业级
    pub major_code: String,
    // 院系级
    pub department_id: i64,
    pub source_department_id: String,
    pub plan_key: String,
    pub department_name: String,
    pub research_direction: String,
    pub exam_subjects: Vec<String>,
    pub study_mode: String,
    pub exam_type: String,
    pub special_plans: Vec<String>,
    pub department_source: String,
    pub department_updated_at: String,
    // 兼容旧调用：latest_year 等同最新计划年份；分数年份单独由 latest_score_year 表示。
    pub latest_year: i32,
    pub latest_plan_year: i32,
    pub latest_score_year: i32,
    pub latest_min_score: i32,
    pub latest_enroll_count: i32,
    // 多年分数（供展开用）
    pub years: Vec<WorkspaceYear>,
}

#[derive(Serialize, Debug)]
pub struct WorkspacePlanPage {
    pub items: Vec<WorkspacePlanRow>,
    pub total: i64,
}

pub fn init_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(SCHEMA)?;
    migrate_schema(conn)?;
    Ok(())
}

pub fn migrate_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Very old legacy workspace tables are left intact. SCHEMA only adds missing modern tables;
    // incompatible legacy data remains readable by old clients and can be replaced by a resync.
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
        return Ok(());
    }

    // Add individual missing columns defensively.
    let add_if_missing =
        |conn: &Connection, table: &str, column: &str, def: &str| -> Result<(), rusqlite::Error> {
            let exists: bool = conn
                .query_row(
                    &format!(
                        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('{}') WHERE name = ?)",
                        table
                    ),
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

    add_if_missing(
        conn,
        "workspace_schools",
        "self_scoring",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "doctoral_program",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "double_first_class",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "school_code",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "province_code",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "is_985",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "is_211",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "display_order",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "source",
        "TEXT NOT NULL DEFAULT 'yanzhao'",
    )?;
    add_if_missing(
        conn,
        "workspace_schools",
        "updated_at",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "source_department_id",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "plan_key",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "study_mode",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "exam_type",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "special_plans",
        "TEXT NOT NULL DEFAULT '[]'",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "source",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_departments",
        "updated_at",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_department_years",
        "score_scope",
        "TEXT NOT NULL DEFAULT 'school_major'",
    )?;
    add_if_missing(
        conn,
        "workspace_department_years",
        "source",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_department_years",
        "updated_at",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_if_missing(
        conn,
        "workspace_department_years",
        "match_note",
        "TEXT NOT NULL DEFAULT ''",
    )?;

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
        source TEXT NOT NULL DEFAULT 'yanzhao',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (school_id, major_code)
    );

    CREATE TABLE IF NOT EXISTS workspace_departments (
        department_id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_department_id TEXT NOT NULL DEFAULT '',
        plan_key TEXT NOT NULL DEFAULT '',
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        name TEXT NOT NULL,
        research_direction TEXT NOT NULL,
        exam_subjects TEXT NOT NULL,
        study_mode TEXT NOT NULL DEFAULT '',
        exam_type TEXT NOT NULL DEFAULT '',
        special_plans TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
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
        score_scope TEXT NOT NULL DEFAULT 'school_major',
        source TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        match_note TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (department_id) REFERENCES workspace_departments(department_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_majors (
        major_code TEXT PRIMARY KEY, name TEXT NOT NULL, degree_type TEXT NOT NULL DEFAULT '',
        category_code TEXT NOT NULL DEFAULT '', category_name TEXT NOT NULL DEFAULT '',
        discipline_code TEXT NOT NULL DEFAULT '', discipline_name TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'major_catalog', updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS workspace_department_entities (
        department_key TEXT PRIMARY KEY, school_id TEXT NOT NULL, major_code TEXT NOT NULL,
        source_department_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '',
        UNIQUE(school_id, major_code, source_department_id, name)
    );
    CREATE TABLE IF NOT EXISTS workspace_plans (
        plan_id INTEGER PRIMARY KEY, plan_key TEXT NOT NULL UNIQUE, department_key TEXT NOT NULL,
        school_id TEXT NOT NULL, major_code TEXT NOT NULL, research_direction TEXT NOT NULL,
        exam_subjects TEXT NOT NULL, study_mode TEXT NOT NULL DEFAULT '', exam_type TEXT NOT NULL DEFAULT '',
        special_plans TEXT NOT NULL DEFAULT '[]', enrollment_count INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT '', source_record_kind TEXT NOT NULL DEFAULT 'yanzhao_department_derived',
        updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS workspace_plan_years (
        plan_year_id INTEGER PRIMARY KEY AUTOINCREMENT, plan_key TEXT NOT NULL, year INTEGER NOT NULL,
        enroll_count INTEGER NOT NULL, min_score INTEGER NOT NULL, politics INTEGER NOT NULL,
        english INTEGER NOT NULL, math INTEGER NOT NULL, specialized INTEGER NOT NULL,
        score_scope TEXT NOT NULL DEFAULT 'school_major', source TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '', match_note TEXT NOT NULL DEFAULT '', UNIQUE(plan_key, year)
    );
    CREATE TABLE IF NOT EXISTS workspace_score_request_status (
        major_code TEXT NOT NULL, school_id TEXT NOT NULL, requested_year INTEGER NOT NULL,
        source TEXT NOT NULL, status TEXT NOT NULL, error_message TEXT NOT NULL DEFAULT '',
        retrieved_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (major_code, school_id, requested_year, source)
    );
    CREATE TABLE IF NOT EXISTS workspace_model_state (
        major_code TEXT PRIMARY KEY, model_version INTEGER NOT NULL DEFAULT 2,
        status TEXT NOT NULL CHECK(status IN ('writing','ready','failed')),
        old_plan_count INTEGER NOT NULL DEFAULT 0, new_plan_count INTEGER NOT NULL DEFAULT 0,
        old_year_count INTEGER NOT NULL DEFAULT 0, new_year_count INTEGER NOT NULL DEFAULT 0,
        verified_at TEXT NOT NULL DEFAULT '', error_message TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_schools_major_score ON workspace_schools(major_code, min_score DESC, name);
    CREATE INDEX IF NOT EXISTS idx_workspace_schools_major_code ON workspace_schools(major_code, school_code, name);
    CREATE INDEX IF NOT EXISTS idx_workspace_departments_major_school ON workspace_departments(major_code, school_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_department_years_department ON workspace_department_years(department_id, year DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_entities_major_school ON workspace_department_entities(major_code, school_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_plans_major_school ON workspace_plans(major_code, school_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_plans_department ON workspace_plans(department_key);
    CREATE INDEX IF NOT EXISTS idx_workspace_plan_years_plan ON workspace_plan_years(plan_key, year DESC);

    CREATE TABLE IF NOT EXISTS favorites (
        favorite_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        major_code TEXT NOT NULL,
        major_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(school_id, major_code)
    );

    CREATE TABLE IF NOT EXISTS plan_favorites (
        favorite_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        school_name TEXT NOT NULL,
        major_code TEXT NOT NULL,
        department_name TEXT NOT NULL,
        research_direction TEXT NOT NULL,
        exam_subjects TEXT NOT NULL,
        study_mode TEXT NOT NULL DEFAULT '',
        exam_type TEXT NOT NULL DEFAULT '',
        special_plans TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        UNIQUE(school_id, major_code, department_name, research_direction, exam_subjects)
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
        (
            "1",
            "清华大学",
            "北京",
            "985 / 211 / 双一流",
            672,
            45,
            true,
            true,
            true,
        ),
        (
            "2",
            "北京大学",
            "北京",
            "985 / 211 / 双一流",
            669,
            40,
            true,
            true,
            true,
        ),
        (
            "3",
            "上海交通大学",
            "上海",
            "985 / 211 / 双一流",
            660,
            50,
            true,
            true,
            true,
        ),
        (
            "4",
            "浙江大学",
            "浙江",
            "985 / 211 / 双一流",
            657,
            48,
            true,
            true,
            true,
        ),
        (
            "5",
            "南京大学",
            "江苏",
            "985 / 211 / 双一流",
            650,
            42,
            true,
            true,
            true,
        ),
        (
            "6",
            "中国科学技术大学",
            "安徽",
            "985 / 211 / 双一流",
            645,
            35,
            true,
            true,
            true,
        ),
        (
            "7",
            "哈尔滨工业大学",
            "黑龙江",
            "985 / 211 / 双一流",
            642,
            60,
            false,
            true,
            true,
        ),
        (
            "8",
            "北京航空航天大学",
            "北京",
            "985 / 211 / 双一流",
            641,
            55,
            true,
            true,
            true,
        ),
        (
            "9",
            "同济大学",
            "上海",
            "985 / 211 / 双一流",
            637,
            45,
            true,
            true,
            true,
        ),
        (
            "10",
            "华中科技大学",
            "湖北",
            "985 / 211 / 双一流",
            635,
            50,
            false,
            true,
            true,
        ),
    ];

    for (
        id,
        name,
        province,
        level,
        min_score,
        enroll_count,
        self_scoring,
        doctoral_program,
        double_first_class,
    ) in schools
    {
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

    let departments: Vec<(
        &str,
        &str,
        &str,
        &str,
        Vec<&str>,
        &str,
        &str,
        Vec<&str>,
        Vec<(i32, i32, i32, i32, i32, i32, i32)>,
    )> = vec![
        (
            "1",
            "085400",
            "计算机科学与技术（学术学位）",
            "机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。",
            vec![
                "① 101 思想政治理论",
                "② 201 英语（一）",
                "③ 301 数学（一）",
                "④ 408 计算机学科专业基础",
            ],
            "全日制",
            "统考",
            vec![],
            vec![
                (2026, 28, 681, 70, 70, 110, 120),
                (2025, 26, 672, 68, 68, 105, 115),
                (2024, 24, 663, 67, 67, 105, 114),
                (2023, 26, 654, 65, 65, 100, 110),
            ],
        ),
        (
            "1",
            "085400",
            "人工智能（专业学位）",
            "机器学习、深度学习、计算机视觉、自然语言处理等。",
            vec![
                "① 101 思想政治理论",
                "② 204 英语（二）",
                "③ 302 数学（二）",
                "④ 408 计算机学科专业基础",
            ],
            "全日制",
            "统考",
            vec![],
            vec![(2026, 45, 670, 68, 68, 105, 115)],
        ),
        (
            "1",
            "085400",
            "软件工程（专业学位）",
            "软件工程理论与方法、软件工程技术、软件项目管理等。",
            vec![
                "① 101 思想政治理论",
                "② 204 英语（二）",
                "③ 302 数学（二）",
                "④ 408 计算机学科专业基础",
            ],
            "全日制",
            "统考",
            vec!["退役大学生士兵"],
            vec![(2026, 35, 665, 66, 66, 102, 112)],
        ),
        (
            "1",
            "085400",
            "控制科学与工程（学术学位）",
            "控制理论与控制工程、模式识别与智能系统、导航制导与控制等。",
            vec![
                "① 101 思想政治理论",
                "② 201 英语（一）",
                "③ 301 数学（一）",
                "④ 408 计算机学科专业基础",
            ],
            "全日制",
            "统考",
            vec![],
            vec![(2026, 22, 658, 65, 65, 102, 112)],
        ),
    ];

    for (
        school_id,
        major_code,
        name,
        research_direction,
        exam_subjects,
        study_mode,
        exam_type,
        special_plans,
        years,
    ) in departments
    {
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
        let is_foreign = !is_politics
            && !is_math
            && (s.contains("英语")
                || s.contains("日语")
                || s.contains("俄语")
                || s.contains("法语")
                || s.contains("德语")
                || s.contains("外语"));
        if is_foreign && !foreign.iter().any(|e| e == s) {
            foreign.push(s.clone());
        } else if is_math && !business_one.iter().any(|m| m == s) {
            business_one.push(s.clone());
        } else if !is_politics && !is_foreign && !is_math && !business_two.iter().any(|sp| sp == s)
        {
            business_two.push(s.clone());
        }
    }
    foreign.sort();
    business_one.sort();
    business_two.sort();
    ClassifiedSubjects {
        foreign,
        business_one,
        business_two,
    }
}

fn is_research_institute(name: &str) -> bool {
    ["研究院", "研究所", "科学院", "研究生院"]
        .iter()
        .any(|pat| name.contains(pat))
}

fn workspace_plan_key(
    plan_key: String,
    school_id: &str,
    major_code: &str,
    department_id: i64,
) -> String {
    if plan_key.is_empty() {
        format!("legacy:{}|{}|{}", school_id, major_code, department_id)
    } else {
        plan_key
    }
}

const YANZHAO_PROVINCE_ORDER: &[&str] = &[
    "北京",
    "天津",
    "河北",
    "山西",
    "内蒙古",
    "辽宁",
    "吉林",
    "黑龙江",
    "上海",
    "江苏",
    "浙江",
    "安徽",
    "福建",
    "江西",
    "山东",
    "河南",
    "湖北",
    "湖南",
    "广东",
    "海南",
    "广西",
    "四川",
    "重庆",
    "贵州",
    "云南",
    "西藏",
    "陕西",
    "甘肃",
    "青海",
    "宁夏",
    "新疆",
];

const LEVEL_TAG_ORDER: &[&str] = &[
    "985",
    "211",
    "双一流",
    "自划线",
    "科研院所",
    "博士点",
    "普通本科",
];

fn region_provinces(region: &str) -> &'static [&'static str] {
    match region {
        "一区" => &[
            "北京",
            "天津",
            "河北",
            "山西",
            "辽宁",
            "吉林",
            "黑龙江",
            "上海",
            "江苏",
            "浙江",
            "安徽",
            "福建",
            "江西",
            "山东",
            "河南",
            "湖北",
            "湖南",
            "广东",
            "重庆",
            "四川",
            "陕西",
        ],
        "二区" => &[
            "内蒙古",
            "广西",
            "海南",
            "贵州",
            "云南",
            "西藏",
            "甘肃",
            "青海",
            "宁夏",
            "新疆",
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
    pub research_direction: Option<&'a str>,
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
    pub search_query: Option<&'a str>,
}

pub fn get_workspace_schools(
    conn: &Connection,
    major_codes: &[&str],
    params: WorkspaceFilterParams,
) -> Vec<WorkspaceSchool> {
    if major_codes.is_empty() {
        return Vec::new();
    }
    let normalized = normalized_model_ready(conn, major_codes);
    let departments_source = workspace_departments_source(normalized);
    let years_source = workspace_years_source(normalized);
    let order_field = match params.sort_by.unwrap_or("min_score") {
        "enroll_count" => "s.enroll_count",
        "name" => "s.name",
        "school_code" => "s.school_code",
        "default" => "s.display_order",
        _ => "s.min_score",
    };
    let order_dir = if params.sort_order.unwrap_or("desc") == "asc" {
        "ASC"
    } else {
        "DESC"
    };
    let order_sql = if order_field == "s.name" {
        format!("{} {}, s.min_score DESC", order_field, order_dir)
    } else if order_field == "s.display_order" || order_field == "s.school_code" {
        // 默认排序与国标代码排序始终升序，DESC 时翻转
        format!("{} {}, s.name ASC", order_field, order_dir)
    } else {
        format!("{} {}, s.name", order_field, order_dir)
    };

    // Build dynamic SQL and owned parameter values.
    // ISSUE-027: major_code 从单值改为多值，WHERE 用 IN (?, ?, ...)。
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    let mut idx: usize = 1;
    {
        let placeholders: Vec<String> = major_codes
            .iter()
            .map(|_| {
                let p = format!("?{}", idx);
                idx += 1;
                p
            })
            .collect();
        conditions.push(format!("s.major_code IN ({})", placeholders.join(",")));
        values.extend(
            major_codes
                .iter()
                .map(|c| rusqlite::types::Value::Text((*c).to_string())),
        );
    }

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
        values.extend(
            selected_provinces
                .iter()
                .map(|p| rusqlite::types::Value::Text((*p).to_string())),
        );
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

    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.min_score >= ?__IDX__",
        params.min_score_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.min_score <= ?__IDX__",
        params.min_score_max.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.enroll_count >= ?__IDX__",
        params.enroll_count_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.enroll_count <= ?__IDX__",
        params.enroll_count_max.map(Into::into),
    );

    if let Some(search_query) = params.search_query {
        let search_query = search_query.trim();
        if !search_query.is_empty() {
            conditions.push(format!(
                "(s.name LIKE '%' || ?{0} || '%' OR s.school_code LIKE '%' || ?{0} || '%' OR s.school_id LIKE '%' || ?{0} || '%')",
                idx
            ));
            values.push(rusqlite::types::Value::Text(search_query.to_string()));
            idx += 1;
        }
    }

    if let Some(name) = params.department_name {
        conditions.push(format!("d.name LIKE '%' || ?{} || '%'", idx));
        values.push(rusqlite::types::Value::Text(name.to_string()));
        idx += 1;
    }
    if let Some(direction) = params.research_direction {
        conditions.push(format!("d.research_direction LIKE '%' || ?{} || '%'", idx));
        values.push(rusqlite::types::Value::Text(direction.to_string()));
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
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "y.english >= ?__IDX__",
        params.english_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "y.english <= ?__IDX__",
        params.english_max.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "y.math >= ?__IDX__",
        params.business_one_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "y.math <= ?__IDX__",
        params.business_one_max.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "y.specialized >= ?__IDX__",
        params.business_two_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "y.specialized <= ?__IDX__",
        params.business_two_max.map(Into::into),
    );

    let where_sql = conditions.join(" AND ");

    let sql = format!(
        "SELECT DISTINCT s.school_id, s.major_code, s.name, s.province, s.level, s.min_score,
                COALESCE((SELECT y.min_score FROM {years_ref} y JOIN {departments_ref} rd ON rd.department_id = y.department_id WHERE rd.school_id = s.school_id AND rd.major_code = s.major_code AND y.score_scope IN ('first_level_reference', 'category_reference') ORDER BY y.year DESC, CASE y.score_scope WHEN 'first_level_reference' THEN 0 ELSE 1 END LIMIT 1), 0),
                COALESCE((SELECT y.year FROM {years_ref} y JOIN {departments_ref} rd ON rd.department_id = y.department_id WHERE rd.school_id = s.school_id AND rd.major_code = s.major_code AND y.score_scope IN ('first_level_reference', 'category_reference') ORDER BY y.year DESC, CASE y.score_scope WHEN 'first_level_reference' THEN 0 ELSE 1 END LIMIT 1), 0),
                COALESCE((SELECT y.score_scope FROM {years_ref} y JOIN {departments_ref} rd ON rd.department_id = y.department_id WHERE rd.school_id = s.school_id AND rd.major_code = s.major_code AND y.score_scope IN ('first_level_reference', 'category_reference') ORDER BY y.year DESC, CASE y.score_scope WHEN 'first_level_reference' THEN 0 ELSE 1 END LIMIT 1), ''),
                COALESCE((SELECT r.requested_year FROM workspace_score_request_status r WHERE r.school_id = s.school_id AND r.major_code = s.major_code ORDER BY r.requested_year DESC LIMIT 1), 0),
                COALESCE((SELECT r.status FROM workspace_score_request_status r WHERE r.school_id = s.school_id AND r.major_code = s.major_code ORDER BY r.requested_year DESC LIMIT 1), ''),
                COALESCE((SELECT r.error_message FROM workspace_score_request_status r WHERE r.school_id = s.school_id AND r.major_code = s.major_code ORDER BY r.requested_year DESC LIMIT 1), ''),
                s.enroll_count, s.self_scoring, s.doctoral_program, s.double_first_class,
                s.school_code, s.province_code, s.is_985, s.is_211, s.display_order,
                s.source, s.updated_at
         FROM workspace_schools s
         JOIN {} d ON d.school_id = s.school_id AND d.major_code = s.major_code
         LEFT JOIN {} y ON y.department_id = d.department_id
         WHERE {}
         ORDER BY {}",
        departments_source, years_source, where_sql, order_sql,
        years_ref = years_source,
        departments_ref = departments_source
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
                reference_score: row.get(6)?,
                reference_year: row.get(7)?,
                reference_scope: row.get(8)?,
                latest_request_year: row.get(9)?,
                latest_request_status: row.get(10)?,
                latest_request_error: row.get(11)?,
                enroll_count: row.get(12)?,
                self_scoring: row.get::<_, i32>(13)? != 0,
                doctoral_program: row.get::<_, i32>(14)? != 0,
                double_first_class: row.get::<_, i32>(15)? != 0,
                school_code: row.get::<_, String>(16)?,
                province_code: row.get::<_, String>(17)?,
                is_985: row.get::<_, i32>(18)? != 0,
                is_211: row.get::<_, i32>(19)? != 0,
                display_order: row.get::<_, i32>(20)?,
                source: row.get(21)?,
                updated_at: row.get(22)?,
            })
        })
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_workspace_schools_page(
    conn: &Connection,
    major_codes: &[&str],
    params: WorkspaceFilterParams,
    page: i64,
    page_size: i64,
) -> WorkspaceSchoolPage {
    let page = page.clamp(1, 100);
    let page_size = page_size.clamp(1, 100);
    let sort_by = params.sort_by.unwrap_or("min_score");
    let descending = params.sort_order.unwrap_or("desc") != "asc";
    let schools = get_workspace_schools(conn, major_codes, params);
    let mut grouped: std::collections::HashMap<String, Vec<WorkspaceSchool>> =
        std::collections::HashMap::new();
    for school in schools {
        grouped
            .entry(school.school_id.clone())
            .or_default()
            .push(school);
    }
    let mut groups: Vec<Vec<WorkspaceSchool>> = grouped.into_values().collect();
    groups.iter_mut().for_each(|rows| {
        rows.sort_by(|left, right| left.major_code.cmp(&right.major_code));
    });
    groups.sort_by(|left, right| {
        let primary = match sort_by {
            "enroll_count" => {
                let left_total: i64 = left.iter().map(|row| i64::from(row.enroll_count)).sum();
                let right_total: i64 = right.iter().map(|row| i64::from(row.enroll_count)).sum();
                left_total.cmp(&right_total)
            }
            "name" => left[0].name.cmp(&right[0].name),
            "school_code" => left[0].school_code.cmp(&right[0].school_code),
            "default" => {
                let left_order = left.iter().map(|row| row.display_order).min().unwrap_or(0);
                let right_order = right.iter().map(|row| row.display_order).min().unwrap_or(0);
                left_order.cmp(&right_order)
            }
            _ => {
                let left_score = left.iter().map(|row| row.min_score).min().unwrap_or(0);
                let right_score = right.iter().map(|row| row.min_score).min().unwrap_or(0);
                left_score.cmp(&right_score)
            }
        };
        let primary = if descending {
            primary.reverse()
        } else {
            primary
        };
        primary.then_with(|| left[0].school_id.cmp(&right[0].school_id))
    });

    let total = groups.len() as i64;
    let offset = ((page - 1) * page_size) as usize;
    let items = groups
        .into_iter()
        .skip(offset)
        .take(page_size as usize)
        .flatten()
        .collect();
    WorkspaceSchoolPage { items, total }
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
             ORDER BY major_code",
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

/// ISSUE-027: 构建 `major_code IN (?, ?, ...)` 子句和对应参数值，供多专业查询复用。
fn normalized_model_ready(conn: &Connection, major_codes: &[&str]) -> bool {
    if major_codes.is_empty() {
        return false;
    }
    let placeholders = major_codes
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT COUNT(*) FROM workspace_model_state WHERE major_code IN ({})
         AND status = 'ready' AND model_version >= 2
         AND old_plan_count = new_plan_count AND old_year_count = new_year_count",
        placeholders
    );
    conn.query_row(
        &sql,
        rusqlite::params_from_iter(major_codes.iter()),
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count == major_codes.len() as i64)
    .unwrap_or(false)
}

fn workspace_departments_source(normalized: bool) -> &'static str {
    if normalized {
        "(SELECT p.plan_id AS department_id, d.source_department_id, p.plan_key,
                 p.school_id, p.major_code, d.name, p.research_direction, p.exam_subjects,
                 p.study_mode, p.exam_type, p.special_plans, p.enrollment_count, p.source, p.updated_at
          FROM workspace_plans p JOIN workspace_department_entities d
            ON d.department_key = p.department_key)"
    } else {
        "(SELECT d.department_id, d.source_department_id, d.plan_key, d.school_id, d.major_code,
                 d.name, d.research_direction, d.exam_subjects, d.study_mode, d.exam_type,
                 d.special_plans, COALESCE(p.enrollment_count, 0) AS enrollment_count,
                 d.source, d.updated_at
          FROM workspace_departments d LEFT JOIN workspace_plans p ON p.plan_key = d.plan_key)"
    }
}

fn workspace_years_source(normalized: bool) -> &'static str {
    if normalized {
        "(SELECT p.plan_id AS department_id, y.year, y.enroll_count, y.min_score,
                 y.politics, y.english, y.math, y.specialized, y.score_scope,
                 y.source, y.updated_at, y.match_note
          FROM workspace_plan_years y JOIN workspace_plans p ON p.plan_key = y.plan_key)"
    } else {
        "workspace_department_years"
    }
}

fn major_in_clause(major_codes: &[&str]) -> (String, Vec<rusqlite::types::Value>) {
    let placeholders: Vec<String> = major_codes.iter().map(|_| "?".to_string()).collect();
    let in_sql = format!("({})", placeholders.join(","));
    let values: Vec<rusqlite::types::Value> = major_codes
        .iter()
        .map(|c| rusqlite::types::Value::Text((*c).to_string()))
        .collect();
    (in_sql, values)
}

pub fn get_workspace_filter_options(conn: &Connection, major_codes: &[&str]) -> FilterOptions {
    if major_codes.is_empty() {
        return FilterOptions {
            provinces: Vec::new(),
            region_groups: Vec::new(),
            levels: Vec::new(),
            level_tags: Vec::new(),
            study_modes: Vec::new(),
            exam_types: Vec::new(),
            special_plans: Vec::new(),
            foreign_subjects: Vec::new(),
            business_one_subjects: Vec::new(),
            business_two_subjects: Vec::new(),
            has_self_scoring: false,
            has_doctoral: false,
            has_double_first_class: false,
            has_self_scoring_tag: false,
            has_research_institute: false,
        };
    }
    // ISSUE-027: major_code 从单值改为多值，所有子查询统一用 IN (?, ?, ...)。
    let normalized = normalized_model_ready(conn, major_codes);
    let departments_source = workspace_departments_source(normalized);
    let (in_sql, in_values) = major_in_clause(major_codes);
    // 省份按研招网顺序排序（未在常量中的省份排末尾）
    let provinces: Vec<String> = {
        let sql = format!(
            "SELECT DISTINCT province
             FROM workspace_schools
             WHERE major_code IN {} AND province <> ''
             ORDER BY province",
            in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(in_values.iter()), |row| {
                row.get::<_, String>(0)
            })
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
        let sql = format!(
            "SELECT DISTINCT level, self_scoring, name, doctoral_program, double_first_class
             FROM workspace_schools
             WHERE major_code IN {} AND level <> ''",
            in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(in_values.iter()), |row| {
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
    let levels: Vec<String> = school_levels
        .iter()
        .map(|(l, _, _, _, _)| l.clone())
        .collect();
    let has_self_scoring_tag = school_levels.iter().any(|(_, s, _, _, _)| *s);
    let has_research_institute = school_levels
        .iter()
        .any(|(_, _, n, _, _)| is_research_institute(n));

    let study_modes: Vec<String> = {
        let sql = format!(
            "SELECT DISTINCT study_mode
             FROM {}
             WHERE major_code IN {} AND study_mode <> ''",
            departments_source, in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(in_values.iter()), |row| {
                row.get::<_, String>(0)
            })
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
        let sql = format!(
            "SELECT DISTINCT exam_type
             FROM {}
             WHERE major_code IN {} AND exam_type <> ''
             ORDER BY exam_type",
            departments_source, in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(in_values.iter()), |row| {
                row.get::<_, String>(0)
            })
            .unwrap();
        rows.filter_map(|r| r.ok()).collect()
    };

    let special_plans: Vec<String> = {
        let sql = format!(
            "SELECT DISTINCT special_plans
             FROM {}
             WHERE major_code IN {} AND special_plans <> '[]' AND special_plans <> ''",
            departments_source, in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(in_values.iter()), |row| {
                row.get::<_, String>(0)
            })
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
        let sql = format!(
            "SELECT DISTINCT exam_subjects
             FROM {}
             WHERE major_code IN {} AND exam_subjects <> ''",
            departments_source, in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(in_values.iter()), |row| {
                row.get::<_, String>(0)
            })
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
        let sql = format!(
            "SELECT MAX(self_scoring), MAX(doctoral_program), MAX(double_first_class)
             FROM workspace_schools
             WHERE major_code IN {}",
            in_sql
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        stmt.query_row(rusqlite::params_from_iter(in_values.iter()), |row| {
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

pub fn get_workspace_departments(
    conn: &Connection,
    school_id: &str,
    major_codes: &[&str],
) -> Vec<WorkspaceDepartment> {
    if major_codes.is_empty() {
        return Vec::new();
    }
    // ISSUE-027: major_code 从单值改为多值，WHERE 用 IN (?, ?, ...)；ORDER BY 加 major_code 便于前端按专业分组。
    let placeholders: Vec<String> = major_codes
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2))
        .collect();
    let normalized = normalized_model_ready(conn, major_codes);
    let departments_source = workspace_departments_source(normalized);
    let sql = format!(
        "SELECT department_id, source_department_id, plan_key, school_id, major_code, name,
                research_direction, exam_subjects, study_mode, exam_type, special_plans,
                enrollment_count, source, updated_at
         FROM {}
         WHERE school_id = ?1 AND major_code IN ({})
         ORDER BY major_code, department_id",
        departments_source,
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&school_id];
    for c in major_codes {
        params.push(c);
    }
    let mut departments: Vec<WorkspaceDepartment> = stmt
        .query_map(params.as_slice(), |row| {
            let department_id: i64 = row.get(0)?;
            let source_department_id: String = row.get(1)?;
            let raw_plan_key: String = row.get(2)?;
            let school_id: String = row.get(3)?;
            let major_code: String = row.get(4)?;
            let exam_subjects_str: String = row.get(7)?;
            let special_plans_str: String = row.get(10)?;
            let special_plans: Vec<String> =
                serde_json::from_str(&special_plans_str).unwrap_or_default();
            Ok(WorkspaceDepartment {
                department_id,
                source_department_id,
                plan_key: workspace_plan_key(raw_plan_key, &school_id, &major_code, department_id),
                school_id,
                major_code,
                name: row.get(5)?,
                research_direction: row.get(6)?,
                exam_subjects: exam_subjects_str
                    .split(',')
                    .map(|s| s.to_string())
                    .collect(),
                study_mode: row.get(8)?,
                exam_type: row.get(9)?,
                special_plans,
                enrollment_count: row.get(11)?,
                source: row.get(12)?,
                updated_at: row.get(13)?,
                years: Vec::new(),
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let department_ids: Vec<i64> = departments.iter().map(|d| d.department_id).collect();
    let years_by_department = batch_get_department_years(conn, &department_ids, normalized);
    for department in &mut departments {
        if let Some(years) = years_by_department.get(&department.department_id) {
            department.years = years.clone();
        }
    }
    departments
}

// ISSUE-027 阶段 2：招生计划视图。JOIN workspace_schools + workspace_departments 返回扁平行。
// 筛选条件复用 get_workspace_schools 的逻辑；单科分数筛选用 EXISTS 子查询避免行重复。
// years 批量查询避免 N+1；排序在 Rust 侧做（latest_min_score/latest_enroll_count 需 years[0]）。
fn get_workspace_plan_base_rows(
    conn: &Connection,
    major_codes: &[&str],
    params: WorkspaceFilterParams,
) -> Vec<WorkspacePlanRow> {
    if major_codes.is_empty() {
        return Vec::new();
    }

    let normalized = normalized_model_ready(conn, major_codes);
    let departments_source = workspace_departments_source(normalized);
    let years_source = workspace_years_source(normalized);
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    let mut idx: usize = 1;

    // major_code IN (...)
    {
        let placeholders: Vec<String> = major_codes
            .iter()
            .map(|_| {
                let p = format!("?{}", idx);
                idx += 1;
                p
            })
            .collect();
        conditions.push(format!("s.major_code IN ({})", placeholders.join(",")));
        values.extend(
            major_codes
                .iter()
                .map(|c| rusqlite::types::Value::Text((*c).to_string())),
        );
    }

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

    // 省份筛选：显式列表优先，其次单省，最后区域分组
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
                let p = format!("?{}", idx);
                idx += 1;
                p
            })
            .collect();
        conditions.push(format!("s.province IN ({})", placeholders.join(",")));
        values.extend(
            selected_provinces
                .iter()
                .map(|p| rusqlite::types::Value::Text((*p).to_string())),
        );
    }

    // 层次标签筛选
    if let Some(levels) = params.levels {
        if !levels.is_empty() {
            let mut or_conditions: Vec<String> = Vec::new();
            for level in levels {
                match *level {
                    "自划线" => or_conditions.push("s.self_scoring = 1".to_string()),
                    "科研院所" => or_conditions.push(
                        "(s.name LIKE '%研究院%' OR s.name LIKE '%研究所%' OR s.name LIKE '%科学院%' OR s.name LIKE '%研究生院%')"
                            .to_string(),
                    ),
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

    // 院校级分数/人数范围（作用于 s.min_score / s.enroll_count 聚合值，与院校视图语义一致）
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.min_score >= ?__IDX__",
        params.min_score_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.min_score <= ?__IDX__",
        params.min_score_max.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.enroll_count >= ?__IDX__",
        params.enroll_count_min.map(Into::into),
    );
    push_opt(
        &mut conditions,
        &mut values,
        &mut idx,
        "s.enroll_count <= ?__IDX__",
        params.enroll_count_max.map(Into::into),
    );

    // 院系名称/研究方向筛选
    if let Some(name) = params.department_name {
        conditions.push(format!("d.name LIKE '%' || ?{} || '%'", idx));
        values.push(rusqlite::types::Value::Text(name.to_string()));
        idx += 1;
    }
    if let Some(direction) = params.research_direction {
        conditions.push(format!("d.research_direction LIKE '%' || ?{} || '%'", idx));
        values.push(rusqlite::types::Value::Text(direction.to_string()));
        idx += 1;
    }
    if let Some(query) = params.search_query.filter(|query| !query.trim().is_empty()) {
        conditions.push(format!(
            "(s.name LIKE '%' || ?{0} || '%' OR s.school_code LIKE '%' || ?{0} || '%' OR d.name LIKE '%' || ?{0} || '%' OR d.research_direction LIKE '%' || ?{0} || '%')",
            idx
        ));
        values.push(rusqlite::types::Value::Text(query.trim().to_string()));
        idx += 1;
    }

    // 院校特征
    if params.self_scoring == Some(true) {
        conditions.push("s.self_scoring = 1".to_string());
    }
    if params.doctoral_program == Some(true) {
        conditions.push("s.doctoral_program = 1".to_string());
    }
    if params.double_first_class == Some(true) {
        conditions.push("s.double_first_class = 1".to_string());
    }

    // 院系级筛选：学习方式/考试方式/专项计划（LIKE 支持逗号分隔多值）
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

    // 考试科目筛选（多选，任一匹配）
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

    // 单科范围必须由同一年份行同时满足，避免跨年拼接。
    let mut year_conditions = Vec::new();
    if let Some(v) = params.english_min {
        year_conditions.push(format!("y.english >= ?{}", idx));
        values.push(rusqlite::types::Value::Integer(v as i64));
        idx += 1;
    }
    if let Some(v) = params.english_max {
        year_conditions.push(format!("y.english <= ?{}", idx));
        values.push(rusqlite::types::Value::Integer(v as i64));
        idx += 1;
    }
    if let Some(v) = params.business_one_min {
        year_conditions.push(format!("y.math >= ?{}", idx));
        values.push(rusqlite::types::Value::Integer(v as i64));
        idx += 1;
    }
    if let Some(v) = params.business_one_max {
        year_conditions.push(format!("y.math <= ?{}", idx));
        values.push(rusqlite::types::Value::Integer(v as i64));
        idx += 1;
    }
    if let Some(v) = params.business_two_min {
        year_conditions.push(format!("y.specialized >= ?{}", idx));
        values.push(rusqlite::types::Value::Integer(v as i64));
        idx += 1;
    }
    if let Some(v) = params.business_two_max {
        year_conditions.push(format!("y.specialized <= ?{}", idx));
        values.push(rusqlite::types::Value::Integer(v as i64));
    }
    if !year_conditions.is_empty() {
        conditions.push(format!(
            "EXISTS(SELECT 1 FROM {} y WHERE y.department_id = d.department_id AND {})",
            years_source,
            year_conditions.join(" AND ")
        ));
    }

    let where_sql = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };
    let sql = format!(
        "SELECT s.school_id, s.school_code, s.name, s.province, s.level, s.is_985, s.is_211,
                s.double_first_class, s.self_scoring, s.doctoral_program, s.display_order,
                s.source, s.updated_at, s.major_code,
                d.department_id, d.source_department_id, d.plan_key, d.name, d.research_direction,
                d.exam_subjects, d.study_mode, d.exam_type, d.special_plans, d.enrollment_count, d.source, d.updated_at,
                COALESCE((SELECT y.year FROM {years} y WHERE y.department_id = d.department_id ORDER BY y.year DESC LIMIT 1), 0),
                COALESCE((SELECT y.year FROM {years} y WHERE y.department_id = d.department_id AND y.score_scope NOT IN ('first_level_reference', 'category_reference') ORDER BY y.year DESC LIMIT 1), 0),
                COALESCE((SELECT y.min_score FROM {years} y WHERE y.department_id = d.department_id AND y.score_scope NOT IN ('first_level_reference', 'category_reference') ORDER BY y.year DESC LIMIT 1), 0),
                COALESCE((SELECT y.enroll_count FROM {years} y WHERE y.department_id = d.department_id ORDER BY y.year DESC LIMIT 1), 0)
         FROM workspace_schools s
         JOIN {departments} d ON d.school_id = s.school_id AND d.major_code = s.major_code
         {where_sql}",
        years = years_source,
        departments = departments_source,
        where_sql = where_sql
    );

    let mut stmt = conn.prepare(&sql).unwrap();
    let mut plan_rows: Vec<WorkspacePlanRow> = stmt
        .query_map(rusqlite::params_from_iter(values.iter()), |row| {
            let school_id: String = row.get(0)?;
            let major_code: String = row.get(13)?;
            let department_id: i64 = row.get(14)?;
            let source_department_id: String = row.get(15)?;
            let raw_plan_key: String = row.get(16)?;
            let exam_subjects_str: String = row.get(19)?;
            let special_plans_str: String = row.get(22)?;
            let special_plans: Vec<String> =
                serde_json::from_str(&special_plans_str).unwrap_or_default();
            Ok(WorkspacePlanRow {
                school_id: school_id.clone(),
                school_code: row.get(1)?,
                school_name: row.get(2)?,
                province: row.get(3)?,
                level: row.get(4)?,
                is_985: row.get::<_, i32>(5)? != 0,
                is_211: row.get::<_, i32>(6)? != 0,
                double_first_class: row.get::<_, i32>(7)? != 0,
                self_scoring: row.get::<_, i32>(8)? != 0,
                doctoral_program: row.get::<_, i32>(9)? != 0,
                display_order: row.get(10)?,
                school_source: row.get(11)?,
                school_updated_at: row.get(12)?,
                major_code: major_code.clone(),
                department_id,
                source_department_id,
                plan_key: workspace_plan_key(raw_plan_key, &school_id, &major_code, department_id),
                department_name: row.get(17)?,
                research_direction: row.get(18)?,
                exam_subjects: exam_subjects_str
                    .split(',')
                    .map(|s| s.to_string())
                    .collect(),
                study_mode: row.get(20)?,
                exam_type: row.get(21)?,
                special_plans,
                department_source: row.get(24)?,
                department_updated_at: row.get(25)?,
                latest_year: row.get(26)?,
                latest_plan_year: row.get(26)?,
                latest_score_year: row.get(27)?,
                latest_min_score: row.get(28)?,
                latest_enroll_count: row.get(23)?,
                years: Vec::new(),
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let sort_by = params.sort_by.unwrap_or("min_score");
    let sort_asc = params.sort_order.unwrap_or("desc") == "asc";
    plan_rows.sort_by(|a, b| {
        let cmp = match sort_by {
            "enroll_count" => a.latest_enroll_count.cmp(&b.latest_enroll_count),
            "name" => a.school_name.cmp(&b.school_name),
            "department_name" => a.department_name.cmp(&b.department_name),
            "research_direction" => a.research_direction.cmp(&b.research_direction),
            "school_code" => a.school_code.cmp(&b.school_code),
            "default" => a.display_order.cmp(&b.display_order),
            _ => a.latest_min_score.cmp(&b.latest_min_score),
        };
        let ordered = if sort_asc { cmp } else { cmp.reverse() };
        ordered.then_with(|| a.plan_key.cmp(&b.plan_key))
    });

    plan_rows
}

fn populate_workspace_plan_years(
    conn: &Connection,
    major_codes: &[&str],
    plan_rows: &mut [WorkspacePlanRow],
) {
    if plan_rows.is_empty() {
        return;
    }
    let normalized = normalized_model_ready(conn, major_codes);
    let dept_ids: Vec<i64> = plan_rows.iter().map(|p| p.department_id).collect();
    let years_map = batch_get_department_years(conn, &dept_ids, normalized);
    for plan in plan_rows {
        if let Some(years) = years_map.get(&plan.department_id) {
            plan.years = years.clone();
        }
    }
}

pub fn get_workspace_plans(
    conn: &Connection,
    major_codes: &[&str],
    params: WorkspaceFilterParams,
) -> Vec<WorkspacePlanRow> {
    let mut plan_rows = get_workspace_plan_base_rows(conn, major_codes, params);
    populate_workspace_plan_years(conn, major_codes, &mut plan_rows);
    plan_rows
}

pub fn get_workspace_plans_page(
    conn: &Connection,
    major_codes: &[&str],
    params: WorkspaceFilterParams,
    page: i64,
    page_size: i64,
) -> WorkspacePlanPage {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);
    let mut plan_rows = get_workspace_plan_base_rows(conn, major_codes, params);
    let total = plan_rows.len() as i64;
    let offset = ((page - 1) * page_size) as usize;
    let mut items = if offset >= plan_rows.len() {
        Vec::new()
    } else {
        plan_rows
            .drain(offset..std::cmp::min(offset + page_size as usize, total as usize))
            .collect()
    };
    populate_workspace_plan_years(conn, major_codes, &mut items);
    WorkspacePlanPage { items, total }
}

// 批量查询多个 department_id 的 years，按 department_id 分组，每组 year DESC 排序。
fn batch_get_department_years(
    conn: &Connection,
    dept_ids: &[i64],
    normalized: bool,
) -> std::collections::HashMap<i64, Vec<WorkspaceYear>> {
    let mut map: std::collections::HashMap<i64, Vec<WorkspaceYear>> =
        std::collections::HashMap::new();
    if dept_ids.is_empty() {
        return map;
    }
    let placeholders: Vec<String> = (0..dept_ids.len()).map(|i| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT department_id, year, enroll_count, min_score, politics, english, math, specialized,
                score_scope, source, updated_at, match_note
         FROM {}
         WHERE department_id IN ({})
         ORDER BY department_id, year DESC",
        workspace_years_source(normalized),
        placeholders.join(",")
    );
    let params: Vec<&dyn rusqlite::ToSql> = dept_ids
        .iter()
        .map(|id| id as &dyn rusqlite::ToSql)
        .collect();
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return map,
    };
    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                WorkspaceYear {
                    year: row.get(1)?,
                    enroll_count: row.get(2)?,
                    min_score: row.get(3)?,
                    politics: row.get(4)?,
                    english: row.get(5)?,
                    math: row.get(6)?,
                    specialized: row.get(7)?,
                    score_scope: row.get(8)?,
                    source: row.get(9)?,
                    updated_at: row.get(10)?,
                    match_note: row.get(11)?,
                },
            ))
        })
        .unwrap();
    for r in rows.filter_map(|r| r.ok()) {
        map.entry(r.0).or_default().push(r.1);
    }
    map
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
pub struct PlanFavorite {
    pub favorite_id: i64,
    pub school_id: String,
    pub school_name: String,
    pub major_code: String,
    pub department_name: String,
    pub research_direction: String,
    pub exam_subjects: Vec<String>,
    pub study_mode: String,
    pub exam_type: String,
    pub special_plans: Vec<String>,
    pub created_at: i64,
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
        .map_or(0, |duration| duration.as_secs() as i64)
}

pub fn get_favorites(conn: &Connection, major_code: Option<&str>) -> Vec<Favorite> {
    let sql = "SELECT f.school_id, f.major_code, f.major_name, f.created_at,
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
    let major_refs: Vec<&str> = major_codes.iter().map(String::as_str).collect();
    let normalized = normalized_model_ready(conn, &major_refs);
    let departments_source = workspace_departments_source(normalized);
    let years_source = workspace_years_source(normalized);

    let placeholders = school_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut dept_stmt = conn
        .prepare(&format!(
            "SELECT department_id, school_id, major_code, name, study_mode, exam_type, exam_subjects, special_plans
             FROM {}
             WHERE school_id IN ({}) AND major_code IN ({})",
            departments_source, placeholders, placeholders
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
        let (
            dept_id,
            sid,
            mcode,
            name,
            study_mode,
            exam_type,
            exam_subjects_str,
            special_plans_str,
        ) = row;
        let exam_subjects: Vec<String> = exam_subjects_str
            .split(',')
            .map(|s| s.to_string())
            .collect();
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
        let placeholders = all_dept_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let mut year_stmt = conn
            .prepare(&format!(
                "SELECT department_id, english, math, specialized
                 FROM {}
                 WHERE department_id IN ({})",
                years_source, placeholders
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
        if let Some(depts) = depts_by_pair.remove(&(fav.school_id.clone(), fav.major_code.clone()))
        {
            fav.departments = depts;
        }
    }

    favorites
}

pub fn add_favorite(
    conn: &Connection,
    school_id: &str,
    major_code: &str,
    major_name: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO favorites (school_id, major_code, major_name, created_at) VALUES (?1, ?2, ?3, ?4)",
        [school_id, major_code, major_name, &now_unix_secs().to_string()],
    )?;
    Ok(())
}

pub fn remove_favorite(
    conn: &Connection,
    school_id: &str,
    major_code: &str,
) -> Result<(), rusqlite::Error> {
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

pub fn get_plan_favorites(conn: &Connection) -> Result<Vec<PlanFavorite>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT favorite_id, school_id, school_name, major_code, department_name,
                    research_direction, exam_subjects, study_mode, exam_type, special_plans, created_at
             FROM plan_favorites
             ORDER BY created_at DESC, favorite_id DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, i64>(10)?,
            ))
        })
        .map_err(|err| err.to_string())?;

    rows.map(|row| {
        let (
            favorite_id,
            school_id,
            school_name,
            major_code,
            department_name,
            research_direction,
            exam_subjects,
            study_mode,
            exam_type,
            special_plans,
            created_at,
        ) = row.map_err(|err| err.to_string())?;
        Ok(PlanFavorite {
            favorite_id,
            school_id,
            school_name,
            major_code,
            department_name,
            research_direction,
            exam_subjects: serde_json::from_str(&exam_subjects).map_err(|err| err.to_string())?,
            study_mode,
            exam_type,
            special_plans: serde_json::from_str(&special_plans).map_err(|err| err.to_string())?,
            created_at,
        })
    })
    .collect()
}

pub fn toggle_plan_favorite(
    conn: &Connection,
    school_id: &str,
    school_name: &str,
    major_code: &str,
    department_name: &str,
    research_direction: &str,
    exam_subjects: &[String],
    study_mode: &str,
    exam_type: &str,
    special_plans: &[String],
) -> Result<bool, String> {
    let exam_subjects_json = serde_json::to_string(exam_subjects).map_err(|err| err.to_string())?;
    let special_plans_json = serde_json::to_string(special_plans).map_err(|err| err.to_string())?;
    let existing_id = conn
        .query_row(
            "SELECT favorite_id FROM plan_favorites
             WHERE school_id = ?1 AND major_code = ?2 AND department_name = ?3
               AND research_direction = ?4 AND exam_subjects = ?5",
            rusqlite::params![
                school_id,
                major_code,
                department_name,
                research_direction,
                exam_subjects_json,
            ],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;

    if let Some(favorite_id) = existing_id {
        conn.execute(
            "DELETE FROM plan_favorites WHERE favorite_id = ?1",
            [favorite_id],
        )
        .map_err(|err| err.to_string())?;
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO plan_favorites
         (school_id, school_name, major_code, department_name, research_direction,
          exam_subjects, study_mode, exam_type, special_plans, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            school_id,
            school_name,
            major_code,
            department_name,
            research_direction,
            exam_subjects_json,
            study_mode,
            exam_type,
            special_plans_json,
            now_unix_secs(),
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(true)
}

pub fn remove_plan_favorite(
    conn: &Connection,
    school_id: &str,
    major_code: &str,
    department_name: &str,
    research_direction: &str,
    exam_subjects: &[String],
) -> Result<(), String> {
    let exam_subjects_json = serde_json::to_string(exam_subjects).map_err(|err| err.to_string())?;
    conn.execute(
        "DELETE FROM plan_favorites
         WHERE school_id = ?1 AND major_code = ?2 AND department_name = ?3
           AND research_direction = ?4 AND exam_subjects = ?5",
        rusqlite::params![
            school_id,
            major_code,
            department_name,
            research_direction,
            exam_subjects_json,
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn get_recent_views(conn: &Connection, limit: i64) -> Vec<RecentView> {
    let mut stmt = conn
        .prepare(
            "SELECT r.school_id, r.major_code, r.major_name, r.viewed_at,
                    s.name, s.province, s.level
             FROM recent_views r
             JOIN workspace_schools s ON s.school_id = r.school_id AND s.major_code = r.major_code
             ORDER BY r.viewed_at DESC
             LIMIT ?1",
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

pub fn add_recent_view(
    conn: &Connection,
    school_id: &str,
    major_code: &str,
    major_name: &str,
) -> Result<(), rusqlite::Error> {
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
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn creates_missing_database_without_recovery() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("nested/yam-desktop.db");

        let (conn, status) = open_or_recover_database(&db_path).unwrap();

        assert!(db_path.exists());
        assert!(!status.recovered);
        assert_eq!(status.backup_path, None);
        assert_eq!(check_database(&conn), Ok(()));
    }

    #[test]
    fn backs_up_invalid_database_and_creates_healthy_replacement() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("yam-desktop.db");
        let original = b"this is not a sqlite database";
        fs::write(&db_path, original).unwrap();

        let (conn, status) = open_or_recover_database(&db_path).unwrap();

        assert!(status.recovered);
        assert_eq!(check_database(&conn), Ok(()));
        let backup_path = status.backup_path.map(PathBuf::from).unwrap();
        assert!(backup_path.exists());
        assert_eq!(fs::read(backup_path).unwrap(), original);
        assert_ne!(fs::read(db_path).unwrap(), original);
    }

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

    fn empty_filters() -> WorkspaceFilterParams<'static> {
        WorkspaceFilterParams {
            province: None,
            provinces: None,
            region_group: None,
            levels: None,
            sort_by: None,
            sort_order: None,
            min_score_min: None,
            min_score_max: None,
            enroll_count_min: None,
            enroll_count_max: None,
            department_name: None,
            research_direction: None,
            study_modes: None,
            exam_types: None,
            self_scoring: None,
            doctoral_program: None,
            double_first_class: None,
            special_plans: None,
            english_min: None,
            english_max: None,
            business_one_min: None,
            business_one_max: None,
            business_two_min: None,
            business_two_max: None,
            foreign_subjects: None,
            business_one_subjects: None,
            business_two_subjects: None,
            search_query: None,
        }
    }

    #[test]
    fn workspace_school_pagination_groups_majors_and_is_stable() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let schools = [
            ("school-a", "081200", "同分大学甲", "10001", 320, 10, 2),
            ("school-a", "083500", "同分大学甲", "10001", 300, 15, 2),
            ("school-b", "081200", "同分大学乙", "10002", 300, 25, 1),
            ("school-c", "081200", "搜索大学", "10003", 310, 5, 3),
        ];
        for (
            index,
            (school_id, major_code, name, school_code, min_score, enroll_count, display_order),
        ) in schools.into_iter().enumerate()
        {
            conn.execute(
                "INSERT INTO workspace_schools
                 (school_id, major_code, name, province, level, min_score, enroll_count,
                  school_code, display_order)
                 VALUES (?1, ?2, ?3, '北京', '普通', ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    school_id,
                    major_code,
                    name,
                    min_score,
                    enroll_count,
                    school_code,
                    display_order
                ],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO workspace_departments
                 (department_id, plan_key, school_id, major_code, name, research_direction,
                  exam_subjects, study_mode, exam_type, special_plans)
                 VALUES (?1, ?2, ?3, ?4, '计算机学院', '方向', '', '全日制', '统考', '[]')",
                rusqlite::params![
                    index as i64 + 1,
                    format!("plan-{index}"),
                    school_id,
                    major_code
                ],
            )
            .unwrap();
        }

        let mut first_filters = empty_filters();
        first_filters.sort_by = Some("min_score");
        first_filters.sort_order = Some("asc");
        let first = get_workspace_schools_page(&conn, &["081200", "083500"], first_filters, 1, 1);
        let mut second_filters = empty_filters();
        second_filters.sort_by = Some("min_score");
        second_filters.sort_order = Some("asc");
        let second = get_workspace_schools_page(&conn, &["081200", "083500"], second_filters, 2, 1);

        assert_eq!(first.total, 3);
        assert_eq!(second.total, 3);
        assert_eq!(first.items.len(), 2);
        assert!(first.items.iter().all(|row| row.school_id == "school-a"));
        assert_eq!(
            first
                .items
                .iter()
                .map(|row| row.major_code.as_str())
                .collect::<Vec<_>>(),
            vec!["081200", "083500"]
        );
        assert_eq!(second.items.len(), 1);
        assert_eq!(second.items[0].school_id, "school-b");
        assert!(first.items.iter().all(|left| second
            .items
            .iter()
            .all(|right| left.school_id != right.school_id)));

        let mut enroll_filters = empty_filters();
        enroll_filters.sort_by = Some("enroll_count");
        enroll_filters.sort_order = Some("desc");
        let enroll_page =
            get_workspace_schools_page(&conn, &["081200", "083500"], enroll_filters, 1, 2);
        assert_eq!(enroll_page.items[0].school_id, "school-a");
        assert_eq!(enroll_page.items[1].school_id, "school-a");
        assert_eq!(enroll_page.items[2].school_id, "school-b");

        let mut search_filters = empty_filters();
        search_filters.search_query = Some("10003");
        let paged_search =
            get_workspace_schools_page(&conn, &["081200", "083500"], search_filters, 1, 20);
        let mut full_search_filters = empty_filters();
        full_search_filters.search_query = Some("10003");
        let full_search = get_workspace_schools(&conn, &["081200", "083500"], full_search_filters);
        assert_eq!(paged_search.total, 1);
        assert_eq!(paged_search.items.len(), 1);
        assert_eq!(paged_search.items[0].school_id, "school-c");
        assert_eq!(paged_search.items.len(), full_search.len());

        let clamped =
            get_workspace_schools_page(&conn, &["081200", "083500"], empty_filters(), 0, 500);
        assert_eq!(clamped.total, 3);
        assert_eq!(clamped.items.len(), 4);
    }

    #[test]
    fn workspace_plan_subject_filters_use_one_year_row() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn.execute("INSERT INTO workspace_schools (school_id, major_code, name, province, level, min_score, enroll_count) VALUES ('s', '081200', '测试', '北京', '普通', 300, 1)", []).unwrap();
        conn.execute("INSERT INTO workspace_departments (department_id, plan_key, school_id, major_code, name, research_direction, exam_subjects) VALUES (1, 'p', 's', '081200', '院系', '真实方向', '')", []).unwrap();
        conn.execute("INSERT INTO workspace_department_years (department_id, year, enroll_count, min_score, politics, english, math, specialized) VALUES (1, 2024, 1, 300, 0, 60, 80, 90), (1, 2025, 1, 300, 0, 70, 90, 80)", []).unwrap();
        let mut filters = empty_filters();
        filters.english_min = Some(65);
        filters.business_two_min = Some(85);
        assert!(get_workspace_plans(&conn, &["081200"], filters).is_empty());
    }

    #[test]
    fn workspace_plan_pagination_is_stable_and_loads_only_page_years() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO workspace_schools
             (school_id, major_code, name, province, level, min_score, enroll_count, school_code)
             VALUES ('school-1', '081200', '测试大学', '北京', '985', 300, 50, '10001')",
            [],
        )
        .unwrap();
        for index in 1..=5 {
            conn.execute(
                "INSERT INTO workspace_departments
                 (department_id, source_department_id, plan_key, school_id, major_code, name,
                  research_direction, exam_subjects, study_mode, exam_type, special_plans)
                 VALUES (?1, ?2, ?3, 'school-1', '081200', ?4, ?5, '101政治,201英语', '全日制', '统考', '[]')",
                rusqlite::params![
                    index,
                    format!("dept-{index}"),
                    format!("plan-{index}"),
                    format!("院系{index}"),
                    format!("方向{index}")
                ],
            )
            .unwrap();
            for year in [2024, 2025] {
                conn.execute(
                    "INSERT INTO workspace_department_years
                     (department_id, year, enroll_count, min_score, politics, english, math, specialized)
                     VALUES (?1, ?2, ?3, ?4, 50, 60, 70, 80)",
                    rusqlite::params![index, year, index * 10 + year - 2024, 300 + index * 10 + year - 2024],
                )
                .unwrap();
            }
        }

        let mut page_one_filters = empty_filters();
        page_one_filters.sort_by = Some("min_score");
        page_one_filters.sort_order = Some("desc");
        let page_one = get_workspace_plans_page(&conn, &["081200"], page_one_filters, 1, 2);
        let mut page_two_filters = empty_filters();
        page_two_filters.sort_by = Some("min_score");
        page_two_filters.sort_order = Some("desc");
        let page_two = get_workspace_plans_page(&conn, &["081200"], page_two_filters, 2, 2);

        assert_eq!(page_one.total, 5);
        assert_eq!(page_one.items.len(), 2);
        assert_eq!(page_two.total, 5);
        assert_eq!(page_two.items.len(), 2);
        assert_eq!(page_one.items[0].latest_min_score, 351);
        assert_eq!(page_one.items[1].latest_min_score, 341);
        assert!(page_one.items.iter().all(|plan| plan.years.len() == 2));
        assert!(page_two.items.iter().all(|plan| plan.years.len() == 2));
        assert!(page_one.items.iter().all(|first| {
            page_two
                .items
                .iter()
                .all(|second| first.plan_key != second.plan_key)
        }));

        let mut search_filters = empty_filters();
        search_filters.search_query = Some("方向3");
        let filtered = get_workspace_plans_page(&conn, &["081200"], search_filters, 1, 20);
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.items[0].plan_key, "plan-3");

        let mut direction_filters = empty_filters();
        direction_filters.research_direction = Some("方向3");
        let direction_filtered = get_workspace_plans_page(&conn, &["081200"], direction_filters, 1, 20);
        assert_eq!(direction_filtered.total, 1);
        assert_eq!(direction_filtered.items[0].plan_key, "plan-3");

        let mut missing_direction_filters = empty_filters();
        missing_direction_filters.research_direction = Some("不存在方向");
        let missing_direction = get_workspace_plans_page(&conn, &["081200"], missing_direction_filters, 1, 20);
        assert_eq!(missing_direction.total, 0);
        assert!(missing_direction.items.is_empty());

        let clamped = get_workspace_plans_page(&conn, &["081200"], empty_filters(), 1, 500);
        assert_eq!(clamped.items.len(), 5);
        let out_of_range = get_workspace_plans_page(&conn, &["081200"], empty_filters(), 99, 2);
        assert_eq!(out_of_range.total, 5);
        assert!(out_of_range.items.is_empty());

        let full = get_workspace_plans(&conn, &["081200"], empty_filters());
        assert_eq!(full.len(), 5);
        assert!(full.iter().all(|plan| plan.years.len() == 2));
    }

    #[test]
    fn normalized_model_ready_requires_ready_state_and_matching_counts_for_every_major() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        assert!(!normalized_model_ready(&conn, &["085410"]));

        conn.execute(
            "INSERT INTO workspace_model_state
             (major_code, model_version, status, old_plan_count, new_plan_count, old_year_count, new_year_count)
             VALUES ('085410', 2, 'ready', 1, 1, 2, 2)",
            [],
        ).unwrap();
        assert!(normalized_model_ready(&conn, &["085410"]));

        conn.execute(
            "UPDATE workspace_model_state SET status = 'failed' WHERE major_code = '085410'",
            [],
        )
        .unwrap();
        assert!(!normalized_model_ready(&conn, &["085410"]));

        conn.execute(
            "UPDATE workspace_model_state SET status = 'ready', new_plan_count = 2 WHERE major_code = '085410'",
            [],
        ).unwrap();
        assert!(!normalized_model_ready(&conn, &["085410"]));

        conn.execute(
            "UPDATE workspace_model_state SET new_plan_count = 1 WHERE major_code = '085410'",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_model_state
             (major_code, model_version, status, old_plan_count, new_plan_count, old_year_count, new_year_count)
             VALUES ('085411', 2, 'writing', 1, 1, 1, 1)",
            [],
        ).unwrap();
        assert!(!normalized_model_ready(&conn, &["085410", "085411"]));
    }

    #[test]
    fn workspace_queries_switch_to_normalized_data_without_changing_key_fields() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        conn.execute(
            "INSERT INTO workspace_schools
             (school_id, major_code, name, province, level, min_score, enroll_count,
              school_code, source, updated_at)
             VALUES ('school-1', '085410', '测试大学', '北京', '985', 338, 24,
                     '10001', 'school-source', '2026-06-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_departments
             (department_id, source_department_id, plan_key, school_id, major_code, name,
              research_direction, exam_subjects, study_mode, exam_type, special_plans, source, updated_at)
             VALUES (101, 'dept-1', 'plan-1', 'school-1', '085410', '计算机学院',
                     '人工智能', '101政治,204英语二', '全日制', '统考', '[]', 'plan-source', '2026-06-15')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO workspace_department_years
             (department_id, year, enroll_count, min_score, politics, english, math, specialized,
              score_scope, source, updated_at, match_note)
             VALUES (101, 2025, 24, 338, 45, 50, 75, 90,
                     'exact_direction', 'score-source', '2026-07-01', '按方向精确匹配')",
            [],
        )
        .unwrap();

        let legacy_plans = get_workspace_plans(&conn, &["085410"], empty_filters());
        let legacy_departments = get_workspace_departments(&conn, "school-1", &["085410"]);
        assert_eq!(legacy_plans.len(), 1);
        assert_eq!(legacy_departments.len(), 1);

        conn.execute(
            "INSERT INTO workspace_department_entities
             (department_key, school_id, major_code, source_department_id, name, source, updated_at)
             VALUES ('department-1', 'school-1', '085410', 'dept-1', '计算机学院', 'entity-source', '2026-06-15')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO workspace_plans
             (plan_id, plan_key, department_key, school_id, major_code, research_direction,
              exam_subjects, study_mode, exam_type, special_plans, source, updated_at)
             VALUES (101, 'plan-1', 'department-1', 'school-1', '085410', '人工智能',
                     '101政治,204英语二', '全日制', '统考', '[]', 'plan-source', '2026-06-15')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_plan_years
             (plan_key, year, enroll_count, min_score, politics, english, math, specialized,
              score_scope, source, updated_at, match_note)
             VALUES ('plan-1', 2025, 24, 338, 45, 50, 75, 90,
                     'exact_direction', 'score-source', '2026-07-01', '按方向精确匹配')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_model_state
             (major_code, model_version, status, old_plan_count, new_plan_count, old_year_count, new_year_count)
             VALUES ('085410', 2, 'ready', 1, 1, 1, 1)",
            [],
        ).unwrap();

        let normalized_plans = get_workspace_plans(&conn, &["085410"], empty_filters());
        let normalized_departments = get_workspace_departments(&conn, "school-1", &["085410"]);
        assert_eq!(normalized_plans.len(), 1);
        assert_eq!(normalized_departments.len(), 1);

        let legacy_plan = &legacy_plans[0];
        let normalized_plan = &normalized_plans[0];
        assert_eq!(normalized_plan.plan_key, legacy_plan.plan_key);
        assert_eq!(normalized_plan.department_name, legacy_plan.department_name);
        assert_eq!(
            normalized_plan.years[0].min_score,
            legacy_plan.years[0].min_score
        );
        assert_eq!(
            normalized_plan.years[0].score_scope,
            legacy_plan.years[0].score_scope
        );

        let legacy_department = &legacy_departments[0];
        let normalized_department = &normalized_departments[0];
        assert_eq!(normalized_department.plan_key, legacy_department.plan_key);
        assert_eq!(normalized_department.name, legacy_department.name);
        assert_eq!(
            normalized_department.years[0].min_score,
            legacy_department.years[0].min_score
        );
        assert_eq!(
            normalized_department.years[0].score_scope,
            legacy_department.years[0].score_scope
        );
    }

    #[test]
    fn workspace_departments_batch_normalized_years_for_multiple_plans() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        conn.execute(
            "INSERT INTO workspace_department_entities
             (department_key, school_id, major_code, source_department_id, name)
             VALUES ('department-1', 'school-1', '085410', 'dept-1', '计算机学院')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_plans
             (plan_id, plan_key, department_key, school_id, major_code, research_direction,
              exam_subjects, study_mode, exam_type, special_plans)
             VALUES
             (201, 'plan-1', 'department-1', 'school-1', '085410', '人工智能',
              '101政治,204英语二', '全日制', '统考', '[]'),
             (202, 'plan-2', 'department-1', 'school-1', '085410', '软件工程',
              '101政治,201英语一', '全日制', '统考', '[]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_plan_years
             (plan_key, year, enroll_count, min_score, politics, english, math, specialized)
             VALUES
             ('plan-1', 2024, 20, 330, 45, 50, 75, 90),
             ('plan-1', 2025, 24, 338, 46, 51, 76, 91),
             ('plan-2', 2025, 18, 345, 47, 52, 77, 92)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workspace_model_state
             (major_code, model_version, status, old_plan_count, new_plan_count, old_year_count, new_year_count)
             VALUES ('085410', 2, 'ready', 2, 2, 3, 3)",
            [],
        )
        .unwrap();

        let departments = get_workspace_departments(&conn, "school-1", &["085410"]);

        assert_eq!(departments.len(), 2);
        assert_eq!(departments[0].plan_key, "plan-1");
        assert_eq!(
            departments[0]
                .years
                .iter()
                .map(|year| year.year)
                .collect::<Vec<_>>(),
            vec![2025, 2024]
        );
        assert_eq!(departments[0].years[0].min_score, 338);
        assert_eq!(departments[1].plan_key, "plan-2");
        assert_eq!(departments[1].years.len(), 1);
        assert_eq!(departments[1].years[0].min_score, 345);
    }
}
