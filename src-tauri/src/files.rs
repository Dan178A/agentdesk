use base64::Engine;
use serde::Deserialize;
use std::fs;
use std::path::Path;

/// Archivo leído para el panel de vista previa o los adjuntos (plan v2.0 Fase 3).
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileRead {
    pub name: String,
    pub extension: String,
    /// Texto para extensiones de texto; data-URI para imágenes.
    pub content: String,
    pub is_binary: bool,
    pub size_bytes: u64,
}

const TEXT_EXTS: [&str; 22] = [
    "txt", "md", "csv", "json", "toml", "yaml", "yml", "html", "htm", "css", "js", "jsx", "ts",
    "tsx", "py", "rs", "go", "sh", "ps1", "xml", "sql", "log",
];
const IMAGE_EXTS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
const MAX_BYTES: u64 = 50 * 1024 * 1024;
// Carpetas ignoradas al subir una carpeta completa (dependencias y basura de build)
const IGNORED_DIRS: [&str; 9] = [
    ".git", "node_modules", "target", "dist", "build", ".next", "__pycache__", ".venv", "vendor",
];
const MAX_DIR_FILES: usize = 1000;
const MAX_DIR_FILE_BYTES: u64 = 512 * 1024;

#[derive(Deserialize)]
pub struct FileWriteInput {
    pub path: String,
    pub content: String,
}

/// Núcleo sync de lectura (testeado directo; el command async es un wrapper).
pub fn read_file_sync(path: &str) -> Result<FileRead, String> {
    let p = Path::new(path);
    let p = p
        .canonicalize()
        .map_err(|e| format!("No existe el archivo {path}: {e}"))?;
    if !p.is_file() {
        return Err(format!("{path} no es un archivo"));
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let meta = fs::metadata(&p).map_err(|e| format!("No se pudo leer {name}: {e}"))?;
    if meta.len() > MAX_BYTES {
        return Err(format!("{name} supera los 50 MB — demasiado grande para el panel"));
    }
    let extension = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if IMAGE_EXTS.contains(&extension.as_str()) {
        let bytes = fs::read(&p).map_err(|e| format!("No se pudo leer {name}: {e}"))?;
        let mime = match extension.as_str() {
            "svg" => "svg+xml",
            "jpg" | "jpeg" => "jpeg",
            "ico" => "x-icon",
            other => other,
        }
        .to_string();
        Ok(FileRead {
            name,
            extension,
            content: format!(
                "data:image/{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ),
            is_binary: true,
            size_bytes: meta.len(),
        })
    } else if TEXT_EXTS.contains(&extension.as_str()) {
        let bytes = fs::read(&p).map_err(|e| format!("No se pudo leer {name}: {e}"))?;
        Ok(FileRead {
            name,
            extension,
            content: String::from_utf8_lossy(&bytes).to_string(),
            is_binary: false,
            size_bytes: meta.len(),
        })
    } else {
        Err(format!(
            "Extensión «{extension}» no soportada todavía (texto, markdown, csv, código, imágenes)"
        ))
    }
}

pub fn write_file_sync(path: &str, content: &str) -> Result<(), String> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    }
    fs::write(p, content).map_err(|e| format!("No se pudo escribir: {e}"))
}

/// Núcleo sync del listado recursivo de una carpeta (v2.3): solo archivos de texto
/// soportados, saltando .git/node_modules/target/…, con nombre de ruta relativa.
pub fn read_dir_files_sync(root: &str) -> Result<Vec<FileRead>, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("{root} no es una carpeta"));
    }
    let mut out: Vec<FileRead> = Vec::new();
    let mut stack: Vec<(std::path::PathBuf, String)> = vec![(root_path.to_path_buf(), String::new())];
    let mut truncated = false;

    while let Some((dir, rel_prefix)) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // carpeta ilegible (permisos): se salta
        };
        for entry in entries.flatten() {
            if out.len() >= MAX_DIR_FILES {
                truncated = true;
                break;
            }
            let Ok(ft) = entry.file_type() else { continue };
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = if rel_prefix.is_empty() {
                name.clone()
            } else {
                format!("{rel_prefix}/{name}")
            };
            if ft.is_dir() {
                if IGNORED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                    continue;
                }
                stack.push((entry.path(), rel));
            } else if ft.is_file() {
                // dotfiles (.env, .npmrc…) no se suben: suelen llevar secretos
                if name.starts_with('.') {
                    continue;
                }
                let ext = entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !TEXT_EXTS.contains(&ext.as_str()) {
                    continue;
                }
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                if meta.len() > MAX_DIR_FILE_BYTES {
                    continue; // archivo demasiado grande para contexto
                }
                if let Ok(bytes) = fs::read(entry.path()) {
                    out.push(FileRead {
                        name: rel,
                        extension: ext,
                        content: String::from_utf8_lossy(&bytes).to_string(),
                        is_binary: false,
                        size_bytes: meta.len(),
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    if truncated {
        return Ok(out); // el TS avisará del recorte con el límite
    }
    Ok(out)
}

#[tauri::command]
pub async fn read_dir_files(path: String) -> Result<Vec<FileRead>, String> {
    read_dir_files_sync(&path)
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<FileRead, String> {
    read_file_sync(&path)
}

#[tauri::command]
pub async fn write_file(input: FileWriteInput) -> Result<String, String> {
    write_file_sync(&input.path, &input.content)?;
    Ok(input.path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imagen_devuelve_data_uri() {
        let tmp = std::env::temp_dir().join("agentdesk-test-px.png");
        let png: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        fs::write(&tmp, png).unwrap();
        let r = read_file_sync(&tmp.to_string_lossy()).unwrap();
        assert!(r.is_binary);
        assert!(r.content.starts_with("data:image/png;base64,"));
        assert_eq!(r.extension, "png");
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn texto_devuelve_contenido_crudo() {
        let tmp = std::env::temp_dir().join("agentdesk-test-note.md");
        fs::write(&tmp, "# Nota\nhola").unwrap();
        let r = read_file_sync(&tmp.to_string_lossy()).unwrap();
        assert!(!r.is_binary);
        assert_eq!(r.content, "# Nota\nhola");
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn extension_no_soportada_da_error() {
        let tmp = std::env::temp_dir().join("agentdesk-test.bin.xyz");
        fs::write(&tmp, b"mz").unwrap();
        assert!(read_file_sync(&tmp.to_string_lossy()).is_err());
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn inexistente_da_error() {
        assert!(read_file_sync("/no-existe-seguro-xyz.zzz").is_err());
    }

    #[test]
    fn write_crea_carpetas_paternas() {
        let dir = std::env::temp_dir().join(format!("agentdesk-test-w{}", std::process::id()));
        let tmp = dir.join("sub").join("out.txt");
        write_file_sync(&tmp.to_string_lossy(), "ok").unwrap();
        assert_eq!(fs::read_to_string(&tmp).unwrap(), "ok");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn carpeta_lista_recursivo_con_rutas_relativas() {
        let base = std::env::temp_dir().join(format!("agentdesk-dir-{}", std::process::id()));
        fs::create_dir_all(base.join("proyecto-a/docs")).unwrap();
        fs::create_dir_all(base.join("proyecto-b")).unwrap();
        fs::write(base.join("MEMORY.md"), "# Memoria\níndice").unwrap();
        fs::write(base.join("proyecto-a/README.md"), "# A").unwrap();
        fs::write(base.join("proyecto-a/docs/notas.txt"), "hola").unwrap();
        fs::write(base.join("proyecto-b/app.py"), "print('hola')").unwrap();
        // basura que debe saltarse
        fs::create_dir_all(base.join(".git")).unwrap();
        fs::write(base.join(".git/config"), "secreto").unwrap();
        fs::create_dir_all(base.join("node_modules/x")).unwrap();
        fs::write(base.join("node_modules/x/index.js"), "void 0").unwrap();
        // binario sin soporte
        fs::write(base.join("img.png"), b"\x89PNG").unwrap();
        // dotfile nunca se sube (privacidad: .env y similares llevan secretos)
        fs::write(base.join(".algo.md"), "oculto").unwrap();
        fs::write(base.join(".env"), "SECRET=1").unwrap();
        fs::write(base.join("env.txt"), "no es dotfile").unwrap();

        let files = read_dir_files_sync(&base.to_string_lossy()).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["MEMORY.md", "env.txt", "proyecto-a/README.md", "proyecto-a/docs/notas.txt", "proyecto-b/app.py"]
        );
        assert!(files[0].content.contains("índice"));
        assert!(!names.iter().any(|n| n.contains(".git") || n.contains("node_modules")));
        assert!(!names.iter().any(|n| n.starts_with('.')));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn carpeta_inexistente_da_error() {
        assert!(read_dir_files_sync("C:/no-existe-seguro-xyz/").is_err());
    }

    #[test]
    fn carpeta_respeta_limite_de_archivos() {
        let base = std::env::temp_dir().join(format!("agentdesk-cap-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        for i in 0..1050 {
            fs::write(base.join(format!("f{i}.txt")), "x").unwrap();
        }
        let files = read_dir_files_sync(&base.to_string_lossy()).unwrap();
        assert!(files.len() >= MAX_DIR_FILES); // recortado al límite
        assert!(files.len() < 1050);
        fs::remove_dir_all(&base).ok();
    }
}
