use crate::core::{backup, file_guard};
use crate::error::AppError;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct WriteFileResult {
    pub path: String,
    #[serde(rename = "backupPath")]
    pub backup_path: Option<String>,
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, AppError> {
    let path = PathBuf::from(path);
    file_guard::ensure_yaml_path(&path)?;
    if !path.exists() {
        return Err(AppError::MissingPath(path));
    }

    Ok(fs::read_to_string(path)?)
}

#[tauri::command]
pub fn write_text_file(
    app: AppHandle,
    path: String,
    content: String,
) -> Result<WriteFileResult, AppError> {
    let path = PathBuf::from(path);
    file_guard::ensure_yaml_path(&path)?;

    let backup_path = if path.exists() {
        Some(backup::backup_file(&app, &path)?)
    } else {
        None
    };

    fs::write(&path, content)?;

    Ok(WriteFileResult {
        path: path.to_string_lossy().to_string(),
        backup_path: backup_path.map(|path| path.to_string_lossy().to_string()),
    })
}
