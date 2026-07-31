use crate::db::{
    add_favorite, add_recent_view, clear_recent_views, get_available_majors, get_favorites,
    get_plan_favorites, get_recent_views, get_schools, get_score_lines, get_workspace_departments,
    get_workspace_filter_options, get_workspace_plans, get_workspace_plans_page,
    get_workspace_schools, get_workspace_schools_page, remove_favorite,
    remove_plan_favorite as remove_plan_favorite_db,
    toggle_plan_favorite as toggle_plan_favorite_db, AvailableMajor, DatabaseStatus, DbConn,
    Favorite, FilterOptions, PlanFavorite, RecentView, School, ScoreLine, WorkspaceDepartment,
    WorkspaceFilterParams, WorkspacePlanPage, WorkspacePlanRow, WorkspaceSchool,
    WorkspaceSchoolPage,
};
use crate::diagnostics::{self, DiagnosticsInfo};
use rusqlite::Connection;
use rust_xlsxwriter::{Format, Workbook};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufWriter, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(not(debug_assertions))]
const BUNDLED_BACKEND: &[u8] = include_bytes!("../resources/yam-backend.exe");

/// 创建子进程命令，在 Windows 上默认隐藏控制台窗口（避免弹出空 python.exe 黑框）。
/// 其他平台行为不变。
fn new_hidden_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[derive(Debug, PartialEq, Eq)]
struct BackendCommandSpec {
    program: PathBuf,
    args: Vec<String>,
    working_dir: PathBuf,
    resource_dir: Option<PathBuf>,
}

fn resolve_backend_command(
    debug: bool,
    resource_dir: &Path,
    home_dir: &Path,
    repo_root: &Path,
    subcommand: &str,
) -> BackendCommandSpec {
    if debug {
        BackendCommandSpec {
            program: PathBuf::from(if cfg!(windows) { "python" } else { "python3" }),
            args: vec!["-m".into(), "yam.backend_entry".into(), subcommand.into()],
            working_dir: repo_root.to_path_buf(),
            resource_dir: None,
        }
    } else {
        BackendCommandSpec {
            program: resource_dir.join("resources").join("yam-backend.exe"),
            args: vec![subcommand.into()],
            working_dir: home_dir.join(".yam"),
            resource_dir: Some(resource_dir.to_path_buf()),
        }
    }
}

fn materialize_backend_bytes(home_dir: &Path, version: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let runtime_dir = home_dir.join(".yam").join("runtime");
    std::fs::create_dir_all(&runtime_dir)
        .map_err(|error| format!("无法创建后端运行目录: {error}"))?;
    let target = runtime_dir.join(format!("yam-backend-{version}.exe"));
    if target.metadata().map(|meta| meta.len()).unwrap_or(0) == bytes.len() as u64 {
        return Ok(target);
    }
    let temporary = target.with_extension("exe.part");
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("无法释放内置后端: {error}"))?;
    if target.exists() {
        std::fs::remove_file(&target)
            .map_err(|error| format!("无法更新内置后端: {error}"))?;
    }
    std::fs::rename(&temporary, &target)
        .map_err(|error| format!("无法启用内置后端: {error}"))?;
    Ok(target)
}

fn backend_missing_error(path: &Path) -> String {
    json!({
        "code": "BACKEND_MISSING",
        "message": "内置 Python 后端缺失或安装不完整",
        "impact": "采集、登录与专业目录功能暂不可用。",
        "action": "请重新安装 YAM；若仍失败，请打开诊断目录并反馈。",
        "retryable": false,
        "path": path.file_name().and_then(|name| name.to_str()).unwrap_or("yam-backend.exe")
    })
    .to_string()
}

fn backend_command(
    app: &tauri::AppHandle,
    subcommand: &str,
) -> Result<std::process::Command, String> {
    let resource_dir = app.path().resource_dir().map_err(|error| {
        diagnostics::log("ERROR", "backend_resource_dir_failed", &error.to_string());
        backend_missing_error(Path::new("yam-backend.exe"))
    })?;
    let home_dir = app.path().home_dir().map_err(|error| {
        diagnostics::log("ERROR", "backend_home_dir_failed", &error.to_string());
        "无法确定用户数据目录".to_string()
    })?;
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .ok_or("无法确定仓库根目录")?;
    let spec = resolve_backend_command(
        cfg!(debug_assertions),
        &resource_dir,
        &home_dir,
        &repo_root,
        subcommand,
    );
    #[cfg(not(debug_assertions))]
    let spec = BackendCommandSpec {
        program: materialize_backend_bytes(
            &home_dir,
            env!("CARGO_PKG_VERSION"),
            BUNDLED_BACKEND,
        ).map_err(|error| {
            diagnostics::log("ERROR", "backend_materialize_failed", &error);
            error
        })?,
        ..spec
    };
    if !cfg!(debug_assertions) && !spec.program.is_file() {
        diagnostics::log(
            "ERROR",
            "backend_missing",
            "bundled backend executable missing",
        );
        return Err(backend_missing_error(&spec.program));
    }
    std::fs::create_dir_all(&spec.working_dir)
        .map_err(|error| format!("无法创建后端工作目录: {error}"))?;
    let mut cmd = new_hidden_command(spec.program.to_string_lossy().as_ref());
    cmd.args(spec.args).current_dir(&spec.working_dir);
    if cfg!(debug_assertions) {
        cmd.env("PYTHONPATH", &repo_root);
    }
    if let Some(resource_dir) = spec.resource_dir {
        cmd.env("YAM_RESOURCE_DIR", resource_dir);
    }
    configure_backend_environment(&mut cmd);
    Ok(cmd)
}

fn configure_backend_environment(cmd: &mut std::process::Command) {
    cmd.env("YAM_DESKTOP", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");
}

#[derive(Serialize, Clone, Debug)]
pub struct BackendRuntimeStatus {
    pub mode: String,
    pub executable_path: String,
    pub available: bool,
    pub browser: String,
    pub message: String,
}

#[tauri::command]
pub fn get_backend_runtime_status(app: tauri::AppHandle) -> BackendRuntimeStatus {
    let mode = if cfg!(debug_assertions) {
        "development"
    } else {
        "bundled"
    }
    .to_string();
    let mut command = match backend_command(&app, "doctor") {
        Ok(command) => command,
        Err(message) => {
            return BackendRuntimeStatus {
                mode,
                executable_path: "yam-backend.exe".to_string(),
                available: false,
                browser: "unknown".to_string(),
                message,
            };
        }
    };
    command.arg("--json");
    let executable_path = command.get_program().to_string_lossy().into_owned();
    match command.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let value = stdout.lines().find_map(|line| {
                line.strip_prefix("YAM_BACKEND_STATUS ")
                    .and_then(|json| serde_json::from_str::<Value>(json).ok())
            });
            BackendRuntimeStatus {
                mode,
                executable_path,
                available: value
                    .as_ref()
                    .and_then(|v| v.get("available"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                browser: value
                    .as_ref()
                    .and_then(|v| v.get("browser"))
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                message: value
                    .as_ref()
                    .and_then(|v| v.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("后端诊断未返回有效结果")
                    .to_string(),
            }
        }
        Err(_) => BackendRuntimeStatus {
            mode,
            executable_path,
            available: false,
            browser: "unknown".to_string(),
            message: "无法启动后端诊断，请重新安装 YAM".to_string(),
        },
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub impact: String,
    pub action: String,
    pub retryable: bool,
}

#[tauri::command]
pub fn get_database_status(status: State<'_, DatabaseStatus>) -> DatabaseStatus {
    status.inner().clone()
}

#[tauri::command]
pub fn get_diagnostics_info() -> DiagnosticsInfo {
    diagnostics::info()
}

#[tauri::command]
pub fn open_diagnostics_directory() -> Result<(), String> {
    let directory = diagnostics::default_log_directory();
    std::fs::create_dir_all(&directory).map_err(|err| {
        diagnostics::log(
            "ERROR",
            "diagnostics_directory_create_failed",
            &err.to_string(),
        );
        "无法创建诊断日志目录".to_string()
    })?;

    #[cfg(target_os = "windows")]
    let result = new_hidden_command("explorer").arg(&directory).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&directory).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open")
        .arg(&directory)
        .spawn();

    result.map(|_| ()).map_err(|err| {
        diagnostics::log(
            "ERROR",
            "diagnostics_directory_open_failed",
            &err.to_string(),
        );
        "无法打开诊断日志目录".to_string()
    })
}

fn db_error(code: &str, message: &str, impact: &str, action: &str) -> AppError {
    AppError {
        code: code.to_string(),
        message: message.to_string(),
        impact: impact.to_string(),
        action: action.to_string(),
        retryable: true,
    }
}

fn db_guard<T, F>(
    db: &Mutex<Connection>,
    operation: &str,
    failure_code: &str,
    query: F,
) -> Result<T, AppError>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let (conn, poisoned) = match db.lock() {
        Ok(conn) => (conn, false),
        Err(err) => {
            eprintln!(
                "[db_guard] database lock poisoned during {operation}; recovering connection"
            );
            (err.into_inner(), true)
        }
    };

    let result = match catch_unwind(AssertUnwindSafe(|| query(&conn))) {
        Ok(Ok(value)) => return Ok(value),
        Ok(Err(err)) if poisoned => db_error(
            "DB_LOCK_POISONED",
            &format!("数据库连接锁已中毒，恢复后执行{operation}仍失败: {err}"),
            "本次数据库操作未完成，现有数据保持不变。",
            "请重试；若仍失败，请重启应用。",
        ),
        Err(_) if poisoned => db_error(
            "DB_LOCK_POISONED",
            &format!("数据库连接锁已中毒，恢复后执行{operation}仍异常"),
            "本次数据库操作未完成，现有数据保持不变。",
            "请重试；若仍失败，请重启应用。",
        ),
        Ok(Err(err)) => db_error(
            failure_code,
            &format!("{operation}失败: {err}"),
            "DB_WRITE_FAILED"
                .eq(failure_code)
                .then_some("本次写入未完成，原数据未改变。")
                .unwrap_or("本次查询未完成，现有数据未改变。"),
            "请重试；若仍失败，请重启应用。",
        ),
        Err(_) => db_error(
            failure_code,
            &format!("{operation}时数据库内部发生异常"),
            "DB_WRITE_FAILED"
                .eq(failure_code)
                .then_some("本次写入未完成，原数据未改变。")
                .unwrap_or("本次查询未完成，现有数据未改变。"),
            "请重试；若仍失败，请重启应用。",
        ),
    };
    diagnostics::log(
        "ERROR",
        "database_operation_failed",
        &format!(
            "code={} operation={} message={}",
            result.code,
            operation,
            diagnostics::safe_message(&result.message, 500)
        ),
    );
    Err(result)
}

fn db_query<T, F>(db: &Mutex<Connection>, operation: &str, query: F) -> Result<T, AppError>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    db_guard(db, operation, "DB_QUERY_FAILED", query)
}

fn db_write<T, F>(db: &Mutex<Connection>, operation: &str, write: F) -> Result<T, AppError>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    db_guard(db, operation, "DB_WRITE_FAILED", write)
}

#[tauri::command]
pub fn fetch_schools(
    state: State<'_, DbConn>,
    major_code: String,
) -> Result<Vec<School>, AppError> {
    db_query(&state.0, "加载院校", |conn| {
        Ok(get_schools(conn, &major_code))
    })
}

#[tauri::command]
pub fn fetch_score_lines(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
) -> Result<Vec<ScoreLine>, AppError> {
    db_query(&state.0, "加载分数线", |conn| {
        Ok(get_score_lines(conn, &school_id, &major_code))
    })
}

#[derive(Serialize)]
pub struct WorkspaceData {
    pub schools: Vec<WorkspaceSchool>,
    pub departments: Vec<WorkspaceDepartment>,
}

#[tauri::command]
pub fn fetch_workspace_departments(
    state: State<'_, DbConn>,
    school_id: String,
    major_codes: Vec<String>,
) -> Result<Vec<WorkspaceDepartment>, AppError> {
    db_query(&state.0, "加载院系详情", |conn| {
        let major_codes_ref: Vec<&str> = major_codes.iter().map(String::as_str).collect();
        Ok(get_workspace_departments(
            conn,
            &school_id,
            &major_codes_ref,
        ))
    })
}

#[tauri::command]
pub fn fetch_workspace_data(
    state: State<'_, DbConn>,
    school_id: String,
    major_codes: Vec<String>,
    province: Option<String>,
    provinces: Option<Vec<String>>,
    region_group: Option<String>,
    levels: Option<Vec<String>>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    min_score_min: Option<i32>,
    min_score_max: Option<i32>,
    enroll_count_min: Option<i32>,
    enroll_count_max: Option<i32>,
    department_name: Option<String>,
    research_direction: Option<String>,
    study_modes: Option<Vec<String>>,
    exam_types: Option<Vec<String>>,
    self_scoring: Option<bool>,
    doctoral_program: Option<bool>,
    double_first_class: Option<bool>,
    special_plans: Option<Vec<String>>,
    english_min: Option<i32>,
    english_max: Option<i32>,
    business_one_min: Option<i32>,
    business_one_max: Option<i32>,
    business_two_min: Option<i32>,
    business_two_max: Option<i32>,
    foreign_subjects: Option<Vec<String>>,
    business_one_subjects: Option<Vec<String>>,
    business_two_subjects: Option<Vec<String>>,
    search_query: Option<String>,
) -> Result<WorkspaceData, AppError> {
    db_query(&state.0, "加载工作区数据", |conn| {
        let major_codes_ref: Vec<&str> = major_codes.iter().map(|s| s.as_str()).collect();
        let provinces_ref: Option<Vec<&str>> = provinces
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let study_modes_ref: Option<Vec<&str>> = study_modes
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let exam_types_ref: Option<Vec<&str>> = exam_types
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let special_plans_ref: Option<Vec<&str>> = special_plans
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let levels_ref: Option<Vec<&str>> = levels
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let foreign_subjects_ref: Option<Vec<&str>> = foreign_subjects
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let business_one_subjects_ref: Option<Vec<&str>> = business_one_subjects
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let business_two_subjects_ref: Option<Vec<&str>> = business_two_subjects
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());

        let schools = get_workspace_schools(
            &conn,
            &major_codes_ref,
            WorkspaceFilterParams {
                province: province.as_deref(),
                provinces: provinces_ref.as_deref(),
                region_group: region_group.as_deref(),
                levels: levels_ref.as_deref(),
                sort_by: sort_by.as_deref(),
                sort_order: sort_order.as_deref(),
                min_score_min,
                min_score_max,
                enroll_count_min,
                enroll_count_max,
                department_name: department_name.as_deref(),
                research_direction: research_direction.as_deref(),
                study_modes: study_modes_ref.as_deref(),
                exam_types: exam_types_ref.as_deref(),
                self_scoring,
                doctoral_program,
                double_first_class,
                special_plans: special_plans_ref.as_deref(),
                english_min,
                english_max,
                business_one_min,
                business_one_max,
                business_two_min,
                business_two_max,
                foreign_subjects: foreign_subjects_ref.as_deref(),
                business_one_subjects: business_one_subjects_ref.as_deref(),
                business_two_subjects: business_two_subjects_ref.as_deref(),
                search_query: search_query.as_deref(),
            },
        );
        let departments = if school_id.is_empty() {
            Vec::new()
        } else {
            get_workspace_departments(&conn, &school_id, &major_codes_ref)
        };

        Ok(WorkspaceData {
            schools,
            departments,
        })
    })
}

#[tauri::command]
pub fn fetch_workspace_schools_page(
    state: State<'_, DbConn>,
    major_codes: Vec<String>,
    province: Option<String>,
    provinces: Option<Vec<String>>,
    region_group: Option<String>,
    levels: Option<Vec<String>>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    min_score_min: Option<i32>,
    min_score_max: Option<i32>,
    enroll_count_min: Option<i32>,
    enroll_count_max: Option<i32>,
    department_name: Option<String>,
    research_direction: Option<String>,
    study_modes: Option<Vec<String>>,
    exam_types: Option<Vec<String>>,
    self_scoring: Option<bool>,
    doctoral_program: Option<bool>,
    double_first_class: Option<bool>,
    special_plans: Option<Vec<String>>,
    english_min: Option<i32>,
    english_max: Option<i32>,
    business_one_min: Option<i32>,
    business_one_max: Option<i32>,
    business_two_min: Option<i32>,
    business_two_max: Option<i32>,
    foreign_subjects: Option<Vec<String>>,
    business_one_subjects: Option<Vec<String>>,
    business_two_subjects: Option<Vec<String>>,
    search_query: Option<String>,
    page: i64,
    page_size: i64,
) -> Result<WorkspaceSchoolPage, AppError> {
    db_query(&state.0, "加载院校分页", |conn| {
        let major_codes_ref = major_codes.iter().map(String::as_str).collect::<Vec<_>>();
        let provinces_ref = provinces
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let levels_ref = levels
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let study_modes_ref = study_modes
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let exam_types_ref = exam_types
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let special_plans_ref = special_plans
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let foreign_subjects_ref = foreign_subjects
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let business_one_subjects_ref = business_one_subjects
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        let business_two_subjects_ref = business_two_subjects
            .as_ref()
            .map(|v| v.iter().map(String::as_str).collect::<Vec<_>>());
        Ok(get_workspace_schools_page(
            conn,
            &major_codes_ref,
            WorkspaceFilterParams {
                province: province.as_deref(),
                provinces: provinces_ref.as_deref(),
                region_group: region_group.as_deref(),
                levels: levels_ref.as_deref(),
                sort_by: sort_by.as_deref(),
                sort_order: sort_order.as_deref(),
                min_score_min,
                min_score_max,
                enroll_count_min,
                enroll_count_max,
                department_name: department_name.as_deref(),
                research_direction: research_direction.as_deref(),
                study_modes: study_modes_ref.as_deref(),
                exam_types: exam_types_ref.as_deref(),
                self_scoring,
                doctoral_program,
                double_first_class,
                special_plans: special_plans_ref.as_deref(),
                english_min,
                english_max,
                business_one_min,
                business_one_max,
                business_two_min,
                business_two_max,
                foreign_subjects: foreign_subjects_ref.as_deref(),
                business_one_subjects: business_one_subjects_ref.as_deref(),
                business_two_subjects: business_two_subjects_ref.as_deref(),
                search_query: search_query.as_deref(),
            },
            page,
            page_size,
        ))
    })
}

// ISSUE-027 阶段 2：招生计划视图。返回扁平行 (院校, 专业, 院系, 方向, 考试科目, 最新年份分数线)。
// 筛选参数同 fetch_workspace_data，但不需要 school_id（返回全量 plan 行）。
#[tauri::command]
pub fn fetch_workspace_plans(
    state: State<'_, DbConn>,
    major_codes: Vec<String>,
    province: Option<String>,
    provinces: Option<Vec<String>>,
    region_group: Option<String>,
    levels: Option<Vec<String>>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    min_score_min: Option<i32>,
    min_score_max: Option<i32>,
    enroll_count_min: Option<i32>,
    enroll_count_max: Option<i32>,
    department_name: Option<String>,
    research_direction: Option<String>,
    study_modes: Option<Vec<String>>,
    exam_types: Option<Vec<String>>,
    self_scoring: Option<bool>,
    doctoral_program: Option<bool>,
    double_first_class: Option<bool>,
    special_plans: Option<Vec<String>>,
    english_min: Option<i32>,
    english_max: Option<i32>,
    business_one_min: Option<i32>,
    business_one_max: Option<i32>,
    business_two_min: Option<i32>,
    business_two_max: Option<i32>,
    foreign_subjects: Option<Vec<String>>,
    business_one_subjects: Option<Vec<String>>,
    business_two_subjects: Option<Vec<String>>,
    search_query: Option<String>,
) -> Result<Vec<WorkspacePlanRow>, AppError> {
    db_query(&state.0, "加载招生计划", |conn| {
        let major_codes_ref: Vec<&str> = major_codes.iter().map(|s| s.as_str()).collect();
        let provinces_ref: Option<Vec<&str>> = provinces
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let study_modes_ref: Option<Vec<&str>> = study_modes
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let exam_types_ref: Option<Vec<&str>> = exam_types
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let special_plans_ref: Option<Vec<&str>> = special_plans
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let levels_ref: Option<Vec<&str>> = levels
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let foreign_subjects_ref: Option<Vec<&str>> = foreign_subjects
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let business_one_subjects_ref: Option<Vec<&str>> = business_one_subjects
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());
        let business_two_subjects_ref: Option<Vec<&str>> = business_two_subjects
            .as_ref()
            .map(|v| v.iter().map(|s| s.as_str()).collect());

        Ok(get_workspace_plans(
            conn,
            &major_codes_ref,
            WorkspaceFilterParams {
                province: province.as_deref(),
                provinces: provinces_ref.as_deref(),
                region_group: region_group.as_deref(),
                levels: levels_ref.as_deref(),
                sort_by: sort_by.as_deref(),
                sort_order: sort_order.as_deref(),
                min_score_min,
                min_score_max,
                enroll_count_min,
                enroll_count_max,
                department_name: department_name.as_deref(),
                research_direction: research_direction.as_deref(),
                study_modes: study_modes_ref.as_deref(),
                exam_types: exam_types_ref.as_deref(),
                self_scoring,
                doctoral_program,
                double_first_class,
                special_plans: special_plans_ref.as_deref(),
                english_min,
                english_max,
                business_one_min,
                business_one_max,
                business_two_min,
                business_two_max,
                foreign_subjects: foreign_subjects_ref.as_deref(),
                business_one_subjects: business_one_subjects_ref.as_deref(),
                business_two_subjects: business_two_subjects_ref.as_deref(),
                search_query: search_query.as_deref(),
            },
        ))
    })
}

#[tauri::command]
pub fn fetch_workspace_plans_page(
    state: State<'_, DbConn>,
    major_codes: Vec<String>,
    province: Option<String>,
    provinces: Option<Vec<String>>,
    region_group: Option<String>,
    levels: Option<Vec<String>>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    min_score_min: Option<i32>,
    min_score_max: Option<i32>,
    enroll_count_min: Option<i32>,
    enroll_count_max: Option<i32>,
    department_name: Option<String>,
    research_direction: Option<String>,
    study_modes: Option<Vec<String>>,
    exam_types: Option<Vec<String>>,
    self_scoring: Option<bool>,
    doctoral_program: Option<bool>,
    double_first_class: Option<bool>,
    special_plans: Option<Vec<String>>,
    english_min: Option<i32>,
    english_max: Option<i32>,
    business_one_min: Option<i32>,
    business_one_max: Option<i32>,
    business_two_min: Option<i32>,
    business_two_max: Option<i32>,
    foreign_subjects: Option<Vec<String>>,
    business_one_subjects: Option<Vec<String>>,
    business_two_subjects: Option<Vec<String>>,
    search_query: Option<String>,
    page: i64,
    page_size: i64,
) -> Result<WorkspacePlanPage, AppError> {
    db_query(&state.0, "加载招生计划分页", |conn| {
        let major_codes_ref: Vec<&str> = major_codes.iter().map(|s| s.as_str()).collect();
        let provinces_ref = provinces
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let levels_ref = levels
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let study_modes_ref = study_modes
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let exam_types_ref = exam_types
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let special_plans_ref = special_plans
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let foreign_subjects_ref = foreign_subjects
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let business_one_subjects_ref = business_one_subjects
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        let business_two_subjects_ref = business_two_subjects
            .as_ref()
            .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
        Ok(get_workspace_plans_page(
            conn,
            &major_codes_ref,
            WorkspaceFilterParams {
                province: province.as_deref(),
                provinces: provinces_ref.as_deref(),
                region_group: region_group.as_deref(),
                levels: levels_ref.as_deref(),
                sort_by: sort_by.as_deref(),
                sort_order: sort_order.as_deref(),
                min_score_min,
                min_score_max,
                enroll_count_min,
                enroll_count_max,
                department_name: department_name.as_deref(),
                research_direction: research_direction.as_deref(),
                study_modes: study_modes_ref.as_deref(),
                exam_types: exam_types_ref.as_deref(),
                self_scoring,
                doctoral_program,
                double_first_class,
                special_plans: special_plans_ref.as_deref(),
                english_min,
                english_max,
                business_one_min,
                business_one_max,
                business_two_min,
                business_two_max,
                foreign_subjects: foreign_subjects_ref.as_deref(),
                business_one_subjects: business_one_subjects_ref.as_deref(),
                business_two_subjects: business_two_subjects_ref.as_deref(),
                search_query: search_query.as_deref(),
            },
            page,
            page_size,
        ))
    })
}

#[tauri::command]
pub fn fetch_workspace_filter_options(
    state: State<'_, DbConn>,
    major_codes: Vec<String>,
) -> Result<FilterOptions, AppError> {
    db_query(&state.0, "加载筛选项", |conn| {
        let major_codes_ref: Vec<&str> = major_codes.iter().map(|s| s.as_str()).collect();
        Ok(get_workspace_filter_options(conn, &major_codes_ref))
    })
}

#[tauri::command]
pub fn fetch_available_majors(state: State<'_, DbConn>) -> Result<Vec<AvailableMajor>, AppError> {
    db_query(&state.0, "加载可用专业", |conn| {
        Ok(get_available_majors(conn))
    })
}

#[tauri::command]
pub fn fetch_favorites(
    state: State<'_, DbConn>,
    major_code: Option<String>,
) -> Result<Vec<Favorite>, AppError> {
    db_query(&state.0, "加载学校收藏", |conn| {
        Ok(get_favorites(conn, major_code.as_deref()))
    })
}

#[tauri::command]
pub fn toggle_favorite(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
    major_name: String,
) -> Result<bool, AppError> {
    db_write(&state.0, "更新学校收藏", |conn| {
        if crate::db::is_favorite(conn, &school_id, &major_code) {
            remove_favorite(conn, &school_id, &major_code).map_err(|err| err.to_string())?;
            Ok(false)
        } else {
            add_favorite(conn, &school_id, &major_code, &major_name)
                .map_err(|err| err.to_string())?;
            Ok(true)
        }
    })
}

#[tauri::command]
pub fn fetch_plan_favorites(state: State<'_, DbConn>) -> Result<Vec<PlanFavorite>, AppError> {
    db_query(&state.0, "加载计划收藏", get_plan_favorites)
}

#[tauri::command]
pub fn toggle_plan_favorite(
    state: State<'_, DbConn>,
    school_id: String,
    school_name: String,
    major_code: String,
    department_name: String,
    research_direction: String,
    exam_subjects: Vec<String>,
    study_mode: String,
    exam_type: String,
    special_plans: Vec<String>,
) -> Result<bool, AppError> {
    db_write(&state.0, "更新计划收藏", |conn| {
        toggle_plan_favorite_db(
            conn,
            &school_id,
            &school_name,
            &major_code,
            &department_name,
            &research_direction,
            &exam_subjects,
            &study_mode,
            &exam_type,
            &special_plans,
        )
    })
}

#[tauri::command]
pub fn remove_plan_favorite(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
    department_name: String,
    research_direction: String,
    exam_subjects: Vec<String>,
) -> Result<(), AppError> {
    db_write(&state.0, "移除计划收藏", |conn| {
        remove_plan_favorite_db(
            conn,
            &school_id,
            &major_code,
            &department_name,
            &research_direction,
            &exam_subjects,
        )
    })
}

#[tauri::command]
pub fn fetch_recent_views(
    state: State<'_, DbConn>,
    limit: i64,
) -> Result<Vec<RecentView>, AppError> {
    db_query(&state.0, "加载最近查看", |conn| {
        Ok(get_recent_views(conn, limit))
    })
}

#[tauri::command]
pub fn add_recent_view_command(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
    major_name: String,
) -> Result<(), AppError> {
    db_write(&state.0, "记录最近查看", |conn| {
        add_recent_view(conn, &school_id, &major_code, &major_name).map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn clear_recent_views_command(state: State<'_, DbConn>) -> Result<(), AppError> {
    db_write(&state.0, "清空最近查看", |conn| {
        clear_recent_views(conn).map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn sync_workspace_data(app: tauri::AppHandle, major_code: String) -> Result<String, String> {
    sync_workspace_data_inner(&app, &major_code)
}

/// 内部复用函数：调用 Python 后端把采集结果同步进 SQLite。
fn sync_workspace_data_inner(app: &tauri::AppHandle, major_code: &str) -> Result<String, String> {
    let output = backend_command(app, "sync-to-tauri")?
        .arg("--major-code")
        .arg(major_code)
        .output()
        .map_err(|err| {
            diagnostics::log(
                "ERROR",
                "workspace_sync_failed",
                &format!(
                    "code=SPAWN_FAILED message={}",
                    diagnostics::safe_message(&err.to_string(), 500)
                ),
            );
            format!("启动同步脚本失败: {err}")
        })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = filter_python_stderr(&stderr);
        let safe_message = if message.is_empty() {
            "同步脚本异常退出".to_string()
        } else {
            diagnostics::safe_message(&message, 500)
        };
        diagnostics::log(
            "ERROR",
            "workspace_sync_failed",
            &format!(
                "code={} message={safe_message}",
                output.status.code().unwrap_or(-1)
            ),
        );
        Err(safe_message)
    }
}

/// `run_crawl_task` 采集成功后 emit 给前端的事件 payload。
/// 前端 App.tsx 监听 `crawl-synced` 事件后调用 addMajor + markMajorAsNew。
#[derive(Serialize, Clone)]
pub struct CrawlSyncedPayload {
    pub major_code: String,
    pub success: bool,
    pub sync_error: Option<String>,
}

/// `YAM_LOG` 协议解析后 emit 给前端的事件 payload。
/// 前端 CrawlingPage 监听 `crawl-log` 事件追加到采集日志（按 level 着色）。
#[derive(Serialize, Clone)]
pub struct CrawlLogPayload {
    /// 日志级别：info / warn / success / error
    pub level: String,
    /// 日志内容
    pub message: String,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CrawlStatus {
    Idle,
    Running,
    Completed,
    Failed,
    Cancelled,
}

pub struct CrawlProgress {
    pub status: CrawlStatus,
    pub running: AtomicBool,
    pub major_code: String,
    pub current: i32,
    pub total: i32,
    pub current_name: String,
    pub done: bool,
    pub success: i32,
    pub failed: i32,
    pub skipped: i32,
    pub error_code: Option<String>,
    pub error: Option<String>,
    /// 子进程 PID，用于取消时 kill
    pub child_pid: Option<u32>,
}

impl Clone for CrawlProgress {
    fn clone(&self) -> Self {
        Self {
            status: self.status,
            running: AtomicBool::new(self.running.load(Ordering::SeqCst)),
            major_code: self.major_code.clone(),
            current: self.current,
            total: self.total,
            current_name: self.current_name.clone(),
            done: self.done,
            success: self.success,
            failed: self.failed,
            skipped: self.skipped,
            error_code: self.error_code.clone(),
            error: self.error.clone(),
            child_pid: self.child_pid,
        }
    }
}

impl Default for CrawlProgress {
    fn default() -> Self {
        Self {
            status: CrawlStatus::Idle,
            running: AtomicBool::new(false),
            major_code: String::new(),
            current: 0,
            total: 0,
            current_name: String::new(),
            done: false,
            success: 0,
            failed: 0,
            skipped: 0,
            error_code: None,
            error: None,
            child_pid: None,
        }
    }
}

impl Serialize for CrawlProgress {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("CrawlProgress", 12)?;
        state.serialize_field("status", &self.status)?;
        state.serialize_field("running", &self.running.load(Ordering::SeqCst))?;
        state.serialize_field("major_code", &self.major_code)?;
        state.serialize_field("current", &self.current)?;
        state.serialize_field("total", &self.total)?;
        state.serialize_field("current_name", &self.current_name)?;
        state.serialize_field("done", &self.done)?;
        state.serialize_field("success", &self.success)?;
        state.serialize_field("failed", &self.failed)?;
        state.serialize_field("skipped", &self.skipped)?;
        state.serialize_field("error_code", &self.error_code)?;
        state.serialize_field("error", &self.error)?;
        state.end()
    }
}

pub type CrawlState = Arc<Mutex<CrawlProgress>>;

/// 取消采集任务：直接重置 progress 状态，并尝试 kill 子进程
#[tauri::command]
pub fn cancel_crawl(state: State<'_, CrawlState>) -> Result<(), String> {
    let mut p = state.lock().unwrap();
    // 尝试 kill 子进程
    if let Some(pid) = p.child_pid.take() {
        kill_process_tree(pid);
    }
    // 标记为已取消并清空运行状态
    p.status = CrawlStatus::Cancelled;
    p.running.store(false, Ordering::SeqCst);
    p.done = true;
    if p.error.is_none() {
        p.error = Some("用户取消采集任务".to_string());
    }
    Ok(())
}

/// 重置已结束的采集状态。运行中的任务只能通过 `cancel_crawl` 显式终止。
#[tauri::command]
pub fn reset_crawl(state: State<'_, CrawlState>) -> Result<(), String> {
    let mut p = state.lock().unwrap();
    if p.running.load(Ordering::SeqCst) {
        return Err("采集任务正在运行，请先取消当前任务".to_string());
    }
    *p = CrawlProgress::default();
    Ok(())
}

/// 跨平台 kill 进程及其子进程
fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = new_hidden_command("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
}

fn run_crawl_task(
    state: CrawlState,
    major_code: String,
    force: bool,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut cmd = backend_command(&app_handle, "fetch")?;
    cmd.arg("--major").arg(&major_code);
    if force {
        cmd.arg("--force");
    }
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| {
            diagnostics::log(
                "ERROR",
                "crawl_subprocess_failed",
                &format!(
                    "code=SPAWN_FAILED message={}",
                    diagnostics::safe_message(&err.to_string(), 500)
                ),
            );
            format!("启动采集脚本失败: {err}")
        })?;

    // 保存子进程 PID，供 cancel_crawl 调用 kill
    {
        let mut p = state.lock().unwrap();
        p.child_pid = Some(child.id());
    }

    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取 stderr")?;

    // 在单独线程中读取整个 stderr（防止缓冲区满阻塞子进程）
    let stderr_reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = Vec::new();
        let mut reader = stderr;
        reader.read_to_end(&mut buf).ok();
        String::from_utf8_lossy(&buf).to_string()
    });

    // 主线程逐行读取 stdout（用 read_until 避免 lines() 的 UTF-8 严格解码问题）
    // Python 在 Windows 上可能输出 GBK 编码的中文，lines() 会因 UTF-8 解码失败丢弃整行
    use std::io::Read;
    let mut stdout_reader = stdout;
    let mut line_buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 1024];
    let mut last_progress_time = std::time::Instant::now();
    // 种子获取阶段（无 YAM_TOTAL 输出）可能耗时较长，初始超时放宽到 300 秒；
    // 一旦获取到院校总数，恢复为 90 秒，用于检测单所学校详情抓取卡住。
    let mut timeout_secs = 300u64;

    loop {
        // 检查是否已被取消
        {
            let p = state.lock().unwrap();
            if !p.running.load(Ordering::SeqCst) && p.done {
                let _ = child.kill();
                break;
            }
        }

        // 非阻塞读取：如果有数据就处理，没有就检查超时和子进程状态
        match stdout_reader.read(&mut chunk) {
            Ok(0) => {
                // EOF，处理最后一行（如果有）
                if !line_buf.is_empty() {
                    let line = String::from_utf8_lossy(&line_buf).to_string();
                    process_stdout_line(&line, &state, &mut last_progress_time, &app_handle);
                    line_buf.clear();
                }
                break;
            }
            Ok(n) => {
                line_buf.extend_from_slice(&chunk[..n]);
                // 按换行符分割处理完整行
                while let Some(pos) = line_buf.iter().position(|&b| b == b'\n') {
                    let mut single_line: Vec<u8> = line_buf.drain(..=pos).collect();
                    // 去掉行尾的 \r\n
                    while single_line.last() == Some(&b'\n') || single_line.last() == Some(&b'\r') {
                        single_line.pop();
                    }
                    if !single_line.is_empty() {
                        let line = String::from_utf8_lossy(&single_line).to_string();
                        process_stdout_line(&line, &state, &mut last_progress_time, &app_handle);
                    }
                }
            }
            Err(_e) => {
                break;
            }
        }

        // 种子获取阶段结束后，恢复常规超时
        {
            let p = state.lock().unwrap();
            if p.total > 0 && timeout_secs > 90 {
                timeout_secs = 90;
            }
        }

        // 超时检测
        if last_progress_time.elapsed().as_secs() > timeout_secs {
            let mut p = state.lock().unwrap();
            p.error_code = Some("TIMEOUT".to_string());
            p.error = Some(format!(
                "采集超时（{} 秒无进度更新），已自动终止",
                timeout_secs
            ));
            let _ = child.kill();
            break;
        }
    }

    let status = child.wait().map_err(|e| format!("等待子进程失败: {}", e))?;
    let stderr_output = stderr_reader.join().unwrap_or_default();
    {
        let mut p = state.lock().unwrap();
        // 清除 child_pid，子进程已退出
        p.child_pid = None;
        if !status.success() {
            // 如果已有 error（来自 YAM_ERROR 或用户取消），保留它
            let already_has_error = p.error.is_some();
            if !already_has_error {
                p.error_code = Some("FAILED".to_string());
                let msg = if stderr_output.is_empty() {
                    "采集脚本异常退出".to_string()
                } else {
                    // 过滤 Python traceback 行，仅保留有用的错误信息
                    let filtered = filter_python_stderr(&stderr_output);
                    if filtered.is_empty() {
                        "采集脚本异常退出".to_string()
                    } else {
                        diagnostics::safe_message(&filtered, 500)
                    }
                };
                p.error = Some(msg);
            }
            let message = p
                .error
                .as_deref()
                .map(|value| diagnostics::safe_message(value, 500))
                .unwrap_or_else(|| "采集脚本异常退出".to_string());
            let code = p
                .error_code
                .clone()
                .unwrap_or_else(|| status.code().unwrap_or(-1).to_string());
            diagnostics::log(
                "ERROR",
                "crawl_subprocess_failed",
                &format!("code={code} message={message}"),
            );
        }
    }

    // 采集成功后自动同步数据进 SQLite，并 emit `crawl-synced` 事件通知前端。
    // 失败时不 panic（在子线程里会丢失），仅写入 p.error + emit success=false，
    // 让 BackgroundTaskPanel 和 CrawlingPage 都能感知。
    {
        let p = state.lock().unwrap();
        let crawl_success = p.error.is_none() && p.success > 0;
        if crawl_success {
            drop(p);
            match sync_workspace_data_inner(&app_handle, &major_code) {
                Ok(_) => {
                    let _ = app_handle.emit(
                        "crawl-synced",
                        CrawlSyncedPayload {
                            major_code: major_code.clone(),
                            success: true,
                            sync_error: None,
                        },
                    );
                }
                Err(err) => {
                    eprintln!("[run_crawl_task] sync_workspace_data_inner 失败: {}", err);
                    let mut p = state.lock().unwrap();
                    if p.error.is_none() {
                        p.error = Some(format!("数据同步失败: {}", err));
                    }
                    let _ = app_handle.emit(
                        "crawl-synced",
                        CrawlSyncedPayload {
                            major_code: major_code.clone(),
                            success: false,
                            sync_error: Some(err),
                        },
                    );
                }
            }
        }
        // 采集本身失败的情况：不调用同步、不 emit，前端通过轮询 p.error 已能感知
    }
    Ok(())
}

/// 过滤 Python stderr 中的 traceback 行，提取有用的错误信息.
///
/// Python traceback 的典型格式：
/// ```text
/// Traceback (most recent call last):
///   File "...", line X, in <module>
///     some_code()
/// SomeError: error message
/// ```
/// 我们保留最后的 `Error: message` 行，过滤掉 `Traceback`、`  File`、
/// 缩进行等调试信息，避免在前端错误横幅中显示完整堆栈。
fn yam_error_from_stdout(stdout: &str) -> Option<(String, String)> {
    stdout.lines().find_map(|line| {
        let rest = line.strip_prefix("YAM_ERROR ")?.trim();
        let (code, message) = rest.split_once(' ')?;
        Some((code.to_string(), message.to_string()))
    })
}

fn filter_python_stderr(stderr: &str) -> String {
    let mut useful_lines: Vec<&str> = Vec::new();
    for line in stderr.lines() {
        let trimmed = line.trim();
        // 跳过空行
        if trimmed.is_empty() {
            continue;
        }
        // 跳过 traceback 框架行
        if trimmed.starts_with("Traceback (most recent call last)") {
            continue;
        }
        // 跳过 File "..." 行
        if trimmed.starts_with("File \"") || trimmed.starts_with("File '") {
            continue;
        }
        // 跳过缩进行（traceback 中的代码行，如 "    raise ValueError(...)"）
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        // 保留非缩进行（通常是 "ErrorType: message" 或其他顶层错误信息）
        useful_lines.push(trimmed);
    }
    // 返回最后一行有用的错误信息（通常是 "ErrorType: message"）
    useful_lines
        .last()
        .map(|s| s.to_string())
        .unwrap_or_default()
}

/// 处理 stdout 的一行，更新 state 和 last_progress_time，并通过 app_handle emit 日志事件
fn process_stdout_line(
    line: &str,
    state: &CrawlState,
    last_progress_time: &mut std::time::Instant,
    app_handle: &tauri::AppHandle,
) {
    if line.starts_with("YAM_TOTAL ") {
        if let Ok(total) = line[10..].trim().parse::<i32>() {
            let mut p = state.lock().unwrap();
            p.total = total;
            *last_progress_time = std::time::Instant::now();
        }
    } else if line.starts_with("YAM_PROGRESS ") {
        let rest = &line[13..];
        let space_idx = rest.find(' ').unwrap_or(rest.len());
        let progress_part = &rest[..space_idx];
        let name = rest[space_idx..].trim().to_string();
        let nums: Vec<&str> = progress_part.split('/').collect();
        if nums.len() == 2 {
            if let (Ok(current), Ok(total)) = (nums[0].parse::<i32>(), nums[1].parse::<i32>()) {
                let mut p = state.lock().unwrap();
                p.current = current;
                p.total = total;
                p.current_name = name;
                *last_progress_time = std::time::Instant::now();
            }
        }
    } else if line.starts_with("YAM_DONE ") {
        let parts: Vec<&str> = line[9..].split_whitespace().collect();
        if parts.len() == 3 {
            if let (Ok(success), Ok(failed), Ok(skipped)) = (
                parts[0].parse::<i32>(),
                parts[1].parse::<i32>(),
                parts[2].parse::<i32>(),
            ) {
                let mut p = state.lock().unwrap();
                p.success = success;
                p.failed = failed;
                p.skipped = skipped;
                *last_progress_time = std::time::Instant::now();
            }
        }
    } else if line.starts_with("YAM_ERROR ") {
        // 协议：YAM_ERROR {CODE} {message}。兼容旧版无 CODE 的错误行。
        let rest = line[10..].trim();
        let (error_code, error_message) = match rest.split_once(' ') {
            Some((code, message)) if code.chars().all(|c| c.is_ascii_uppercase() || c == '_') => {
                (Some(code.to_string()), message.to_string())
            }
            _ => (Some("FAILED".to_string()), rest.to_string()),
        };
        let mut p = state.lock().unwrap();
        p.error_code = error_code;
        p.error = Some(error_message);
    } else if let Some(rest) = line.strip_prefix("YAM_LOG ") {
        // ISSUE-029 阶段日志协议：YAM_LOG {level} {message}
        // level ∈ {info, warn, success, error}，message 可能含空格
        let rest = rest.trim();
        let space_idx = rest.find(' ').unwrap_or(rest.len());
        let level = &rest[..space_idx];
        let message = rest[space_idx..].trim();
        if !message.is_empty() {
            let _ = app_handle.emit(
                "crawl-log",
                CrawlLogPayload {
                    level: level.to_string(),
                    message: message.to_string(),
                },
            );
        }
    } else if !line.is_empty() {
        // 实时显示 Python 输出到 current_name 字段
        let mut p = state.lock().unwrap();
        if p.current_name.is_empty() {
            p.current_name = line.chars().take(80).collect();
        }
    }
}

#[tauri::command]
pub fn run_crawl(
    state: State<'_, CrawlState>,
    app: tauri::AppHandle,
    major_code: String,
    force: Option<bool>,
) -> Result<(), String> {
    {
        let mut progress = state.lock().unwrap();
        // 原子检查+设置 running 标志，防止前端重复调用导致重复启动
        if progress
            .running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("已有采集任务在运行".to_string());
        }
        *progress = CrawlProgress {
            status: CrawlStatus::Running,
            running: AtomicBool::new(true),
            major_code: major_code.clone(),
            current: 0,
            total: 0,
            current_name: String::new(),
            done: false,
            success: 0,
            failed: 0,
            skipped: 0,
            error_code: None,
            error: None,
            child_pid: None,
        };
    }

    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    let force = force.unwrap_or(false);
    std::thread::spawn(move || {
        let result = run_crawl_task(state_clone.clone(), major_code, force, app_clone);
        let mut p = state_clone.lock().unwrap();
        p.running.store(false, Ordering::SeqCst);
        p.done = true;
        if let Err(e) = result {
            if p.error.is_none() {
                p.error = Some(e);
            }
        }
        if p.status != CrawlStatus::Cancelled {
            p.status = if p.error.is_some() || p.success == 0 {
                CrawlStatus::Failed
            } else {
                CrawlStatus::Completed
            };
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_crawl_progress(state: State<'_, CrawlState>) -> CrawlProgress {
    state.lock().unwrap().clone()
}

#[derive(Serialize)]
pub struct LoginStatus {
    pub logged_in: bool,
    pub expires_at: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResult {
    pub success: bool,
    pub school_count: i32,
    pub error: Option<String>,
}

/// ISSUE-024：刷新登录命令返回结构（不抓取种子，只刷新登录态）
#[derive(Serialize)]
pub struct RefreshLoginResult {
    pub success: bool,
    pub error: Option<String>,
}

/// ISSUE-024：清除登录态命令返回结构
#[derive(Serialize)]
pub struct ClearLoginResult {
    pub success: bool,
    pub cookie_existed: bool,
    pub error: Option<String>,
}

/// 检查本地是否保存了有效的研招网登录 cookie
#[tauri::command]
pub fn check_login_status(app: tauri::AppHandle) -> Result<LoginStatus, String> {
    let cookie_path = app
        .path()
        .resolve(
            ".yam/cookies/yz.chsi.com.cn.json",
            tauri::path::BaseDirectory::Home,
        )
        .map_err(|e| format!("无法解析 cookie 路径: {}", e))?;

    if !cookie_path.exists() {
        return Ok(LoginStatus {
            logged_in: false,
            expires_at: None,
        });
    }

    let content = std::fs::read_to_string(&cookie_path)
        .map_err(|e| format!("读取 cookie 文件失败: {}", e))?;
    let cookies: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析 cookie 失败: {}", e))?;

    // 与 Python 端 _is_login_cookie 保持一致：
    // - JSESSIONID / CLIENTFLAG / XSRF 等只是会话/防伪标识，未登录时也可能存在；
    // - 真正代表登录态的是 account.chsi.com.cn 域下的 CASTGC（CAS 票据）。
    let login_cookie = cookies.iter().find(|c| {
        let name = c.get("name").and_then(|n| n.as_str()).unwrap_or("");
        let value = c.get("value").and_then(|v| v.as_str()).unwrap_or("");
        let domain = c.get("domain").and_then(|d| d.as_str()).unwrap_or("");

        if value.is_empty() {
            return false;
        }

        let name_upper = name.to_uppercase();
        if name_upper == "CASTGC" {
            return true;
        }

        // 兼容性：如果旧 SESSION cookie 存在且非空，也视为已登录
        if name_upper.contains("SESSION") && !name_upper.contains("JSESSIONID") {
            return domain.contains("chsi.com.cn");
        }

        false
    });

    let logged_in = login_cookie.is_some();
    let expires_at = login_cookie.and_then(|c| {
        c.get("expires")
            .and_then(|e| e.as_i64())
            .filter(|&ts| ts > 0)
            .map(|ts| ts.to_string())
    });

    Ok(LoginStatus {
        logged_in,
        expires_at,
    })
}

/// 打开浏览器窗口引导用户登录研招网，登录成功后抓取该专业种子
#[tauri::command]
pub fn login_yanzhao(app: tauri::AppHandle, major_code: String) -> Result<LoginResult, String> {
    let output = backend_command(&app, "login-yanzhao")?
        .arg("--major-code")
        .arg(&major_code)
        .output()
        .map_err(|e| format!("启动登录脚本失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        let error = yam_error_from_stdout(&stdout)
            .map(|(_, message)| message)
            .unwrap_or_else(|| {
                if stderr.is_empty() {
                    "登录窗口异常退出".to_string()
                } else {
                    filter_python_stderr(&stderr)
                }
            });
        return Ok(LoginResult {
            success: false,
            school_count: 0,
            error: Some(error),
        });
    }

    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("YAM_LOGIN_RESULT ") {
            match serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                Ok(v) => {
                    let school_count =
                        v.get("school_count").and_then(|n| n.as_i64()).unwrap_or(0) as i32;
                    let error = v
                        .get("error")
                        .and_then(|e| e.as_str())
                        .map(|s| s.to_string());
                    return Ok(LoginResult {
                        success: school_count > 0 && error.is_none(),
                        school_count,
                        error,
                    });
                }
                Err(e) => {
                    return Ok(LoginResult {
                        success: false,
                        school_count: 0,
                        error: Some(format!("解析登录结果失败: {}", e)),
                    });
                }
            }
        }
    }

    Ok(LoginResult {
        success: false,
        school_count: 0,
        error: Some(if stderr.is_empty() {
            "未获取到登录结果".to_string()
        } else {
            stderr.to_string()
        }),
    })
}

/// ISSUE-024：只刷新登录态，不抓取种子。
///
/// 调用 Python 端 `DynamicReader().interactive_login("", "")`，打开可见浏览器
/// 让用户完成研招网登录；登录凭证保存到 `~/.yam/cookies/yz.chsi.com.cn.json`。
/// 与 `login_yanzhao` 的区别：本命令不抓取任何专业种子，可在 SettingsPage
/// 独立调用。
#[tauri::command]
pub fn refresh_login(app: tauri::AppHandle) -> Result<RefreshLoginResult, String> {
    let output = backend_command(&app, "refresh-login")?
        .output()
        .map_err(|e| format!("启动刷新登录脚本失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        let error = yam_error_from_stdout(&stdout)
            .map(|(_, message)| message)
            .unwrap_or_else(|| {
                if stderr.is_empty() {
                    "刷新登录窗口异常退出".to_string()
                } else {
                    filter_python_stderr(&stderr)
                }
            });
        return Ok(RefreshLoginResult {
            success: false,
            error: Some(error),
        });
    }

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("YAM_REFRESH_RESULT ") {
            let ok = serde_json::from_str::<Value>(rest.trim())
                .ok()
                .and_then(|value| value.get("success").and_then(Value::as_bool))
                .unwrap_or(false);
            return Ok(RefreshLoginResult {
                success: ok,
                error: if ok {
                    None
                } else {
                    Some("未检测到登录凭证，请确认已完成研招网登录".to_string())
                },
            });
        }
    }

    Ok(RefreshLoginResult {
        success: false,
        error: Some(if stderr.is_empty() {
            "未获取到刷新登录结果".to_string()
        } else {
            stderr.to_string()
        }),
    })
}

/// ISSUE-024：清除本地研招网登录态。
///
/// 删除 `~/.yam/cookies/yz.chsi.com.cn.json` 文件。下次采集时若检测到
/// 无 cookie 会触发 LoginRequiredModal。
#[tauri::command]
pub fn clear_login(app: tauri::AppHandle) -> Result<ClearLoginResult, String> {
    let cookie_path = app
        .path()
        .resolve(
            ".yam/cookies/yz.chsi.com.cn.json",
            tauri::path::BaseDirectory::Home,
        )
        .map_err(|e| format!("无法解析 cookie 路径: {}", e))?;

    if !cookie_path.exists() {
        return Ok(ClearLoginResult {
            success: true,
            cookie_existed: false,
            error: None,
        });
    }

    std::fs::remove_file(&cookie_path).map_err(|e| format!("删除 cookie 文件失败: {}", e))?;

    Ok(ClearLoginResult {
        success: true,
        cookie_existed: true,
        error: None,
    })
}

#[derive(Serialize, Clone)]
pub struct SearchedMajor {
    pub zydm: String,
    pub zymc: String,
    pub yjxkdm: String,
    pub yjxkmc: String,
    pub mldm: String,
    pub mlmc: String,
    pub xwlx: String,
}

#[derive(Serialize)]
pub struct SearchMajorsResult {
    pub majors: Vec<SearchedMajor>,
    pub total_count: i64,
    pub fetched_count: i64,
    pub need_login: bool,
    pub yjxkdm: String,
    pub yjxkmc: String,
    pub error: Option<String>,
}

/// 调用 Python `yam search-majors` 实时查询研招网 zys.do 接口拿全专业.
///
/// 通过 `std::process::Command` 启动子进程，解析 stdout 中 `YAM_SEARCH_RESULT` 前缀
/// 的 JSON 行。耗时取决于学科规模（0812 约 30-60 秒），前端通过 loading state 处理。
#[tauri::command]
pub async fn search_majors(
    app: tauri::AppHandle,
    yjxkdm: Option<String>,
    name: Option<String>,
) -> Result<SearchMajorsResult, String> {
    let yjxkdm_val = yjxkdm.unwrap_or_default();
    let name_val = name.unwrap_or_default();

    if yjxkdm_val.is_empty() && name_val.is_empty() {
        return Err("必须指定 yjxkdm 或 name 参数".to_string());
    }

    let mut cmd = backend_command(&app, "search-majors")?;
    cmd.arg("--json");

    if !yjxkdm_val.is_empty() {
        cmd.arg("--yjxkdm").arg(&yjxkdm_val);
    }
    if !name_val.is_empty() {
        cmd.arg("--name").arg(&name_val);
    }

    // 用 spawn_blocking 避免阻塞 Tauri 主线程
    let output = tauri::async_runtime::spawn_blocking(move || {
        cmd.output().map_err(|e| format!("启动查询脚本失败: {}", e))
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))??;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // 解析 stdout 中 YAM_SEARCH_RESULT 前缀的 JSON 行
    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("YAM_SEARCH_RESULT ") {
            match serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                Ok(v) => {
                    let error = v
                        .get("error")
                        .and_then(|e| e.as_str())
                        .map(|s| s.to_string());
                    let majors = v
                        .get("majors")
                        .and_then(|m| m.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|item| {
                                    Some(SearchedMajor {
                                        zydm: item.get("zydm")?.as_str()?.to_string(),
                                        zymc: item.get("zymc")?.as_str()?.to_string(),
                                        yjxkdm: item
                                            .get("yjxkdm")
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                        yjxkmc: item
                                            .get("yjxkmc")
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                        mldm: item
                                            .get("mldm")
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                        mlmc: item
                                            .get("mlmc")
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                        xwlx: item
                                            .get("xwlx")
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("")
                                            .to_string(),
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    let total_count = v.get("total_count").and_then(|n| n.as_i64()).unwrap_or(0);
                    let fetched_count =
                        v.get("fetched_count").and_then(|n| n.as_i64()).unwrap_or(0);
                    let need_login = v
                        .get("need_login")
                        .and_then(|n| n.as_bool())
                        .unwrap_or(false);
                    let yjxkdm_str = v
                        .get("yjxkdm")
                        .and_then(|s| s.as_str())
                        .unwrap_or(&yjxkdm_val)
                        .to_string();
                    let yjxkmc = v
                        .get("yjxkmc")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string();

                    return Ok(SearchMajorsResult {
                        majors,
                        total_count,
                        fetched_count,
                        need_login,
                        yjxkdm: yjxkdm_str,
                        yjxkmc,
                        error,
                    });
                }
                Err(e) => {
                    return Ok(SearchMajorsResult {
                        majors: vec![],
                        total_count: 0,
                        fetched_count: 0,
                        need_login: false,
                        yjxkdm: yjxkdm_val,
                        yjxkmc: String::new(),
                        error: Some(format!("解析查询结果失败: {}", e)),
                    });
                }
            }
        }
    }

    // 没找到 YAM_SEARCH_RESULT 行
    Ok(SearchMajorsResult {
        majors: vec![],
        total_count: 0,
        fetched_count: 0,
        need_login: false,
        yjxkdm: yjxkdm_val,
        yjxkmc: String::new(),
        error: Some(if stderr.is_empty() {
            "未获取到查询结果".to_string()
        } else {
            stderr.to_string()
        }),
    })
}

// ============================================================================
// 整个专业目录更新（更新专业目录数据，写入 data/majors_realtime.json）
// ============================================================================
//
// 与 run_crawl 类似的 spawn + 逐行读取 stdout + emit 进度事件模式，
// 但解析的协议不同：
//   YAM_MAJORS_UPDATE_PROGRESS <current> <total> <yjxkdm> <yjxkmc>
//   YAM_MAJORS_UPDATE_WARN <code> <msg>
//   YAM_MAJORS_UPDATE_ERROR <msg>
//   YAM_MAJORS_UPDATE_DONE <json>
//   YAM_MAJORS_UPDATE_BATCH_START <batch_num> <total_batches> <json_array_of_{yjxkdm,yjxkmc}>
//   YAM_MAJORS_UPDATE_BATCH_ITEM <yjxkdm> <status> <detail>
//
// 耗时 1-2 小时（219 个一级学科 × 单学科查询），需要前端提供取消按钮。

/// ISSUE-023：批次内单个 yjxkdm 的实时状态，前端展示为 N 个并发项卡片。
#[derive(Clone, serde::Serialize)]
pub struct BatchItem {
    pub yjxkdm: String,
    pub yjxkmc: String,
    /// pending / running / done / failed
    pub status: String,
    /// 完成或失败的详情文本
    pub detail: String,
}

pub struct UpdateCatalogProgress {
    pub running: AtomicBool,
    pub current: i32,
    pub total: i32,
    pub current_yjxkdm: String,
    pub current_yjxkmc: String,
    pub done: bool,
    pub success_count: i32,
    pub failed_count: i32,
    pub error: Option<String>,
    /// 子进程 PID，用于取消时 kill
    pub child_pid: Option<u32>,
    /// ISSUE-023：当前批次号（1-based）
    pub batch_num: i32,
    /// ISSUE-023：总批次数
    pub total_batches: i32,
    /// ISSUE-023：当前批次内的并发项列表
    pub batch_items: Vec<BatchItem>,
}

impl Default for UpdateCatalogProgress {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            current: 0,
            total: 0,
            current_yjxkdm: String::new(),
            current_yjxkmc: String::new(),
            done: false,
            success_count: 0,
            failed_count: 0,
            error: None,
            child_pid: None,
            batch_num: 0,
            total_batches: 0,
            batch_items: Vec::new(),
        }
    }
}

impl Clone for UpdateCatalogProgress {
    fn clone(&self) -> Self {
        Self {
            running: AtomicBool::new(self.running.load(Ordering::SeqCst)),
            current: self.current,
            total: self.total,
            current_yjxkdm: self.current_yjxkdm.clone(),
            current_yjxkmc: self.current_yjxkmc.clone(),
            done: self.done,
            success_count: self.success_count,
            failed_count: self.failed_count,
            error: self.error.clone(),
            child_pid: self.child_pid,
            batch_num: self.batch_num,
            total_batches: self.total_batches,
            batch_items: self.batch_items.clone(),
        }
    }
}

impl Serialize for UpdateCatalogProgress {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("UpdateCatalogProgress", 11)?;
        state.serialize_field("running", &self.running.load(Ordering::SeqCst))?;
        state.serialize_field("current", &self.current)?;
        state.serialize_field("total", &self.total)?;
        state.serialize_field("current_yjxkdm", &self.current_yjxkdm)?;
        state.serialize_field("current_yjxkmc", &self.current_yjxkmc)?;
        state.serialize_field("done", &self.done)?;
        state.serialize_field("success_count", &self.success_count)?;
        state.serialize_field("failed_count", &self.failed_count)?;
        state.serialize_field("error", &self.error)?;
        state.serialize_field("batch_num", &self.batch_num)?;
        state.serialize_field("total_batches", &self.total_batches)?;
        state.serialize_field("batch_items", &self.batch_items)?;
        state.end()
    }
}

pub type UpdateCatalogState = Arc<Mutex<UpdateCatalogProgress>>;

/// 启动整个专业目录更新任务（耗时 1-2 小时）。
///
/// 在后台线程 spawn Python 脚本 `yam.scripts.update_majors_catalog`，
/// 逐行读取 stdout 中的 `YAM_MAJORS_UPDATE_PROGRESS/WARN/ERROR/DONE` 行，
/// 通过 `app_handle.emit("catalog-update-progress", ...)` 实时推送进度。
#[tauri::command]
pub fn update_majors_catalog(
    state: State<'_, UpdateCatalogState>,
    app: tauri::AppHandle,
    login: Option<bool>,
) -> Result<(), String> {
    let login_flag = login.unwrap_or(false);

    {
        let mut p = state.lock().unwrap();
        if p.running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("已有专业目录更新任务在运行".to_string());
        }
        *p = UpdateCatalogProgress {
            running: AtomicBool::new(true),
            ..Default::default()
        };
    }

    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let result = run_update_catalog_task(state_clone.clone(), login_flag, app_clone);
        let mut p = state_clone.lock().unwrap();
        p.running.store(false, Ordering::SeqCst);
        p.done = true;
        if let Err(e) = result {
            if p.error.is_none() {
                p.error = Some(e);
            }
        }
    });

    Ok(())
}

fn run_update_catalog_task(
    state: UpdateCatalogState,
    login: bool,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut cmd = backend_command(&app_handle, "update-majors-catalog")?;
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if login {
        cmd.arg("--login");
    }
    // ISSUE-023：默认断点续传——partial JSON 存在时跳过已完成的 yjxkdm。
    // 脚本里 `if resume and PARTIAL_JSON.exists()` 保证不存在时等同从头开始。
    cmd.arg("--resume");

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动目录更新脚本失败: {}", e))?;

    {
        let mut p = state.lock().unwrap();
        p.child_pid = Some(child.id());
    }

    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取 stderr")?;

    // 单独线程读取 stderr 防止缓冲区满
    let stderr_reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = Vec::new();
        let mut reader = stderr;
        reader.read_to_end(&mut buf).ok();
        String::from_utf8_lossy(&buf).to_string()
    });

    // 主线程逐行读取 stdout
    use std::io::Read;
    let mut stdout_reader = stdout;
    let mut line_buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 1024];
    // 单学科查询可能耗时 1-2 分钟（含登录交互则更久），放宽到 600 秒无进度才超时
    let mut last_progress_time = std::time::Instant::now();
    let timeout_secs = 600u64;

    loop {
        // 检查取消：仅当 running=false 且 done=false 时才视为用户取消（kill 子进程）。
        // 注意：DONE 事件处理会同时设置 running=false 和 done=true，此时 Python 仍在收尾
        // （return + asyncio.run 清理 + GC），不能再 kill，否则会让 Python 退出码非 0
        // 触发"目录更新脚本异常退出"误报。等 stdout EOF 自然退出即可。
        {
            let p = state.lock().unwrap();
            if !p.running.load(Ordering::SeqCst) && !p.done {
                let _ = child.kill();
                break;
            }
        }

        match stdout_reader.read(&mut chunk) {
            Ok(0) => {
                if !line_buf.is_empty() {
                    let line = String::from_utf8_lossy(&line_buf).to_string();
                    process_catalog_stdout_line(
                        &line,
                        &state,
                        &app_handle,
                        &mut last_progress_time,
                    );
                    line_buf.clear();
                }
                break;
            }
            Ok(n) => {
                line_buf.extend_from_slice(&chunk[..n]);
                while let Some(pos) = line_buf.iter().position(|&b| b == b'\n') {
                    let mut single_line: Vec<u8> = line_buf.drain(..=pos).collect();
                    while single_line.last() == Some(&b'\n') || single_line.last() == Some(&b'\r') {
                        single_line.pop();
                    }
                    if !single_line.is_empty() {
                        let line = String::from_utf8_lossy(&single_line).to_string();
                        process_catalog_stdout_line(
                            &line,
                            &state,
                            &app_handle,
                            &mut last_progress_time,
                        );
                    }
                }
            }
            Err(_) => break,
        }

        if last_progress_time.elapsed().as_secs() > timeout_secs {
            let mut p = state.lock().unwrap();
            p.error = Some(format!(
                "目录更新超时（{} 秒无进度更新），已自动终止",
                timeout_secs
            ));
            let _ = child.kill();
            break;
        }
    }

    let status = child.wait().map_err(|e| format!("等待子进程失败: {}", e))?;
    let stderr_output = stderr_reader.join().unwrap_or_default();

    let mut had_error = false;
    {
        let mut p = state.lock().unwrap();
        p.child_pid = None;
        if !status.success() {
            had_error = true;
            if p.error.is_none() {
                let msg = if stderr_output.is_empty() {
                    "目录更新脚本异常退出".to_string()
                } else {
                    let filtered = filter_python_stderr(&stderr_output);
                    if filtered.is_empty() {
                        "目录更新脚本异常退出".to_string()
                    } else {
                        filtered
                    }
                };
                p.error = Some(msg);
            }
        }
        // 兜底：无论 DONE 行是否被正确处理，脚本退出后都标记任务结束
        // 避免前端因漏处理 DONE 行而一直显示"正在更新"状态
        if !p.done {
            p.done = true;
        }
        p.running.store(false, Ordering::SeqCst);
    }

    // 完成后 emit done 事件，无论成功失败
    let final_state = {
        let p = state.lock().unwrap();
        p.clone()
    };
    let _ = app_handle.emit("catalog-update-done", &final_state);

    if had_error {
        return Err("目录更新脚本异常退出".to_string());
    }
    Ok(())
}

/// 处理 stdout 的一行，更新 state 并 emit 进度事件
fn process_catalog_stdout_line(
    line: &str,
    state: &UpdateCatalogState,
    app_handle: &tauri::AppHandle,
    last_progress_time: &mut std::time::Instant,
) {
    if line.starts_with("YAM_MAJORS_UPDATE_PROGRESS ") {
        let rest = &line["YAM_MAJORS_UPDATE_PROGRESS ".len()..];
        let parts: Vec<&str> = rest.splitn(4, ' ').collect();
        if parts.len() >= 2 {
            let current = parts[0].parse::<i32>().unwrap_or(0);
            let total = parts[1].parse::<i32>().unwrap_or(0);
            let yjxkdm = parts.get(2).copied().unwrap_or("").to_string();
            let yjxkmc = parts.get(3).copied().unwrap_or("").to_string();

            let mut p = state.lock().unwrap();
            p.current = current;
            if total > 0 {
                p.total = total;
            }
            p.current_yjxkdm = yjxkdm;
            p.current_yjxkmc = yjxkmc;
            *last_progress_time = std::time::Instant::now();

            let snapshot = p.clone();
            drop(p);
            let _ = app_handle.emit("catalog-update-progress", &snapshot);
        }
    } else if line.starts_with("YAM_MAJORS_UPDATE_WARN ") {
        // 警告：某学科查询失败，计入 failed_count 但不中断
        let rest = &line["YAM_MAJORS_UPDATE_WARN ".len()..];
        let mut p = state.lock().unwrap();
        p.failed_count += 1;
        let snapshot = p.clone();
        drop(p);
        eprintln!("[update_majors_catalog] WARN: {}", rest);
        let _ = app_handle.emit("catalog-update-progress", &snapshot);
    } else if line.starts_with("YAM_MAJORS_UPDATE_ERROR ") {
        let err_msg = line["YAM_MAJORS_UPDATE_ERROR ".len()..].trim().to_string();
        let mut p = state.lock().unwrap();
        p.error = Some(err_msg);
        let snapshot = p.clone();
        drop(p);
        let _ = app_handle.emit("catalog-update-progress", &snapshot);
    } else if line.starts_with("YAM_ERROR ") {
        let err_msg = yam_error_from_stdout(line)
            .map(|(_, message)| message)
            .unwrap_or_else(|| "后端操作失败".to_string());
        let mut p = state.lock().unwrap();
        p.error = Some(err_msg);
        let snapshot = p.clone();
        drop(p);
        let _ = app_handle.emit("catalog-update-progress", &snapshot);
    } else if line.starts_with("YAM_MAJORS_UPDATE_DONE ") {
        // 完成行：解析 JSON 拿 success/failed 统计
        let json_str = line["YAM_MAJORS_UPDATE_DONE ".len()..].trim();
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
            let total = v.get("total_yjxkdm").and_then(|n| n.as_i64()).unwrap_or(0) as i32;
            let success = v
                .get("success_yjxkdm")
                .and_then(|n| n.as_i64())
                .unwrap_or(0) as i32;
            let failed_list = v
                .get("failed")
                .and_then(|f| f.as_array())
                .map(|a| a.len() as i32)
                .unwrap_or(0);

            let mut p = state.lock().unwrap();
            p.total = total;
            p.success_count = success;
            p.failed_count = failed_list;
            p.current = total;
            // 关键：标记任务结束，前端才能切换到"完成"状态
            p.done = true;
            p.running.store(false, Ordering::SeqCst);
            // 清空批次项（任务完成，不再展示并发项卡片）
            p.batch_items.clear();
            *last_progress_time = std::time::Instant::now();
            let snapshot = p.clone();
            drop(p);
            let _ = app_handle.emit("catalog-update-progress", &snapshot);
        }
    } else if line.starts_with("YAM_MAJORS_UPDATE_BATCH_START ") {
        // ISSUE-023：批次开始 - 解析本批 yjxkdm 列表，初始化 batch_items
        // 格式: YAM_MAJORS_UPDATE_BATCH_START <batch_num> <total_batches> <json_array>
        let rest = &line["YAM_MAJORS_UPDATE_BATCH_START ".len()..];
        let parts: Vec<&str> = rest.splitn(3, ' ').collect();
        if parts.len() >= 3 {
            let batch_num = parts[0].parse::<i32>().unwrap_or(0);
            let total_batches = parts[1].parse::<i32>().unwrap_or(0);
            let json_str = parts[2];

            let mut items: Vec<BatchItem> = Vec::new();
            if let Ok(arr) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(list) = arr.as_array() {
                    for v in list {
                        let yjxkdm = v
                            .get("yjxkdm")
                            .and_then(|s| s.as_str())
                            .unwrap_or("")
                            .to_string();
                        let yjxkmc = v
                            .get("yjxkmc")
                            .and_then(|s| s.as_str())
                            .unwrap_or("")
                            .to_string();
                        if !yjxkdm.is_empty() {
                            items.push(BatchItem {
                                yjxkdm,
                                yjxkmc,
                                status: "pending".to_string(),
                                detail: String::new(),
                            });
                        }
                    }
                }
            }

            let mut p = state.lock().unwrap();
            p.batch_num = batch_num;
            p.total_batches = total_batches;
            p.batch_items = items;
            *last_progress_time = std::time::Instant::now();
            let snapshot = p.clone();
            drop(p);
            let _ = app_handle.emit("catalog-update-progress", &snapshot);
        }
    } else if line.starts_with("YAM_MAJORS_UPDATE_BATCH_ITEM ") {
        // ISSUE-023：批次内单项状态变更 - 更新对应 batch_item 的 status/detail
        // 格式: YAM_MAJORS_UPDATE_BATCH_ITEM <yjxkdm> <status> <detail...>
        let rest = &line["YAM_MAJORS_UPDATE_BATCH_ITEM ".len()..];
        let parts: Vec<&str> = rest.splitn(3, ' ').collect();
        if parts.len() >= 2 {
            let yjxkdm = parts[0];
            let status = parts[1];
            let detail = parts.get(2).copied().unwrap_or("").to_string();

            let mut p = state.lock().unwrap();
            // 在 batch_items 中找匹配的 yjxkdm，更新状态
            let mut found = false;
            for item in p.batch_items.iter_mut() {
                if item.yjxkdm == yjxkdm {
                    item.status = status.to_string();
                    item.detail = detail.clone();
                    found = true;
                    break;
                }
            }
            // 同步更新 current_yjxkdm/current_yjxkmc（前端顶部"当前学科"也跟着变）
            if found {
                if status == "running" || status == "done" || status == "failed" {
                    p.current_yjxkdm = yjxkdm.to_string();
                    // 从 batch_items 找到 yjxkmc
                    if let Some(item) = p.batch_items.iter().find(|i| i.yjxkdm == yjxkdm) {
                        p.current_yjxkmc = item.yjxkmc.clone();
                    }
                    *last_progress_time = std::time::Instant::now();
                }
            }
            let snapshot = p.clone();
            drop(p);
            let _ = app_handle.emit("catalog-update-progress", &snapshot);
        }
    }
}

/// 取消目录更新任务
#[tauri::command]
pub fn cancel_catalog_update(
    state: State<'_, UpdateCatalogState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let snapshot = {
        let mut p = state.lock().unwrap();
        if let Some(pid) = p.child_pid.take() {
            kill_process_tree(pid);
        }
        p.running.store(false, Ordering::SeqCst);
        p.done = true;
        if p.error.is_none() {
            p.error = Some("用户取消目录更新".to_string());
        }
        p.clone()
    };
    // emit 事件让前端立即感知取消（否则前端 progress state 不会更新）
    let _ = app.emit("catalog-update-progress", &snapshot);
    let _ = app.emit("catalog-update-done", &snapshot);
    Ok(())
}

/// 重置目录更新状态
#[tauri::command]
pub fn reset_catalog_update(state: State<'_, UpdateCatalogState>) -> Result<(), String> {
    let mut p = state.lock().unwrap();
    if let Some(pid) = p.child_pid.take() {
        kill_process_tree(pid);
    }
    *p = UpdateCatalogProgress::default();
    Ok(())
}

/// 查询目录更新进度
#[tauri::command]
pub fn get_catalog_update_progress(state: State<'_, UpdateCatalogState>) -> UpdateCatalogProgress {
    state.lock().unwrap().clone()
}

/// 读取 majors_realtime.json 内容（如果存在）.
///
/// 返回 Option<String>：None 表示文件不存在（前端应回退到本地静态 majors.ts），
/// Some(json_str) 表示文件存在但内容由前端 JSON.parse 解析。
#[tauri::command]
pub fn read_majors_catalog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let user_path = app
        .path()
        .resolve(
            ".yam/data/majors_realtime.json",
            tauri::path::BaseDirectory::Home,
        )
        .map_err(|e| format!("无法解析专业目录路径: {e}"))?;
    if user_path.exists() {
        return std::fs::read_to_string(&user_path)
            .map(Some)
            .map_err(|e| format!("读取 majors_realtime.json 失败: {e}"));
    }
    if cfg!(debug_assertions) {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(Path::to_path_buf)
            .ok_or("无法确定仓库根目录")?;
        let fallback = repo_root.join("data").join("majors_realtime.json");
        if fallback.exists() {
            return std::fs::read_to_string(fallback)
                .map(Some)
                .map_err(|e| format!("读取开发专业目录失败: {e}"));
        }
    }
    Ok(None)
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct ExportSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_directory: Option<String>,
}

fn export_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(
            ".yam/config/desktop-settings.json",
            tauri::path::BaseDirectory::Home,
        )
        .map_err(|e| format!("无法确定导出设置路径: {e}"))
}

fn read_export_settings(path: &Path) -> Result<ExportSettings, String> {
    if !path.exists() {
        return Ok(ExportSettings::default());
    }
    let content = std::fs::read_to_string(path).map_err(|e| format!("读取导出设置失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析导出设置失败: {e}"))
}

fn write_export_settings(path: &Path, settings: &ExportSettings) -> Result<(), String> {
    let config_dir = path.parent().ok_or("无法确定导出设置目录")?;
    std::fs::create_dir_all(config_dir).map_err(|e| format!("创建导出设置目录失败: {e}"))?;
    let temp_path = config_dir.join("desktop-settings.json.tmp");
    let content =
        serde_json::to_vec_pretty(settings).map_err(|e| format!("序列化导出设置失败: {e}"))?;
    std::fs::write(&temp_path, content).map_err(|e| format!("写入导出设置临时文件失败: {e}"))?;
    atomic_replace_file(&temp_path, path).map_err(|e| format!("保存导出设置失败: {e}"))
}

#[cfg(not(windows))]
fn atomic_replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::rename(source, destination)
}

#[cfg(windows)]
fn atomic_replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn clear_export_settings(path: &Path) -> Result<(), String> {
    write_export_settings(path, &ExportSettings::default())
}

fn sanitize_export_filename(default_filename: &str, allowed_ext: &str) -> String {
    let filename = Path::new(default_filename)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("export");
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("export");
    format!("{stem}.{allowed_ext}")
}

fn directory_is_writable(directory: &Path) -> bool {
    if !directory.is_dir() {
        return false;
    }
    match tempfile_path_for_write_check(directory) {
        Some(path) => std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .and_then(|_| std::fs::remove_file(path))
            .is_ok(),
        None => false,
    }
}

fn tempfile_path_for_write_check(directory: &Path) -> Option<PathBuf> {
    let process_id = std::process::id();
    (0..10)
        .map(|attempt| directory.join(format!(".yam-write-check-{process_id}-{attempt}")))
        .find(|path| !path.exists())
}

fn resolve_preferred_export_path(
    settings: &ExportSettings,
    default_filename: &str,
    allowed_ext: &str,
) -> Option<PathBuf> {
    let directory = settings.export_directory.as_deref().map(Path::new)?;
    directory_is_writable(directory)
        .then(|| directory.join(sanitize_export_filename(default_filename, allowed_ext)))
}

#[tauri::command]
pub fn get_export_settings(app: tauri::AppHandle) -> Result<ExportSettings, String> {
    read_export_settings(&export_settings_path(&app)?)
}

#[tauri::command]
pub fn choose_export_directory(app: tauri::AppHandle) -> Result<ExportSettings, String> {
    let settings_path = export_settings_path(&app)?;
    let current = read_export_settings(&settings_path)?;
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(current);
    };
    let directory = PathBuf::from(selected.to_string());
    if !directory.is_dir() {
        return Err("所选导出目录不存在或不是目录".to_string());
    }
    if !directory_is_writable(&directory) {
        return Err("所选导出目录不可写".to_string());
    }
    let settings = ExportSettings {
        export_directory: Some(directory.to_string_lossy().into_owned()),
    };
    write_export_settings(&settings_path, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn clear_export_directory(app: tauri::AppHandle) -> Result<ExportSettings, String> {
    let settings_path = export_settings_path(&app)?;
    clear_export_settings(&settings_path)?;
    Ok(ExportSettings::default())
}

fn preferred_export_path(
    app: &tauri::AppHandle,
    default_filename: &str,
    ext: &str,
) -> Option<PathBuf> {
    let settings_path = export_settings_path(app).ok()?;
    let settings = read_export_settings(&settings_path).ok()?;
    resolve_preferred_export_path(&settings, default_filename, ext)
}

const PLAN_EXPORT_HEADERS: [&str; 26] = [
    "院校代码",
    "院校名称",
    "专业代码",
    "专业名称",
    "省份",
    "层次",
    "院系",
    "研究方向",
    "方向标签类型",
    "方向是否回退",
    "考试科目",
    "学习方式",
    "考试方式",
    "特殊计划",
    "院校来源",
    "院校更新时间",
    "计划来源",
    "计划更新时间",
    "最新计划年份",
    "最新分数年份",
    "分数线",
    "分数粒度",
    "招生人数",
    "分数来源",
    "分数更新时间",
    "匹配说明",
];

#[derive(Clone, Debug, Default, Serialize)]
pub struct ExportProgress {
    pub running: bool,
    pub done: bool,
    pub current: usize,
    pub total: usize,
    pub format: String,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Default)]
pub struct ExportState {
    progress: Arc<Mutex<ExportProgress>>,
    cancel: Arc<AtomicBool>,
}

fn export_task_running_error() -> AppError {
    AppError {
        code: "TASK_RUNNING".to_string(),
        message: "已有导出任务正在运行".to_string(),
        impact: "本次导出未启动，当前任务继续运行。".to_string(),
        action: "请等待当前导出完成后重试。".to_string(),
        retryable: false,
    }
}

fn database_file_path(db: &DbConn) -> Result<PathBuf, AppError> {
    db_query(&db.0, "读取数据库路径", |conn| {
        conn.query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(PathBuf::from)
        .map_err(|err| err.to_string())
    })
}

fn plan_export_extension(format: &str) -> Result<&'static str, AppError> {
    match format {
        "csv" => Ok("csv"),
        "json" => Ok("json"),
        "excel" | "xlsx" => Ok("xlsx"),
        _ => Err(AppError {
            code: "INVALID_EXPORT_FORMAT".to_string(),
            message: "不支持的导出格式".to_string(),
            impact: "本次导出未启动。".to_string(),
            action: "请选择 CSV、JSON 或 Excel。".to_string(),
            retryable: false,
        }),
    }
}

fn plan_export_part_path(path: &Path) -> PathBuf {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("plan-export");
    path.with_file_name(format!("{filename}.part"))
}

fn csv_field(value: &Value) -> String {
    let raw = match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        _ => value.to_string(),
    };
    if raw.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", raw.replace('"', "\"\""))
    } else {
        raw
    }
}

fn latest_score_year(row: &WorkspacePlanRow) -> Option<&crate::db::WorkspaceYear> {
    row.years.iter().find(|year| year.year == row.latest_score_year)
        .or_else(|| row.years.iter().find(|year| !matches!(year.score_scope.as_str(), "first_level_reference" | "category_reference")))
}

fn score_scope_label(row: &WorkspacePlanRow) -> &'static str {
    match latest_score_year(row).map(|year| year.score_scope.as_str()) {
        Some("exact_direction") => "方向分数线",
        Some("department") => "院系分数线",
        Some("school_major") => "院校专业参考线",
        Some("first_level_reference") => "一级学科参考线",
        Some("category_reference") => "门类参考线",
        _ => "分数参考",
    }
}

fn plan_direction_label(row: &WorkspacePlanRow) -> (String, &'static str, bool) {
    if !row.research_direction.trim().is_empty() {
        (row.research_direction.trim().to_string(), "direction", false)
    } else {
        let subjects = row
            .exam_subjects
            .iter()
            .filter(|value| !value.is_empty())
            .cloned()
            .collect::<Vec<_>>();
        if !subjects.is_empty() {
            (subjects.join(" / "), "exam_subject", true)
        } else {
            let plans = row
                .special_plans
                .iter()
                .filter(|value| !value.is_empty())
                .cloned()
                .collect::<Vec<_>>();
            if plans.is_empty() {
                ("未注明研究方向".to_string(), "unspecified", true)
            } else {
                (plans.join(" / "), "special_plan", true)
            }
        }
    }
}

fn plan_export_row(row: &WorkspacePlanRow, major_name: &str) -> Vec<Value> {
    let latest_year = latest_score_year(row);
    let (direction, direction_type, direction_fallback) = plan_direction_label(row);
    vec![
        json!(row.school_code),
        json!(row.school_name),
        json!(row.major_code),
        json!(major_name),
        json!(row.province),
        json!(row.level),
        json!(row.department_name),
        json!(direction),
        json!(direction_type),
        json!(direction_fallback),
        json!(row.exam_subjects.join("; ")),
        json!(row.study_mode),
        json!(row.exam_type),
        json!(row.special_plans.join("; ")),
        json!(row.school_source),
        json!(row.school_updated_at),
        json!(row.department_source),
        json!(row.department_updated_at),
        json!(row.latest_plan_year),
        json!(row.latest_score_year),
        json!(row.latest_min_score),
        json!(score_scope_label(row)),
        json!(row.latest_enroll_count),
        json!(latest_year.map(|year| year.source.as_str()).unwrap_or("")),
        json!(latest_year
            .map(|year| year.updated_at.as_str())
            .unwrap_or("")),
        json!(latest_year
            .map(|year| year.match_note.as_str())
            .unwrap_or("")),
    ]
}

fn load_major_names(conn: &Connection, major_codes: &[String]) -> HashMap<String, String> {
    let mut names = HashMap::new();
    if let Ok(mut statement) = conn.prepare("SELECT major_code, name FROM workspace_majors") {
        if let Ok(rows) = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }) {
            for row in rows.flatten() {
                if major_codes.contains(&row.0) {
                    names.insert(row.0, row.1);
                }
            }
        }
    }
    names
}

fn write_plan_export<F>(
    rows: &[WorkspacePlanRow],
    major_names: &HashMap<String, String>,
    major_codes: &[String],
    format: &str,
    target_path: &Path,
    cancel: &AtomicBool,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(usize),
{
    let part_path = plan_export_part_path(target_path);
    let _ = std::fs::remove_file(&part_path);
    let result = (|| -> Result<(), String> {
        match format {
            "csv" => {
                let file = std::fs::File::create(&part_path)
                    .map_err(|_| "无法创建导出临时文件".to_string())?;
                let mut writer = BufWriter::new(file);
                writer
                    .write_all("\u{feff}".as_bytes())
                    .map_err(|_| "写入 CSV 失败".to_string())?;
                writer
                    .write_all(PLAN_EXPORT_HEADERS.join(",").as_bytes())
                    .map_err(|_| "写入 CSV 表头失败".to_string())?;
                for (index, row) in rows.iter().enumerate() {
                    if cancel.load(Ordering::SeqCst) {
                        return Err("导出已取消".to_string());
                    }
                    let major_name = major_names
                        .get(&row.major_code)
                        .map(String::as_str)
                        .unwrap_or(&row.major_code);
                    let line = plan_export_row(row, major_name)
                        .iter()
                        .map(csv_field)
                        .collect::<Vec<_>>()
                        .join(",");
                    writer
                        .write_all(format!("\r\n{line}").as_bytes())
                        .map_err(|_| "写入 CSV 数据失败".to_string())?;
                    on_progress(index + 1);
                }
                writer.flush().map_err(|_| "保存 CSV 失败".to_string())?;
            }
            "json" => {
                let mut json_rows = Vec::with_capacity(rows.len());
                for (index, row) in rows.iter().enumerate() {
                    if cancel.load(Ordering::SeqCst) {
                        return Err("导出已取消".to_string());
                    }
                    let mut value = serde_json::to_value(row)
                        .map_err(|_| "序列化 JSON 数据失败".to_string())?;
                    if let Value::Object(ref mut object) = value {
                        object.insert(
                            "major_name".to_string(),
                            json!(major_names
                                .get(&row.major_code)
                                .map(String::as_str)
                                .unwrap_or(&row.major_code)),
                        );
                    }
                    json_rows.push(value);
                    on_progress(index + 1);
                }
                let payload = json!({
                    "export_date": chrono::Utc::now().to_rfc3339(),
                    "view_mode": "plan",
                    "major_codes": major_codes,
                    "row_count": json_rows.len(),
                    "columns": PLAN_EXPORT_HEADERS,
                    "rows": json_rows,
                });
                let file = std::fs::File::create(&part_path)
                    .map_err(|_| "无法创建导出临时文件".to_string())?;
                serde_json::to_writer_pretty(BufWriter::new(file), &payload)
                    .map_err(|_| "写入 JSON 失败".to_string())?;
            }
            "excel" | "xlsx" => {
                let mut workbook = Workbook::new();
                let worksheet = workbook
                    .add_worksheet()
                    .set_name("招生计划")
                    .map_err(|_| "创建 Excel 工作表失败".to_string())?;
                let bold = Format::new().set_bold();
                for (column, header) in PLAN_EXPORT_HEADERS.iter().enumerate() {
                    worksheet
                        .write_string_with_format(0, column as u16, *header, &bold)
                        .map_err(|_| "写入 Excel 表头失败".to_string())?;
                }
                worksheet
                    .set_freeze_panes(1, 0)
                    .map_err(|_| "设置 Excel 冻结窗格失败".to_string())?;
                for (column, width) in [
                    14.0, 28.0, 12.0, 20.0, 8.0, 10.0, 22.0, 24.0, 30.0, 10.0, 10.0, 14.0, 18.0,
                    20.0, 18.0, 20.0, 10.0, 10.0, 16.0, 10.0, 18.0, 20.0, 28.0,
                ]
                .iter()
                .enumerate()
                {
                    worksheet
                        .set_column_width(column as u16, *width)
                        .map_err(|_| "设置 Excel 列宽失败".to_string())?;
                }
                for (index, row) in rows.iter().enumerate() {
                    if cancel.load(Ordering::SeqCst) {
                        return Err("导出已取消".to_string());
                    }
                    let major_name = major_names
                        .get(&row.major_code)
                        .map(String::as_str)
                        .unwrap_or(&row.major_code);
                    for (column, value) in plan_export_row(row, major_name).iter().enumerate() {
                        let excel_row = (index + 1) as u32;
                        let excel_column = column as u16;
                        match value {
                            Value::Number(number) => worksheet
                                .write_number(
                                    excel_row,
                                    excel_column,
                                    number.as_f64().unwrap_or(0.0),
                                )
                                .map(|_| ()),
                            Value::String(value) => worksheet
                                .write_string(excel_row, excel_column, value)
                                .map(|_| ()),
                            _ => worksheet
                                .write_string(excel_row, excel_column, value.to_string())
                                .map(|_| ()),
                        }
                        .map_err(|_| "写入 Excel 数据失败".to_string())?;
                    }
                    on_progress(index + 1);
                }
                workbook
                    .save(&part_path)
                    .map_err(|_| "保存 Excel 失败".to_string())?;
            }
            _ => return Err("不支持的导出格式".to_string()),
        }
        atomic_replace_file(&part_path, target_path).map_err(|_| "无法完成导出文件替换".to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&part_path);
    }
    result
}

fn emit_export_state(app: &tauri::AppHandle, progress: &Arc<Mutex<ExportProgress>>, event: &str) {
    if let Ok(state) = progress.lock() {
        let _ = app.emit(event, state.clone());
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn start_plan_export(
    app: tauri::AppHandle,
    state: State<'_, ExportState>,
    db: State<'_, DbConn>,
    major_codes: Vec<String>,
    province: Option<String>,
    provinces: Option<Vec<String>>,
    region_group: Option<String>,
    levels: Option<Vec<String>>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    min_score_min: Option<i32>,
    min_score_max: Option<i32>,
    enroll_count_min: Option<i32>,
    enroll_count_max: Option<i32>,
    department_name: Option<String>,
    research_direction: Option<String>,
    study_modes: Option<Vec<String>>,
    exam_types: Option<Vec<String>>,
    self_scoring: Option<bool>,
    doctoral_program: Option<bool>,
    double_first_class: Option<bool>,
    special_plans: Option<Vec<String>>,
    english_min: Option<i32>,
    english_max: Option<i32>,
    business_one_min: Option<i32>,
    business_one_max: Option<i32>,
    business_two_min: Option<i32>,
    business_two_max: Option<i32>,
    foreign_subjects: Option<Vec<String>>,
    business_one_subjects: Option<Vec<String>>,
    business_two_subjects: Option<Vec<String>>,
    search_query: Option<String>,
    format: String,
    default_filename: String,
) -> Result<bool, AppError> {
    let extension = plan_export_extension(&format)?;
    {
        let mut progress = state.progress.lock().unwrap();
        if progress.running {
            return Err(export_task_running_error());
        }
        *progress = ExportProgress {
            running: true,
            done: false,
            current: 0,
            total: 0,
            format: format.clone(),
            path: None,
            error: None,
        };
    }
    state.cancel.store(false, Ordering::SeqCst);

    let safe_filename = sanitize_export_filename(&default_filename, extension);
    let target_path = if let Some(path) = preferred_export_path(&app, &safe_filename, extension) {
        path
    } else {
        let label = if extension == "xlsx" {
            "Excel".to_string()
        } else {
            extension.to_uppercase()
        };
        let selected = app
            .dialog()
            .file()
            .add_filter(&label, &[extension])
            .set_file_name(&safe_filename)
            .blocking_save_file();
        let Some(selected) = selected else {
            *state.progress.lock().unwrap() = ExportProgress::default();
            return Ok(false);
        };
        PathBuf::from(selected.to_string())
    };
    let db_path = match database_file_path(&db) {
        Ok(path) => path,
        Err(error) => {
            *state.progress.lock().unwrap() = ExportProgress::default();
            return Err(error);
        }
    };
    {
        let mut progress = state.progress.lock().unwrap();
        progress.path = Some(target_path.to_string_lossy().into_owned());
    }
    emit_export_state(&app, &state.progress, "export-progress");

    let progress = Arc::clone(&state.progress);
    let cancel = Arc::clone(&state.cancel);
    std::thread::spawn(move || {
        let worker = catch_unwind(AssertUnwindSafe(|| -> Result<(), String> {
            let conn =
                Connection::open(&db_path).map_err(|_| "无法打开工作区数据库".to_string())?;
            let major_names = load_major_names(&conn, &major_codes);
            let major_code_refs = major_codes.iter().map(String::as_str).collect::<Vec<_>>();
            let provinces_ref = provinces
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let levels_ref = levels
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let study_modes_ref = study_modes
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let exam_types_ref = exam_types
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let special_plans_ref = special_plans
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let foreign_subjects_ref = foreign_subjects
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let business_one_subjects_ref = business_one_subjects
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let business_two_subjects_ref = business_two_subjects
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            let rows = get_workspace_plans(
                &conn,
                &major_code_refs,
                WorkspaceFilterParams {
                    province: province.as_deref(),
                    provinces: provinces_ref.as_deref(),
                    region_group: region_group.as_deref(),
                    levels: levels_ref.as_deref(),
                    sort_by: sort_by.as_deref(),
                    sort_order: sort_order.as_deref(),
                    min_score_min,
                    min_score_max,
                    enroll_count_min,
                    enroll_count_max,
                    department_name: department_name.as_deref(),
                    research_direction: research_direction.as_deref(),
                    study_modes: study_modes_ref.as_deref(),
                    exam_types: exam_types_ref.as_deref(),
                    self_scoring,
                    doctoral_program,
                    double_first_class,
                    special_plans: special_plans_ref.as_deref(),
                    english_min,
                    english_max,
                    business_one_min,
                    business_one_max,
                    business_two_min,
                    business_two_max,
                    foreign_subjects: foreign_subjects_ref.as_deref(),
                    business_one_subjects: business_one_subjects_ref.as_deref(),
                    business_two_subjects: business_two_subjects_ref.as_deref(),
                    search_query: search_query.as_deref(),
                },
            );
            {
                let mut state = progress.lock().unwrap();
                state.total = rows.len();
            }
            emit_export_state(&app, &progress, "export-progress");
            write_plan_export(
                &rows,
                &major_names,
                &major_codes,
                &format,
                &target_path,
                &cancel,
                |current| {
                    let should_emit = current == rows.len() || current % 50 == 0;
                    if let Ok(mut state) = progress.lock() {
                        state.current = current;
                    }
                    if should_emit {
                        emit_export_state(&app, &progress, "export-progress");
                    }
                },
            )
        }));
        let error = match worker {
            Ok(Ok(())) => None,
            Ok(Err(message)) => Some(message),
            Err(_) => Some("导出过程中发生内部错误，请重试".to_string()),
        };
        if let Ok(mut state) = progress.lock() {
            state.running = false;
            state.done = true;
            state.error = error;
        }
        emit_export_state(&app, &progress, "export-done");
    });
    Ok(true)
}

#[tauri::command]
pub fn get_export_progress(state: State<'_, ExportState>) -> ExportProgress {
    state.progress.lock().unwrap().clone()
}

#[tauri::command]
pub fn cancel_export(state: State<'_, ExportState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

/// ISSUE-026/028：弹出"保存文件"对话框并将文本内容（CSV / JSON）写入用户选择的路径。
///
/// - `default_filename`：默认文件名（已含扩展名，如 `085400_电子信息_20260721.csv`）
/// - `content`：完整文本（CSV 已加 UTF-8 BOM、已转义字段；JSON 已序列化）
/// - `ext`：扩展名（"csv" | "json"），用于对话框过滤器
///
/// 返回 `Ok(Some(path))` 表示保存成功并返回写入路径；`Ok(None)` 表示用户取消；
/// `Err(msg)` 表示写入失败。
#[tauri::command]
pub fn export_file(
    app: tauri::AppHandle,
    default_filename: String,
    content: String,
    ext: String,
) -> Result<Option<String>, String> {
    let ext = match ext.as_str() {
        "csv" => "csv",
        "json" => "json",
        _ => return Err("不支持的导出文件扩展名".to_string()),
    };
    let safe_filename = sanitize_export_filename(&default_filename, ext);
    if let Some(path) = preferred_export_path(&app, &safe_filename, ext) {
        if std::fs::write(&path, content.as_bytes()).is_ok() {
            return Ok(Some(path.to_string_lossy().into_owned()));
        }
    }

    let filter_label = ext.to_uppercase();
    let file_path = app
        .dialog()
        .file()
        .add_filter(&filter_label, &[ext])
        .set_file_name(&safe_filename)
        .blocking_save_file();

    let path = match file_path {
        Some(p) => p,
        None => return Ok(None),
    };

    let path_str = path.to_string();
    std::fs::write(&path_str, content.as_bytes()).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(Some(path_str))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn materialize_backend_bytes_writes_atomically_and_reuses_matching_file() {
        let temp = tempfile::tempdir().unwrap();
        let bytes = b"backend-test";
        let first = materialize_backend_bytes(temp.path(), "test", bytes).unwrap();
        assert_eq!(std::fs::read(&first).unwrap(), bytes);
        assert!(!first.with_extension("exe.part").exists());
        let second = materialize_backend_bytes(temp.path(), "test", bytes).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn backend_command_resolution_separates_debug_and_release() {
        let debug = resolve_backend_command(
            true,
            Path::new("C:/app"),
            Path::new("C:/Users/test"),
            Path::new("D:/yam"),
            "doctor",
        );
        assert_eq!(debug.args, vec!["-m", "yam.backend_entry", "doctor"]);
        assert_eq!(debug.working_dir, PathBuf::from("D:/yam"));
        assert_eq!(debug.resource_dir, None);

        let release = resolve_backend_command(
            false,
            Path::new("C:/app"),
            Path::new("C:/Users/test"),
            Path::new("D:/yam"),
            "doctor",
        );
        assert_eq!(
            release.program,
            PathBuf::from("C:/app/resources/yam-backend.exe")
        );
        assert_eq!(release.args, vec!["doctor"]);
        assert_eq!(release.working_dir, PathBuf::from("C:/Users/test/.yam"));
        assert_eq!(release.resource_dir, Some(PathBuf::from("C:/app")));
    }

    #[test]
    fn sanitize_export_filename_removes_path_traversal() {
        assert_eq!(sanitize_export_filename("../evil.csv", "csv"), "evil.csv");
        assert_eq!(
            sanitize_export_filename("report.exe", "json"),
            "report.json"
        );
    }

    #[test]
    fn export_settings_round_trip_and_clear() {
        let temp = tempfile::tempdir().unwrap();
        let settings_path = temp.path().join("config").join("desktop-settings.json");
        let settings = ExportSettings {
            export_directory: Some(temp.path().to_string_lossy().into_owned()),
        };

        write_export_settings(&settings_path, &settings).unwrap();
        assert_eq!(read_export_settings(&settings_path).unwrap(), settings);

        clear_export_settings(&settings_path).unwrap();
        assert_eq!(
            read_export_settings(&settings_path).unwrap(),
            ExportSettings::default()
        );
    }

    #[test]
    fn preferred_export_path_uses_valid_directory() {
        let temp = tempfile::tempdir().unwrap();
        let settings = ExportSettings {
            export_directory: Some(temp.path().to_string_lossy().into_owned()),
        };

        assert_eq!(
            resolve_preferred_export_path(&settings, "../report.csv", "csv"),
            Some(temp.path().join("report.csv"))
        );
    }

    #[test]
    fn preferred_export_path_ignores_invalid_directory() {
        let temp = tempfile::tempdir().unwrap();
        let settings = ExportSettings {
            export_directory: Some(temp.path().join("missing").to_string_lossy().into_owned()),
        };

        assert_eq!(
            resolve_preferred_export_path(&settings, "report.csv", "csv"),
            None
        );
    }

    fn sample_plan_row() -> WorkspacePlanRow {
        WorkspacePlanRow {
            school_id: "school-1".to_string(),
            school_code: "10001".to_string(),
            school_name: "测试,\"大学\"".to_string(),
            province: "北京".to_string(),
            level: "双一流".to_string(),
            is_985: true,
            is_211: true,
            double_first_class: true,
            self_scoring: true,
            doctoral_program: true,
            display_order: 1,
            school_source: "school-source".to_string(),
            school_updated_at: "2026-07-01T08:00:00Z".to_string(),
            major_code: "081200".to_string(),
            department_id: 1,
            source_department_id: "dept-1".to_string(),
            plan_key: "plan-1".to_string(),
            department_name: "计算机学院".to_string(),
            research_direction: "人工智能".to_string(),
            exam_subjects: vec!["英语一".to_string(), "408".to_string()],
            study_mode: "全日制".to_string(),
            exam_type: "统考".to_string(),
            special_plans: vec!["专项".to_string()],
            department_source: "plan-source".to_string(),
            department_updated_at: "2026-07-02T08:00:00Z".to_string(),
            latest_year: 2026,
            latest_plan_year: 2026,
            latest_score_year: 2026,
            latest_min_score: 350,
            latest_enroll_count: 20,
            years: vec![crate::db::WorkspaceYear {
                year: 2026,
                enroll_count: 20,
                min_score: 350,
                politics: 50,
                english: 50,
                math: 80,
                specialized: 80,
                score_scope: "exact_direction".to_string(),
                source: "score-source".to_string(),
                updated_at: "2026-07-03T08:00:00Z".to_string(),
                match_note: "按方向精确匹配".to_string(),
            }],
        }
    }

    #[test]
    fn plan_export_headers_and_row_have_semantic_columns() {
        assert_eq!(PLAN_EXPORT_HEADERS.len(), 26);
        let row = plan_export_row(&sample_plan_row(), "计算机科学与技术");
        assert_eq!(row.len(), 26);
        assert_eq!(row[7], json!("人工智能"));
        assert_eq!(row[8], json!("direction"));
        assert_eq!(row[19], json!(2026));
        assert_eq!(row[21], json!("方向分数线"));
        assert_eq!(row[23], json!("score-source"));
    }

    #[test]
    fn csv_field_escapes_quotes_commas_and_newlines() {
        assert_eq!(csv_field(&json!("普通字段")), "普通字段");
        assert_eq!(csv_field(&json!("a,b\"c\nd")), "\"a,b\"\"c\nd\"");
    }

    #[test]
    fn plan_csv_export_uses_part_then_atomic_rename() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("plans.csv");
        let part = plan_export_part_path(&target);
        let rows = vec![sample_plan_row()];
        let names = HashMap::from([("081200".to_string(), "计算机科学与技术".to_string())]);
        write_plan_export(
            &rows,
            &names,
            &["081200".to_string()],
            "csv",
            &target,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();

        let content = std::fs::read_to_string(&target).unwrap();
        assert!(content.starts_with('\u{feff}'));
        assert_eq!(content.lines().count(), 2);
        assert!(content.contains("\"测试,\"\"大学\"\"\""));
        assert!(!part.exists());
    }

    #[test]
    fn real_plan_csv_export_to_tempdir_when_database_is_provided() {
        let Ok(database_path) = std::env::var("YAM_REAL_DB") else {
            return;
        };
        let conn = Connection::open(database_path).unwrap();
        let rows = get_workspace_plans(
            &conn,
            &["081200"],
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
            },
        );
        assert_eq!(rows.len(), 1043);

        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("081200-plans.csv");
        let part = plan_export_part_path(&target);
        let major_codes = vec!["081200".to_string()];
        let names = load_major_names(&conn, &major_codes);
        write_plan_export(
            &rows,
            &names,
            &major_codes,
            "csv",
            &target,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();

        let content = std::fs::read_to_string(&target).unwrap();
        assert_eq!(content.matches("\r\n").count(), 1043);
        assert!(!part.exists());
    }

    #[test]
    fn db_query_converts_database_panic_to_structured_error() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE schools (school_id TEXT, name TEXT, province TEXT, major_code TEXT)",
            [],
        )
        .unwrap();
        let db = Mutex::new(conn);

        let result = db_query(&db, "加载院校", |conn| Ok(get_schools(conn, "085400")));

        let error = match result {
            Ok(_) => panic!("missing schools column should be isolated"),
            Err(error) => error,
        };
        assert_eq!(error.code, "DB_QUERY_FAILED");
        assert!(error.retryable);
    }

    #[test]
    fn db_guard_recovers_poisoned_mutex_without_panicking() {
        let db = Arc::new(Mutex::new(Connection::open_in_memory().unwrap()));
        let poisoned = Arc::clone(&db);
        let _ = std::thread::spawn(move || {
            let _conn = poisoned.lock().unwrap();
            panic!("poison database lock");
        })
        .join();

        let result = db_query(&db, "健康检查", |conn| {
            conn.query_row("SELECT 1", [], |row| row.get::<_, i64>(0))
                .map_err(|err| err.to_string())
        });

        assert_eq!(result.unwrap(), 1);
    }
}

/// ISSUE-028：导出为 Excel（.xlsx）。前端传结构化的表头 + 行（每 cell 为 serde_json::Value），
/// Rust 侧用 rust_xlsxwriter 生成 xlsx：表头加粗、首行冻结、按列手动设宽（autofit 对 CJK 偏窄）。
///
/// - `default_filename`：默认文件名（如 `085400_电子信息_20260723.xlsx`）
/// - `sheet_name`：工作表名（"院校列表" | "招生计划"）
/// - `headers`：表头字符串数组
/// - `rows`：数据行，每行为 `Vec<Value>`，按 Value 变体写 cell
///   （Null→空白、Bool→布尔、Number→数字、String→字符串，其他→to_string）
///
/// 返回值语义同 `export_file`。
#[tauri::command]
pub fn export_excel(
    app: tauri::AppHandle,
    default_filename: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<Value>>,
) -> Result<Option<String>, String> {
    let safe_filename = sanitize_export_filename(&default_filename, "xlsx");
    let preferred_path = preferred_export_path(&app, &safe_filename, "xlsx");
    let dialog_path = || {
        app.dialog()
            .file()
            .add_filter("Excel", &["xlsx"])
            .set_file_name(&safe_filename)
            .blocking_save_file()
            .map(|path| PathBuf::from(path.to_string()))
    };
    let using_preferred_path = preferred_path.is_some();
    let path = if let Some(path) = preferred_path {
        path
    } else {
        match dialog_path() {
            Some(path) => path,
            None => return Ok(None),
        }
    };

    let mut workbook = Workbook::new();
    let worksheet = workbook
        .add_worksheet()
        .set_name(&sheet_name)
        .map_err(|e| format!("创建工作表失败: {}", e))?;

    let bold = Format::new().set_bold();

    // 写表头（首行，加粗）
    for (col, header) in headers.iter().enumerate() {
        worksheet
            .write_string_with_format(0, col as u16, header, &bold)
            .map_err(|e| format!("写表头失败: {}", e))?;
    }

    // 手动列宽：autofit 对 CJK 字符宽度估算偏窄，按列索引设固定宽度更稳定。
    // 顺序对应前端 headers：代码列窄、名称列宽、科目列最宽、其余默认。
    // 院校视图：院校代码/院校名称/专业代码/专业名称/省份/层次/最低分/招生人数/自划线/博士点/双一流/985/211
    // 招生计划：院校代码/院校名称/专业代码/专业名称/省份/层次/院系/研究方向/考试科目/学习方式/考试方式/特殊计划/最新年份/最低分/招生人数
    let col_widths: [f64; 15] = [
        14.0, // 院校代码
        28.0, // 院校名称
        12.0, // 专业代码
        20.0, // 专业名称
        8.0,  // 省份
        10.0, // 层次
        22.0, // 院系
        20.0, // 研究方向
        30.0, // 考试科目
        10.0, // 学习方式
        10.0, // 考试方式
        14.0, // 特殊计划
        10.0, // 最新年份
        10.0, // 最低分
        10.0, // 招生人数
    ];
    let col_count = headers.len();
    for col in 0..col_count {
        let width = col_widths.get(col).copied().unwrap_or(12.0);
        worksheet
            .set_column_width(col as u16, width)
            .map_err(|e| format!("设置列宽失败: {}", e))?;
    }

    // 冻结首行
    worksheet
        .set_freeze_panes(1, 0)
        .map_err(|e| format!("设置冻结窗格失败: {}", e))?;

    // 写数据行：按 Value 变体映射 cell 类型
    for (row_idx, row) in rows.iter().enumerate() {
        for (col_idx, value) in row.iter().enumerate() {
            let r = (row_idx + 1) as u32;
            let c = col_idx as u16;
            match value {
                Value::Null => {
                    worksheet
                        .write_blank(r, c, &Format::default())
                        .map_err(|e| format!("写单元格失败: {}", e))?;
                }
                Value::Bool(b) => {
                    worksheet
                        .write_boolean(r, c, *b)
                        .map_err(|e| format!("写单元格失败: {}", e))?;
                }
                Value::Number(n) => {
                    let f = n.as_f64().unwrap_or(0.0);
                    worksheet
                        .write_number(r, c, f)
                        .map_err(|e| format!("写单元格失败: {}", e))?;
                }
                Value::String(s) => {
                    worksheet
                        .write_string(r, c, s)
                        .map_err(|e| format!("写单元格失败: {}", e))?;
                }
                _ => {
                    worksheet
                        .write_string(r, c, &value.to_string())
                        .map_err(|e| format!("写单元格失败: {}", e))?;
                }
            }
        }
    }

    if let Err(error) = workbook.save(&path) {
        if using_preferred_path {
            let Some(fallback_path) = dialog_path() else {
                return Ok(None);
            };
            workbook
                .save(&fallback_path)
                .map_err(|e| format!("写入 Excel 失败: {e}"))?;
            return Ok(Some(fallback_path.to_string_lossy().into_owned()));
        }
        return Err(format!("写入 Excel 失败: {error}"));
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}
