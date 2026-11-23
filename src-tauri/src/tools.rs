//! Herramientas del modo agente (v2.7): búsqueda en carpetas y ejecución
//! de comandos. La ejecución de comandos SIEMPRE la autoriza la UI (confirmar
//! en pantalla); Rust no impone whitelist por diseño local, el gate vive en el store.

use std::fs;
use std::path::Path;

const SEARCH_IGNORED_DIRS: [&str; 9] = [
    ".git", "node_modules", "target", "dist", "build", ".next", "__pycache__", ".venv", "vendor",
];
const SEARCH_TEXT_EXTS: [&str; 22] = [
    "txt", "md", "csv", "json", "toml", "yaml", "yml", "html", "htm", "css", "js", "jsx", "ts",
    "tsx", "py", "rs", "go", "sh", "ps1", "xml", "sql", "log",
];
const SEARCH_MAX_MATCHES: usize = 50;
const SEARCH_MAX_FILES: usize = 1000;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub file: String,
    pub line: usize,
    pub content: String,
}

/// grep mínimo recursivo: coincidencias case-insensitive de `query` en archivos de texto.
pub fn search_files_sync(root: &str, query: &str) -> Result<Vec<SearchMatch>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Err("El término de búsqueda está vacío".into());
    }
    let base = Path::new(root);
    if !base.is_dir() {
        return Err(format!("{root} no es una carpeta"));
    }
    let out: std::sync::Mutex<Vec<SearchMatch>> = std::sync::Mutex::new(Vec::new());
    let mut visits = 0usize;
    let mut stack = vec![base.to_path_buf()];
    'outer: while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            if visits >= SEARCH_MAX_FILES || out.lock().map(|o| o.len()).unwrap_or(0) >= SEARCH_MAX_MATCHES {
                break 'outer;
            }
            let Ok(ft) = entry.file_type() else { continue };
            let name = entry.file_name().to_string_lossy().to_string();
            if ft.is_dir() {
                if SEARCH_IGNORED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                    continue;
                }
                visits += 1;
                stack.push(entry.path());
            } else if ft.is_file() {
                if name.starts_with('.') {
                    continue;
                }
                let ext = entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !SEARCH_TEXT_EXTS.contains(&ext.as_str()) {
                    continue;
                }
                visits += 1;
                let Ok(content) = fs::read_to_string(entry.path()) else { continue };
                let rel = entry
                    .path()
                    .strip_prefix(base)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| name.clone());
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&q) {
                        out.lock().map(|mut o| {
                            o.push(SearchMatch {
                                file: rel.clone(),
                                line: i + 1,
                                content: line.chars().take(200).collect(),
                            })
                        }).ok();
                        continue;
                    }
                }
            }
        }
    }
    let mut matches = out.into_inner().unwrap_or_default();
    matches.truncate(SEARCH_MAX_MATCHES);
    Ok(matches)
}

/// Ejecuta un comando de la máquina del usuario. La UI pide confirmación ANTES de llamar esto.
pub fn run_command_sync(cmd: &str) -> Result<String, String> {
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return Err("Comando vacío".into());
    }
    let output = std::process::Command::new("cmd")
        .args(["/C", trimmed])
        .output()
        .map_err(|e| format!("No se pudo ejecutar «{trimmed}»: {e}"))?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    let err = String::from_utf8_lossy(&output.stderr);
    if !err.trim().is_empty() {
        if !text.trim().is_empty() {
            text.push('\n');
        }
        text.push_str(err.trim());
    }
    if text.chars().count() > 8000 {
        text = text.chars().take(8000).collect();
        text.push_str("\n…(salida recortada)");
    }
    Ok(text)
}

#[tauri::command]
pub async fn search_files(path: String, query: String) -> Result<Vec<SearchMatch>, String> {
    search_files_sync(&path, &query)
}

#[tauri::command]
pub async fn run_command(cmd: String) -> Result<String, String> {
    run_command_sync(&cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn busca_coincidencias_con_ruta_relativa() {
        let base = std::env::temp_dir().join(format!("agentdesk-search-{}", std::process::id()));
        fs::create_dir_all(base.join("src")).unwrap();
        fs::write(base.join("src/app.ts"), "const precio = 'KZ-900';\nconst otro = 'x';").unwrap();
        fs::write(base.join("docs.md"), "## Precios\n- KZ-900 cuesta 399 USD").unwrap();
        fs::write(base.join("binario.xyz"), "KZ-900 aqui").unwrap(); // extensión sin soporte: fuera

        let matches = search_files_sync(&base.to_string_lossy(), "kz-900").unwrap();
        assert_eq!(matches.len(), 2);
        assert!(matches.iter().all(|m| m.file.contains("KZ-900") || m.content.to_lowercase().contains("kz-900")));
        assert!(matches.iter().any(|m| m.file == "docs.md" && m.line == 2));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn search_salta_git_y_ignorados() {
        let base = std::env::temp_dir().join(format!("agentdesk-s2-{}", std::process::id()));
        fs::create_dir_all(base.join(".git")).unwrap();
        fs::write(base.join(".git/config"), "token secreto kz").unwrap();
        fs::create_dir_all(base.join("node_modules/x")).unwrap();
        fs::write(base.join("node_modules/x/a.js"), "kz").unwrap();
        let matches = search_files_sync(&base.to_string_lossy(), "kz").unwrap();
        assert!(matches.is_empty());
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn search_rechaza_query_vacia_y_no_carpeta() {
        assert!(search_files_sync("C:/", "   ").is_err());
        assert!(search_files_sync("C:/no-existe-seguro-xyz", "x").is_err());
    }

    #[test]
    fn run_command_ejecuta_y_recorta() {
        let out = run_command_sync("echo agentdesk_ok").unwrap();
        assert!(out.contains("agentdesk_ok"));
        assert!(run_command_sync("").is_err());
    }
}
