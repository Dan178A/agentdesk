//! Secretos de la app (v2.2): la API key de ollama.com vive en el
//! Administrador de credenciales de Windows (DPAPI vía crate keyring),
//! NUNCA en archivos planos. Evaluación de seguridad del 2026-11-22:
//! usage.json en claro exponía la clave ante cualquier proceso del usuario.

const SERVICE: &str = "AgentDesk";
const OLLAMA_KEY_USER: &str = "ollama-cloud-api-key";

fn entry() -> keyring::Entry {
    keyring::Entry::new(SERVICE, OLLAMA_KEY_USER).expect("keyring entry")
}

/// Lee la API key guardada; None si nunca se guardó.
pub fn get_ollama_api_key_sync() -> Result<Option<String>, String> {
    match entry().get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("No se pudo leer el credential manager: {e}")),
    }
}

/// Guarda (o borra con cadena vacía) la API key.
pub fn set_ollama_api_key_sync(key: &str) -> Result<(), String> {
    let e = entry();
    if key.trim().is_empty() {
        match e.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("No se pudo borrar la credencial: {err}")),
        }
    } else {
        e.set_password(key.trim())
            .map_err(|err| format!("No se pudo guardar en el credential manager: {err}"))
    }
}

#[tauri::command]
pub fn get_ollama_api_key() -> Result<Option<String>, String> {
    get_ollama_api_key_sync()
}

#[tauri::command]
pub fn set_ollama_api_key(key: String) -> Result<(), String> {
    set_ollama_api_key_sync(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clave_guardada_y_leida_redondea() {
        let k = format!("test-{}-key", std::process::id());
        set_ollama_api_key_sync(&k).unwrap();
        assert_eq!(get_ollama_api_key_sync().unwrap(), Some(k.clone()));
        // borrado → None, y borrar de nuevo (NoEntry) sigue ok
        set_ollama_api_key_sync("").unwrap();
        assert_eq!(get_ollama_api_key_sync().unwrap(), None);
        set_ollama_api_key_sync("").unwrap();
    }

    #[test]
    fn clave_vacia_borra_en_lugar_de_guardar() {
        set_ollama_api_key_sync("tmp").unwrap();
        set_ollama_api_key_sync("  ").unwrap();
        assert_eq!(get_ollama_api_key_sync().unwrap(), None);
    }
}
