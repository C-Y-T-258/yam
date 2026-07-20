use crate::db::{
    add_favorite, add_recent_view, clear_recent_views, get_available_majors, get_favorites,
    get_recent_views, get_score_lines, get_schools, get_workspace_departments,
    get_workspace_filter_options, get_workspace_schools, remove_favorite, AvailableMajor, DbConn,
    Favorite, FilterOptions, RecentView, ScoreLine, School, WorkspaceDepartment, WorkspaceFilterParams,
    WorkspaceSchool,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

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
    sync_workspace_data_inner(&major_code)
}

/// 内部复用函数：调用 Python 脚本 `yam.scripts.sync_to_tauri` 把采集结果同步进 SQLite。
/// 之所以抽出来是因为 `run_crawl_task` 采集成功后也要调用同一个同步逻辑。
fn sync_workspace_data_inner(major_code: &str) -> Result<String, String> {
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
        .arg(major_code)
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

/// `run_crawl_task` 采集成功后 emit 给前端的事件 payload。
/// 前端 App.tsx 监听 `crawl-synced` 事件后调用 addMajor + markMajorAsNew。
#[derive(Serialize, Clone)]
pub struct CrawlSyncedPayload {
    pub major_code: String,
    pub success: bool,
    pub sync_error: Option<String>,
}

pub struct CrawlProgress {
    pub running: AtomicBool,
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
    pub child_pid: Option<u32>,
}

impl Clone for CrawlProgress {
    fn clone(&self) -> Self {
        Self {
            running: AtomicBool::new(self.running.load(Ordering::SeqCst)),
            major_code: self.major_code.clone(),
            current: self.current,
            total: self.total,
            current_name: self.current_name.clone(),
            done: self.done,
            success: self.success,
            failed: self.failed,
            skipped: self.skipped,
            error: self.error.clone(),
            child_pid: self.child_pid,
        }
    }
}

impl Default for CrawlProgress {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            major_code: String::new(),
            current: 0,
            total: 0,
            current_name: String::new(),
            done: false,
            success: 0,
            failed: 0,
            skipped: 0,
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
        let mut state = serializer.serialize_struct("CrawlProgress", 10)?;
        state.serialize_field("running", &self.running.load(Ordering::SeqCst))?;
        state.serialize_field("major_code", &self.major_code)?;
        state.serialize_field("current", &self.current)?;
        state.serialize_field("total", &self.total)?;
        state.serialize_field("current_name", &self.current_name)?;
        state.serialize_field("done", &self.done)?;
        state.serialize_field("success", &self.success)?;
        state.serialize_field("failed", &self.failed)?;
        state.serialize_field("skipped", &self.skipped)?;
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
    p.running.store(false, Ordering::SeqCst);
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

fn run_crawl_task(
    state: CrawlState,
    major_code: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
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
        .env("YAM_DESKTOP", "1")
        .env("PYTHONUNBUFFERED", "1")
        // 强制 Python 使用 UTF-8 输出，避免 Windows 默认 GBK 导致 Rust 端 String::from_utf8_lossy 解码出乱码
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
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
                    process_stdout_line(&line, &state, &mut last_progress_time);
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
                        process_stdout_line(&line, &state, &mut last_progress_time);
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
                let msg = if stderr_output.is_empty() {
                    "采集脚本异常退出".to_string()
                } else {
                    // 过滤 Python traceback 行，仅保留有用的错误信息
                    let filtered = filter_python_stderr(&stderr_output);
                    if filtered.is_empty() {
                        "采集脚本异常退出".to_string()
                    } else {
                        filtered
                    }
                };
                p.error = Some(msg);
            }
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
            match sync_workspace_data_inner(&major_code) {
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
    useful_lines.last().map(|s| s.to_string()).unwrap_or_default()
}

/// 处理 stdout 的一行，更新 state 和 last_progress_time
fn process_stdout_line(line: &str, state: &CrawlState, last_progress_time: &mut std::time::Instant) {
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
        // Python CLI 输出的结构化错误信息，直接设置到 error 字段
        let err_msg = line[10..].trim().to_string();
        let mut p = state.lock().unwrap();
        p.error = Some(err_msg);
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
            running: AtomicBool::new(true),
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
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let result = run_crawl_task(state_clone.clone(), major_code, app_clone);
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

/// 检查本地是否保存了有效的研招网登录 cookie
#[tauri::command]
pub fn check_login_status(app: tauri::AppHandle) -> Result<LoginStatus, String> {
    let cookie_path = app
        .path()
        .resolve(".yam/cookies/yz.chsi.com.cn.json", tauri::path::BaseDirectory::Home)
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
pub fn login_yanzhao(_app: tauri::AppHandle, major_code: String) -> Result<LoginResult, String> {
    let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .ok_or("无法确定仓库根目录")?;

    let python = if cfg!(windows) { "python" } else { "python3" };

    let script = format!(
        r#"import asyncio, json
from yam.crawler.dynamic import DynamicYanZhaoCrawler
crawler = DynamicYanZhaoCrawler("{}", "")
result = asyncio.run(crawler.login_and_fetch())
print("YAM_LOGIN_RESULT " + json.dumps(result, ensure_ascii=False))
"#,
        major_code
    );

    let output = std::process::Command::new(python)
        .arg("-c")
        .arg(&script)
        .current_dir(&repo_root)
        .env("PYTHONPATH", &repo_root)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .output()
        .map_err(|e| format!("启动登录脚本失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Ok(LoginResult {
            success: false,
            school_count: 0,
            error: Some(if stderr.is_empty() {
                "登录窗口异常退出".to_string()
            } else {
                stderr.to_string()
            }),
        });
    }

    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("YAM_LOGIN_RESULT ") {
            match serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                Ok(v) => {
                    let school_count = v
                        .get("school_count")
                        .and_then(|n| n.as_i64())
                        .unwrap_or(0) as i32;
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
    yjxkdm: Option<String>,
    name: Option<String>,
) -> Result<SearchMajorsResult, String> {
    let yjxkdm_val = yjxkdm.unwrap_or_default();
    let name_val = name.unwrap_or_default();

    if yjxkdm_val.is_empty() && name_val.is_empty() {
        return Err("必须指定 yjxkdm 或 name 参数".to_string());
    }

    let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .ok_or("无法确定仓库根目录")?;

    let python = if cfg!(windows) { "python" } else { "python3" };
    let mut cmd = std::process::Command::new(python);
    cmd.arg("-m")
        .arg("yam.cli")
        .arg("search-majors")
        .arg("--json")
        .current_dir(&repo_root)
        .env("PYTHONPATH", &repo_root)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");

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
                    let total_count = v
                        .get("total_count")
                        .and_then(|n| n.as_i64())
                        .unwrap_or(0);
                    let fetched_count = v
                        .get("fetched_count")
                        .and_then(|n| n.as_i64())
                        .unwrap_or(0);
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
//
// 耗时 1-2 小时（219 个一级学科 × 单学科查询），需要前端提供取消按钮。

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
        }
    }
}

impl Serialize for UpdateCatalogProgress {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("UpdateCatalogProgress", 8)?;
        state.serialize_field("running", &self.running.load(Ordering::SeqCst))?;
        state.serialize_field("current", &self.current)?;
        state.serialize_field("total", &self.total)?;
        state.serialize_field("current_yjxkdm", &self.current_yjxkdm)?;
        state.serialize_field("current_yjxkmc", &self.current_yjxkmc)?;
        state.serialize_field("done", &self.done)?;
        state.serialize_field("success_count", &self.success_count)?;
        state.serialize_field("failed_count", &self.failed_count)?;
        state.serialize_field("error", &self.error)?;
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
        if p
            .running
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
    let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .ok_or("无法确定仓库根目录")?;

    let python = if cfg!(windows) { "python" } else { "python3" };

    let mut cmd = std::process::Command::new(python);
    cmd.arg("-m")
        .arg("yam.scripts.update_majors_catalog")
        .current_dir(&repo_root)
        .env("PYTHONPATH", &repo_root)
        .env("YAM_DESKTOP", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if login {
        cmd.arg("--login");
    }

    let mut child = cmd.spawn().map_err(|e| format!("启动目录更新脚本失败: {}", e))?;

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
        // 检查取消
        {
            let p = state.lock().unwrap();
            if !p.running.load(Ordering::SeqCst) && p.done {
                let _ = child.kill();
                break;
            }
        }

        match stdout_reader.read(&mut chunk) {
            Ok(0) => {
                if !line_buf.is_empty() {
                    let line = String::from_utf8_lossy(&line_buf).to_string();
                    process_catalog_stdout_line(&line, &state, &app_handle, &mut last_progress_time);
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
                        process_catalog_stdout_line(&line, &state, &app_handle, &mut last_progress_time);
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
    } else if line.starts_with("YAM_MAJORS_UPDATE_DONE ") {
        // 完成行：解析 JSON 拿 success/failed 统计
        let json_str = line["YAM_MAJORS_UPDATE_DONE ".len()..].trim();
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
            let total = v.get("total_yjxkdm").and_then(|n| n.as_i64()).unwrap_or(0) as i32;
            let success = v.get("success_yjxkdm").and_then(|n| n.as_i64()).unwrap_or(0) as i32;
            let failed_list = v.get("failed").and_then(|f| f.as_array()).map(|a| a.len() as i32).unwrap_or(0);

            let mut p = state.lock().unwrap();
            p.total = total;
            p.success_count = success;
            p.failed_count = failed_list;
            p.current = total;
            *last_progress_time = std::time::Instant::now();
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
pub fn read_majors_catalog() -> Result<Option<String>, String> {
    let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .ok_or("无法确定仓库根目录")?;

    let path = repo_root.join("data").join("majors_realtime.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取 majors_realtime.json 失败: {}", e))?;
    Ok(Some(content))
}
