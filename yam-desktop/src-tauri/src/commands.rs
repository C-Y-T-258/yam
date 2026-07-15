use crate::db::{
    add_favorite, add_recent_view, clear_recent_views, get_available_majors, get_favorites,
    get_recent_views, get_score_lines, get_schools, get_workspace_departments,
    get_workspace_filter_options, get_workspace_schools, remove_favorite, AvailableMajor, DbConn,
    Favorite, FilterOptions, RecentView, ScoreLine, School, WorkspaceDepartment, WorkspaceFilterParams,
    WorkspaceSchool,
};
use serde::Serialize;
use std::sync::{Arc, Mutex};
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

#[derive(Serialize)]
pub struct WorkspaceData {
    pub schools: Vec<WorkspaceSchool>,
    pub departments: Vec<WorkspaceDepartment>,
}

#[tauri::command]
pub fn fetch_workspace_data(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
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
) -> WorkspaceData {
    let conn = state.0.lock().unwrap();

    let provinces_ref: Option<Vec<&str>> = provinces.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let study_modes_ref: Option<Vec<&str>> = study_modes.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let exam_types_ref: Option<Vec<&str>> = exam_types.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let special_plans_ref: Option<Vec<&str>> = special_plans.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let levels_ref: Option<Vec<&str>> = levels.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let foreign_subjects_ref: Option<Vec<&str>> = foreign_subjects.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let business_one_subjects_ref: Option<Vec<&str>> = business_one_subjects.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());
    let business_two_subjects_ref: Option<Vec<&str>> = business_two_subjects.as_ref().map(|v| v.iter().map(|s| s.as_str()).collect());

    let schools = get_workspace_schools(
        &conn,
        &major_code,
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
        },
    );
    let departments = if school_id.is_empty() {
        Vec::new()
    } else {
        get_workspace_departments(&conn, &school_id, &major_code)
    };

    WorkspaceData { schools, departments }
}

#[tauri::command]
pub fn fetch_workspace_filter_options(
    state: State<'_, DbConn>,
    major_code: String,
) -> FilterOptions {
    let conn = state.0.lock().unwrap();
    get_workspace_filter_options(&conn, &major_code)
}

#[tauri::command]
pub fn fetch_available_majors(state: State<'_, DbConn>) -> Vec<AvailableMajor> {
    let conn = state.0.lock().unwrap();
    get_available_majors(&conn)
}

#[tauri::command]
pub fn fetch_favorites(state: State<'_, DbConn>, major_code: Option<String>) -> Vec<Favorite> {
    let conn = state.0.lock().unwrap();
    get_favorites(&conn, major_code.as_deref())
}

#[tauri::command]
pub fn toggle_favorite(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
    major_name: String,
) -> bool {
    let conn = state.0.lock().unwrap();
    if crate::db::is_favorite(&conn, &school_id, &major_code) {
        remove_favorite(&conn, &school_id, &major_code).unwrap();
        false
    } else {
        add_favorite(&conn, &school_id, &major_code, &major_name).unwrap();
        true
    }
}

#[tauri::command]
pub fn fetch_recent_views(state: State<'_, DbConn>, limit: i64) -> Vec<RecentView> {
    let conn = state.0.lock().unwrap();
    get_recent_views(&conn, limit)
}

#[tauri::command]
pub fn add_recent_view_command(
    state: State<'_, DbConn>,
    school_id: String,
    major_code: String,
    major_name: String,
) {
    let conn = state.0.lock().unwrap();
    add_recent_view(&conn, &school_id, &major_code, &major_name).unwrap();
}

#[tauri::command]
pub fn clear_recent_views_command(state: State<'_, DbConn>) {
    let conn = state.0.lock().unwrap();
    clear_recent_views(&conn).unwrap();
}

#[tauri::command]
pub fn sync_workspace_data(major_code: String) -> Result<String, String> {
    let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .ok_or("无法确定仓库根目录")?;

    let python = if cfg!(windows) { "python" } else { "python3" };

    let output = std::process::Command::new(python)
        .arg("-m")
        .arg("yam.scripts.sync_to_tauri")
        .arg("--major-code")
        .arg(&major_code)
        .current_dir(&repo_root)
        .env("PYTHONPATH", &repo_root)
        .output()
        .map_err(|e| format!("启动同步脚本失败: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[derive(Clone, Serialize, Default)]
pub struct CrawlProgress {
    pub running: bool,
    pub major_code: String,
    pub current: i32,
    pub total: i32,
    pub current_name: String,
    pub done: bool,
    pub success: i32,
    pub failed: i32,
    pub skipped: i32,
    pub error: Option<String>,
    /// 子进程 PID，用于取消时 kill
    #[serde(skip)]
    pub child_pid: Option<u32>,
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
    p.running = false;
    p.done = true;
    if p.error.is_none() {
        p.error = Some("用户取消采集任务".to_string());
    }
    Ok(())
}

/// 重置采集状态：用于选择新专业时清空上一次采集结果，避免 CrawlingPage 误判为"后台运行回来"
#[tauri::command]
pub fn reset_crawl(state: State<'_, CrawlState>) -> Result<(), String> {
    let mut p = state.lock().unwrap();
    // 若仍有运行中的子进程，先 kill
    if let Some(pid) = p.child_pid.take() {
        kill_process_tree(pid);
    }
    *p = CrawlProgress::default();
    Ok(())
}

/// 跨平台 kill 进程及其子进程
fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
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

fn run_crawl_task(state: CrawlState, major_code: String) -> Result<(), String> {
    let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .ok_or("无法确定仓库根目录")?;

    let python = if cfg!(windows) { "python" } else { "python3" };

    let mut child = std::process::Command::new(python)
        .arg("-m")
        .arg("yam.cli")
        .arg("fetch")
        .arg("--major")
        .arg(&major_code)
        .arg("--force")
        .current_dir(&repo_root)
        .env("PYTHONPATH", &repo_root)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动采集脚本失败: {}", e))?;

    // 保存子进程 PID，供 cancel_crawl 调用 kill
    {
        let mut p = state.lock().unwrap();
        p.child_pid = Some(child.id());
    }

    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取 stderr")?;

    // 独立读取 stderr，防止缓冲区满导致子进程阻塞
    let stderr_reader = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stderr);
        reader.lines().flatten().collect::<Vec<_>>().join("\n")
    });

    use std::io::{BufRead, BufReader};
    let reader = BufReader::new(stdout);
    let mut last_progress_time = std::time::Instant::now();
    let timeout_secs = 90u64;

    for line in reader.lines().flatten() {
        // 检查是否已被取消
        {
            let p = state.lock().unwrap();
            if !p.running && p.done {
                // 用户已取消，尝试 kill 子进程
                let _ = child.kill();
                break;
            }
        }

        if line.starts_with("YAM_TOTAL ") {
            if let Ok(total) = line[10..].trim().parse::<i32>() {
                let mut p = state.lock().unwrap();
                p.total = total;
                last_progress_time = std::time::Instant::now();
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
                    last_progress_time = std::time::Instant::now();
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
                    last_progress_time = std::time::Instant::now();
                }
            }
        } else if !line.is_empty() {
            // 实时显示 Python 输出到 current_name 字段（附加到日志）
            // 这样用户在采集页能看到子进程输出
            let mut p = state.lock().unwrap();
            // 把非 YAM_* 的行追加到 current_name 后面作为简单日志
            if p.current_name.is_empty() {
                p.current_name = line.chars().take(80).collect();
            }
        }

        // 超时检测：超过 90 秒没有任何进度更新，认为卡住
        if last_progress_time.elapsed().as_secs() > timeout_secs {
            let mut p = state.lock().unwrap();
            p.error = Some(format!(
                "采集超时（{} 秒无进度更新），已自动终止",
                timeout_secs
            ));
            let _ = child.kill();
            break;
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("等待子进程失败: {}", e))?;
    let stderr_output = stderr_reader.join().unwrap_or_default();
    {
        let mut p = state.lock().unwrap();
        // 清除 child_pid，子进程已退出
        p.child_pid = None;
        if !status.success() {
            // 如果用户主动取消（error 已被设置为"用户取消采集任务"），保留该信息
            let already_cancelled = p
                .error
                .as_deref()
                .map(|e| e.contains("用户取消"))
                .unwrap_or(false);
            if !already_cancelled {
                let msg = if stderr_output.is_empty() {
                    "采集脚本异常退出".to_string()
                } else {
                    format!("采集脚本异常退出: {}", stderr_output)
                };
                p.error = Some(msg);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn run_crawl(state: State<'_, CrawlState>, major_code: String) -> Result<(), String> {
    {
        let mut progress = state.lock().unwrap();
        if progress.running {
            return Err("已有采集任务在运行".to_string());
        }
        *progress = CrawlProgress {
            running: true,
            major_code: major_code.clone(),
            current: 0,
            total: 0,
            current_name: String::new(),
            done: false,
            success: 0,
            failed: 0,
            skipped: 0,
            error: None,
            child_pid: None,
        };
    }

    let state_clone = state.inner().clone();
    std::thread::spawn(move || {
        let result = run_crawl_task(state_clone.clone(), major_code);
        let mut p = state_clone.lock().unwrap();
        p.running = false;
        p.done = true;
        if let Err(e) = result {
            p.error = Some(e);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_crawl_progress(state: State<'_, CrawlState>) -> CrawlProgress {
    state.lock().unwrap().clone()
}
