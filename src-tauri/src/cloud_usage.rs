/// Uso en nube de ollama.com (v2.2): GET /api/usage con API key (docs.ollama.com/api/cloud-usage).
const VALID_RANGES: [&str; 3] = ["24h", "7d", "30d"];

pub fn validate_range(range: &str) -> Result<(), String> {
    if VALID_RANGES.contains(&range) {
        Ok(())
    } else {
        Err(format!(
            "range inválido «{range}» — usa 24h, 7d o 30d"
        ))
    }
}

fn base(api_key: &str) -> Result<reqwest::Client, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err(
            "Falta la API key de ollama.com — cópiala de ollama.com › Settings › Keys".into(),
        );
    }
    Ok(reqwest::Client::new())
}

/// Uso por rango (24h/7d/30d). Devuelve el JSON crudo de ollama.com; el TS lo parsea testeable.
#[tauri::command]
pub async fn cloud_usage(api_key: String, range: String) -> Result<String, String> {
    validate_range(&range)?;
    let client = base(&api_key)?;
    let resp = client
        .get(format!(
            "https://ollama.com/api/usage?range={range}&group_by=model"
        ))
        .bearer_auth(api_key.trim())
        .send()
        .await
        .map_err(|e| format!("No se pudo consultar el uso de ollama.com: {e}"))?;
    let status = resp.status();
    if status.as_u16() == 401 {
        return Err("API key inválida o revocada (401)".into());
    }
    if !status.is_success() {
        return Err(format!("ollama.com respondió {status} al consultar el uso"));
    }
    resp.text()
        .await
        .map_err(|e| format!("Respuesta ilegible de ollama.com: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rango_valido_acepta_los_tres() {
        assert!(validate_range("24h").is_ok());
        assert!(validate_range("7d").is_ok());
        assert!(validate_range("30d").is_ok());
    }

    #[test]
    fn rango_invalido_rechaza() {
        assert!(validate_range("").is_err());
        assert!(validate_range("1y").is_err());
        assert!(validate_range("7d; DROP TABLE").is_err());
    }
}
