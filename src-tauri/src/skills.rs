use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Skill crudo: dir + primeros 8 KiB del SKILL.md (el TS parsea el frontmatter).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRaw {
    pub dir: String,
    pub content: String,
}

/// Skill completo leído por read_skill.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub dir: String,
    pub content: String,
}

/// Valida que dir sea un hijo directo de ~/.claude/skills con SKILL.md.
/// Sin `..`, sin `/`, sin `\\`, sin `:` (spec §5: anti path traversal).
fn valid_dir(home: &Path, dir: &str) -> Result<PathBuf, String> {
    if dir.is_empty() || dir.contains("..") || dir.contains('/') || dir.contains('\\') || dir.contains(':') {
        return Err("Skill no válido".to_string());
    }
    let path = home.join(".claude").join("skills").join(dir).join("SKILL.md");
    if !path.is_file() {
        return Err("Skill no válido".to_string());
    }
    Ok(path)
}

fn read_prefix(path: &Path, max: usize) -> String {
    let Ok(mut file) = fs::File::open(path) else {
        return String::new();
    };
    let mut buf = vec![0u8; max];
    let n = file.read(&mut buf).unwrap_or(0);
    buf.truncate(n);
    String::from_utf8_lossy(&buf).into_owned()
}

/// Escanea ~/.claude/skills/*/SKILL.md y devuelve el prefijo de cada uno.
#[tauri::command]
pub async fn list_skills() -> Vec<SkillRaw> {
    let Some(home) = dirs::home_dir() else {
        return vec![];
    };
    let skills_dir = home.join(".claude").join("skills");
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path().join("SKILL.md");
            if !path.is_file() {
                continue;
            }
            let Some(dir) = entry.file_name().to_str().map(|s| s.to_string()) else {
                continue;
            };
            let content = read_prefix(&path, 8192);
            out.push(SkillRaw { dir, content });
        }
    }
    out
}

/// Lee un SKILL.md completo tras validar la ruta.
#[tauri::command]
pub async fn read_skill(dir: String) -> Result<SkillFile, String> {
    let home = dirs::home_dir().ok_or("No se pudo resolver el directorio home")?;
    let path = valid_dir(&home, &dir)?;
    let content = fs::read_to_string(&path).map_err(|e| format!("No se pudo leer el skill: {}", e))?;
    Ok(SkillFile { dir, content })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_home(tag: &str) -> PathBuf {
        let home = std::env::temp_dir().join(format!("agentdesk-test-{}-{}", std::process::id(), tag));
        let skill = home.join(".claude").join("skills").join("mi-skill");
        fs::create_dir_all(&skill).unwrap();
        fs::write(skill.join("SKILL.md"), "---\nname: mi-skill\n---\ncontenido").unwrap();
        home
    }

    #[test]
    fn valid_dir_ok() {
        let home = setup_home("ok");
        assert!(valid_dir(&home, "mi-skill").is_ok());
    }

    #[test]
    fn valid_dir_rechaza_traversal() {
        let home = setup_home("trav");
        assert!(valid_dir(&home, "../secrets").is_err());
    }

    #[test]
    fn valid_dir_rechaza_absoluto() {
        let home = setup_home("abs");
        assert!(valid_dir(&home, "C:\\x").is_err());
    }

    #[test]
    fn valid_dir_rechaza_subdirectorio() {
        let home = setup_home("sub");
        assert!(valid_dir(&home, "a/b").is_err());
    }

    #[test]
    fn valid_dir_rechaza_vacio() {
        let home = setup_home("empty");
        assert!(valid_dir(&home, "").is_err());
    }

    #[test]
    fn valid_dir_rechaza_inexistente() {
        let home = setup_home("inex");
        assert!(valid_dir(&home, "no-existe-xyz").is_err());
    }
}
