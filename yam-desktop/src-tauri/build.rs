use std::path::Path;

fn main() {
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        let backend = Path::new("resources/yam-backend.exe");
        if !backend.exists() {
            if let Some(parent) = backend.parent() {
                std::fs::create_dir_all(parent).expect("create debug resources directory");
            }
            std::fs::write(backend, b"debug-placeholder")
                .expect("create ignored debug backend placeholder");
        }
    }
    tauri_build::build()
}
