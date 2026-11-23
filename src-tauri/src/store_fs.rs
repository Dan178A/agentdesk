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

/// Persiste proyectos (v1.1 RF-15).
#[tauri::command]
pub fn projects_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "projects.json", &data)
}

/// Carga proyectos; None si no existen.
#[tauri::command]
pub fn projects_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "projects.json")
}

/// Persiste equipos de agentes (Task 12).
#[tauri::command]
pub fn teams_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "teams.json", &data)
}

/// Carga equipos; None si no existen.
#[tauri::command]
pub fn teams_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "teams.json")
}

/// Persiste el registro de uso de tokens (v2.1).
#[tauri::command]
pub fn usage_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "usage.json", &data)
}

/// Carga el registro de uso; None si no existe (el TS hidrata tolerante).
#[tauri::command]
pub fn usage_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "usage.json")
}

/// Persiste la configuración de memoria integrada (v2.4): ruta y estado on/off.
#[tauri::command]
pub fn memory_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "memory.json", &data)
}

/// Carga la configuración de memoria; None si no existe.
#[tauri::command]
pub fn memory_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "memory.json")
}

/// Persiste hechos guardados por el sistema (v2.6 memoria inteligente).
#[tauri::command]
pub fn facts_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    write_json(&app, "facts.json", &data)
}

/// Carga hechos guardados; None si no existe.
#[tauri::command]
pub fn facts_load(app: tauri::AppHandle) -> Option<String> {
    read_json(&app, "facts.json")
}

/// Sondea si el servidor agentmemory (github.com/rohitg00/agentmemory) responde en :3111.
#[tauri::command]
pub async fn agentmemory_probe(base: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(format!("{}/", base.trim_end_matches('/')))
        .send()
        .await;
    Ok(matches!(resp, Ok(r) if r.status().as_u16() < 500))
}
