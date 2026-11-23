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
}
