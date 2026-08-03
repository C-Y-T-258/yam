use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const DESKTOP_LOG_FILE: &str = "yam-desktop.log";
const PYTHON_LOG_FILE: &str = "yam-python.log";
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
const ROTATED_LOG_COUNT: usize = 3;

#[derive(Serialize, Clone, Debug)]
pub struct DiagnosticsInfo {
    pub log_directory: String,
    pub desktop_log_path: String,
    pub python_log_path: String,
}

#[derive(Serialize)]
struct LogRecord {
    timestamp_utc: String,
    level: &'static str,
    event: String,
    safe_message: String,
}

struct DiagnosticLogger {
    log_path: PathBuf,
}

impl DiagnosticLogger {
    fn new(log_dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(log_dir)?;
        let logger = Self {
            log_path: log_dir.join(DESKTOP_LOG_FILE),
        };
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&logger.log_path)?;
        Ok(logger)
    }

    fn append_with_limit(
        &self,
        level: &str,
        event: &str,
        message: &str,
        max_bytes: u64,
    ) -> io::Result<()> {
        rotate_if_needed(&self.log_path, max_bytes)?;
        let record = LogRecord {
            timestamp_utc: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            level: normalize_level(level),
            event: normalize_event(event),
            safe_message: sanitize_sensitive(message).replace(['\r', '\n'], " "),
        };
        let encoded = serde_json::to_string(&record).map_err(io::Error::other)?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)?;
        writeln!(file, "{encoded}")
    }

    fn append(&self, level: &str, event: &str, message: &str) -> io::Result<()> {
        self.append_with_limit(level, event, message, MAX_LOG_BYTES)
    }
}

static LOGGER: OnceLock<Mutex<Option<DiagnosticLogger>>> = OnceLock::new();

pub fn default_log_directory() -> PathBuf {
    home_dir_from_env()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".yam")
        .join("logs")
}

pub fn init() {
    let logger = DiagnosticLogger::new(&default_log_directory()).ok();
    let global = LOGGER.get_or_init(|| Mutex::new(None));
    if let Ok(mut current) = global.lock() {
        *current = logger;
    }
    log(
        "INFO",
        "diagnostics_initialized",
        "local diagnostics enabled",
    );
}

pub fn log(level: &str, event: &str, safe_message: &str) {
    let Some(global) = LOGGER.get() else {
        return;
    };
    let Ok(logger) = global.lock() else {
        return;
    };
    if let Some(logger) = logger.as_ref() {
        let _ = logger.append(level, event, safe_message);
    }
}

pub fn info() -> DiagnosticsInfo {
    let log_directory = default_log_directory();
    DiagnosticsInfo {
        desktop_log_path: log_directory
            .join(DESKTOP_LOG_FILE)
            .to_string_lossy()
            .into_owned(),
        python_log_path: log_directory
            .join(PYTHON_LOG_FILE)
            .to_string_lossy()
            .into_owned(),
        log_directory: log_directory.to_string_lossy().into_owned(),
    }
}

pub fn sanitize_sensitive(message: &str) -> String {
    let mut value = message.to_string();
    for header in ["cookie", "authorization"] {
        value = redact_header(&value, header);
    }
    for key in [
        "cookie",
        "authorization",
        "castgc",
        "jsessionid",
        "access_token",
        "refresh_token",
        "token",
        "sessionid",
        "session",
    ] {
        value = redact_key_value(&value, key);
    }
    value
}

pub fn safe_message(message: &str, max_chars: usize) -> String {
    truncate(
        &sanitize_sensitive(message).replace(['\r', '\n'], " "),
        max_chars,
    )
}

fn rotate_if_needed(log_path: &Path, max_bytes: u64) -> io::Result<()> {
    if !log_path.exists() || fs::metadata(log_path)?.len() <= max_bytes {
        return Ok(());
    }

    let oldest = rotated_path(log_path, ROTATED_LOG_COUNT);
    if oldest.exists() {
        fs::remove_file(oldest)?;
    }
    for index in (1..ROTATED_LOG_COUNT).rev() {
        let source = rotated_path(log_path, index);
        if source.exists() {
            fs::rename(source, rotated_path(log_path, index + 1))?;
        }
    }
    fs::rename(log_path, rotated_path(log_path, 1))
}

fn rotated_path(log_path: &Path, index: usize) -> PathBuf {
    PathBuf::from(format!("{}.{}", log_path.to_string_lossy(), index))
}

fn home_dir_from_env() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn normalize_level(value: &str) -> &'static str {
    match value {
        "TRACE" => "TRACE",
        "DEBUG" => "DEBUG",
        "WARN" => "WARN",
        "ERROR" => "ERROR",
        _ => "INFO",
    }
}

fn normalize_event(value: &str) -> String {
    let normalized = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
        .take(64)
        .collect::<String>();
    if normalized.is_empty() {
        "app".to_string()
    } else {
        normalized
    }
}

fn redact_header(input: &str, name: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for segment in input.split_inclusive('\n') {
        let lower = segment.to_ascii_lowercase();
        if let Some(index) = lower.find(name) {
            let after_name = index + name.len();
            let separator = segment.as_bytes().get(after_name).copied();
            if separator == Some(b':') {
                output.push_str(&segment[..after_name + 1]);
                output.push_str(" [REDACTED]");
                if segment.ends_with('\n') {
                    output.push('\n');
                }
                continue;
            }
        }
        output.push_str(segment);
    }
    output
}

fn redact_key_value(input: &str, key: &str) -> String {
    let lower = input.to_ascii_lowercase();
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0;

    while cursor < input.len() {
        let Some(relative) = lower[cursor..].find(key) else {
            break;
        };
        let start = cursor + relative;
        let boundary_before = start == 0 || !is_key_char(bytes[start - 1]);
        let after_key = start + key.len();
        let boundary_after = after_key == bytes.len() || !is_key_char(bytes[after_key]);
        if !boundary_before || !boundary_after {
            output.push_str(&input[cursor..after_key]);
            cursor = after_key;
            continue;
        }

        let mut separator = after_key;
        while separator < bytes.len() && bytes[separator].is_ascii_whitespace() {
            separator += 1;
        }
        if separator >= bytes.len() || !matches!(bytes[separator], b'=' | b':') {
            output.push_str(&input[cursor..after_key]);
            cursor = after_key;
            continue;
        }

        let mut value_start = separator + 1;
        while value_start < bytes.len() && bytes[value_start].is_ascii_whitespace() {
            value_start += 1;
        }
        let quote = bytes
            .get(value_start)
            .copied()
            .filter(|byte| matches!(byte, b'\'' | b'"'));
        if quote.is_some() {
            value_start += 1;
        }
        let mut value_end = value_start;
        while value_end < bytes.len() {
            let byte = bytes[value_end];
            if quote.map(|value| value == byte).unwrap_or_else(|| {
                matches!(byte, b';' | b'&' | b',' | b'\r' | b'\n' | b' ' | b'\t')
            }) {
                break;
            }
            value_end += 1;
        }

        output.push_str(&input[cursor..value_start]);
        output.push_str("[REDACTED]");
        cursor = value_end;
    }
    output.push_str(&input[cursor..]);
    output
}

fn is_key_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn truncate(message: &str, max_chars: usize) -> String {
    let mut chars = message.chars();
    let value = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{value}...")
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sanitize_removes_cookie_header_and_token_values() {
        let input = "Cookie: CASTGC=cookie-secret; JSESSIONID=session-secret\nAuthorization: Bearer auth-secret\ntoken=token-secret access_token: \"access-secret\"";
        let sanitized = sanitize_sensitive(input);

        for secret in [
            "cookie-secret",
            "session-secret",
            "auth-secret",
            "token-secret",
            "access-secret",
        ] {
            assert!(!sanitized.contains(secret));
        }
        assert!(sanitized.contains("Cookie: [REDACTED]"));
        assert!(sanitized.contains("token=[REDACTED]"));
    }

    #[test]
    fn append_writes_sanitized_utc_record() {
        let dir = tempdir().unwrap();
        let logger = DiagnosticLogger::new(dir.path()).unwrap();
        logger
            .append("ERROR", "test_event", "token=do-not-write")
            .unwrap();

        let content = fs::read_to_string(dir.path().join(DESKTOP_LOG_FILE)).unwrap();
        assert!(content.contains("\"event\":\"test_event\""));
        assert!(content.contains("\"level\":\"ERROR\""));
        assert!(content.contains("[REDACTED]"));
        assert!(!content.contains("do-not-write"));
        assert!(content.contains('Z'));
    }

    #[test]
    fn append_rotates_to_three_fixed_backups() {
        let dir = tempdir().unwrap();
        let logger = DiagnosticLogger::new(dir.path()).unwrap();
        let current = dir.path().join(DESKTOP_LOG_FILE);

        for marker in 1..=4 {
            fs::write(&current, format!("oversized-{marker}").repeat(4)).unwrap();
            logger
                .append_with_limit("INFO", "rotate_test", "next", 8)
                .unwrap();
        }

        assert!(current.exists());
        for index in 1..=ROTATED_LOG_COUNT {
            assert!(rotated_path(&current, index).exists());
        }
        assert!(!rotated_path(&current, ROTATED_LOG_COUNT + 1).exists());
    }
}
