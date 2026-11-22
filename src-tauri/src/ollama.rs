use serde::{Deserialize, Serialize};

/// Modelo crudo de GET /api/tags — el TS aplica aliases y orden.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRaw {
    pub id: String,
    pub name: String,
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_length: Option<u64>,
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagsModel>,
}

#[derive(Deserialize)]
struct TagsModel {
    name: String,
    #[serde(default)]
    capabilities: Vec<String>,
    #[serde(default)]
    details: Option<TagsDetails>,
}

#[derive(Deserialize)]
struct TagsDetails {
    #[serde(default)]
    context_length: Option<u64>,
}

/// Lista los modelos del servidor Ollama. Mensajes de error en español (spec §9).
#[tauri::command]
pub async fn list_models(ollama_url: String) -> Result<Vec<ModelRaw>, String> {
    let url = format!("{}/api/tags", ollama_url.trim_end_matches('/'));
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("No se pudo conectar con Ollama en {}: {}", ollama_url, e))?;
    let tags: TagsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Respuesta inválida de Ollama: {}", e))?;
    Ok(tags
        .models
        .into_iter()
        .map(|m| ModelRaw {
            id: m.name.clone(),
            name: m.name,
            capabilities: m.capabilities,
            context_length: m.details.and_then(|d| d.context_length),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn error_de_red_devuelve_err_en_espanol() {
        let result = list_models("http://127.0.0.1:1".into()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Ollama"));
    }
}
