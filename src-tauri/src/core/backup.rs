use crate::error::AppError;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn backup_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::TauriPath(error.to_string()))?
        .join("backups");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn backup_file(app: &AppHandle, original: &Path) -> Result<PathBuf, AppError> {
    let filename = original
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidPath(original.to_string_lossy().to_string()))?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let backup_path = backup_dir(app)?.join(format!("{stamp}-{filename}"));

    fs::copy(original, &backup_path)?;
    Ok(backup_path)
}
