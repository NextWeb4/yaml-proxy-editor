use crate::core::{backup, file_guard};
use crate::error::AppError;
use chrono::Utc;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct BackupEntry {
    pub path: String,
    pub name: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageFile {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageManifest {
    pub exported_at: String,
    pub file_count: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct BackupPackage {
    pub manifest: BackupPackageManifest,
    pub files: Vec<BackupPackageFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageExportResult {
    pub path: String,
    pub file_count: usize,
    pub total_bytes: u64,
}

fn backup_entry_from_path(path: PathBuf) -> Result<BackupEntry, AppError> {
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() {
        return Err(AppError::InvalidPath(path.to_string_lossy().to_string()));
    }

    Ok(BackupEntry {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
        bytes: metadata.len(),
    })
}

fn ensure_json_path(path: &Path) -> Result<(), AppError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some("json") => Ok(()),
        _ => Err(AppError::InvalidPath(path.to_string_lossy().to_string())),
    }
}

fn is_yaml_path(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    matches!(extension.as_deref(), Some("yaml") | Some("yml"))
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupEntry>, AppError> {
    let backup_dir = backup::backup_dir(&app)?;
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(backup_dir)? {
        let item = item?;
        let metadata = item.metadata()?;
        if metadata.is_file() {
            entries.push(backup_entry_from_path(item.path())?);
        }
    }
    entries.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(entries)
}

#[tauri::command]
pub fn create_backup_snapshot(
    app: AppHandle,
    source_path: String,
) -> Result<BackupEntry, AppError> {
    let source_path = PathBuf::from(source_path);
    file_guard::ensure_yaml_path(&source_path)?;
    if !source_path.exists() {
        return Err(AppError::MissingPath(source_path));
    }
    if !fs::metadata(&source_path)?.is_file() {
        return Err(AppError::InvalidPath(
            source_path.to_string_lossy().to_string(),
        ));
    }

    let backup_path = backup::backup_file(&app, &source_path)?;
    backup_entry_from_path(backup_path)
}

#[tauri::command]
pub fn restore_backup(backup_path: String, target_path: String) -> Result<(), AppError> {
    let backup_path = PathBuf::from(backup_path);
    let target_path = PathBuf::from(target_path);
    file_guard::ensure_yaml_path(&backup_path)?;
    file_guard::ensure_yaml_path(&target_path)?;
    if !backup_path.exists() {
        return Err(AppError::MissingPath(backup_path));
    }

    fs::copy(backup_path, target_path)?;
    Ok(())
}

#[tauri::command]
pub fn export_backup_package(
    app: AppHandle,
    output_path: String,
) -> Result<BackupPackageExportResult, AppError> {
    let output_path = PathBuf::from(output_path);
    ensure_json_path(&output_path)?;
    if output_path.exists() && !fs::metadata(&output_path)?.is_file() {
        return Err(AppError::InvalidPath(
            output_path.to_string_lossy().to_string(),
        ));
    }

    let backup_dir = backup::backup_dir(&app)?;
    let mut files = Vec::new();
    let mut total_bytes = 0;

    if backup_dir.exists() {
        for item in fs::read_dir(backup_dir)? {
            let item = item?;
            let path = item.path();
            let metadata = item.metadata()?;
            if !metadata.is_file() || !is_yaml_path(&path) {
                continue;
            }

            let name = path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string());
            let bytes = metadata.len();
            total_bytes += bytes;
            files.push(BackupPackageFile {
                path: format!("backups/{name}"),
                name,
                bytes,
                content: fs::read_to_string(path)?,
            });
        }
    }

    files.sort_by(|a, b| b.name.cmp(&a.name));

    let package = BackupPackage {
        manifest: BackupPackageManifest {
            exported_at: Utc::now().to_rfc3339(),
            file_count: files.len(),
            total_bytes,
        },
        files,
    };
    let json = serde_json::to_string_pretty(&package)?;
    fs::write(&output_path, json)?;

    Ok(BackupPackageExportResult {
        path: output_path.to_string_lossy().to_string(),
        file_count: package.manifest.file_count,
        total_bytes: package.manifest.total_bytes,
    })
}
