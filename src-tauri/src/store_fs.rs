use std::fs;
use tauri::Manager;

fn write_json(app: &tauri::AppHandle, file: &str, data: &str) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(file), data).map_err(|e| e.to_string())
}

fn read_json(app: &tauri::AppHandle, file: &str) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?;
    fs::read_to_string(dir.join(file)).ok()
}

/// Persiste el historial de chats (JSON crudo; el TS serializa).
#[tauri::command]
pub fn history_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "history.json", &data)
}

/// Carga el historial; None si no existe. El contenido corrupto lo sanea el TS.
#[tauri::command]
pub fn history_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "history.json")
}

/// Persiste settings.
#[tauri::command]
pub fn settings_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "settings.json", &data)
}

/// Carga settings; None si no existen.
#[tauri::command]
pub fn settings_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "settings.json")
}

/// Ruta de datos de la app (para mostrarla en settings).
#[tauri::command]
pub fn app_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}
