use crate::error::AppError;
use std::path::Path;

pub fn ensure_yaml_path(path: &Path) -> Result<(), AppError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some("yaml") | Some("yml") => Ok(()),
        _ => Err(AppError::NotYaml(path.to_path_buf())),
    }
}
