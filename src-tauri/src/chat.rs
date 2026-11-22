use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Instant;
use tauri::ipc::Channel;

/// Chunk que viaja al frontend por el Channel (spec §5).
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum StreamChunk {
    #[serde(rename = "thinking")]
    Thinking { id: String, delta: String },
    #[serde(rename = "content")]
    Content { id: String, delta: String },
    #[serde(rename = "done")]
    Done { id: String, thinking_ms: u64 },
    #[serde(rename = "error")]
    Error { id: String, message: String },
}

/// Mensaje que llega del frontend.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

/// Buffer de líneas NDJSON (una línea puede llegar partida entre lecturas).
#[derive(Default)]
pub struct LineBuf {
    buf: Vec<u8>,
}

/// Evento de una línea NDJSON completa del stream de Ollama.
#[derive(Debug, PartialEq)]
pub enum LineEvent {
    Thinking { delta: String },
    Content { delta: String },
    Done,
}

/// Parsea bytes del stream NDJSON; emite eventos por línea completa y
/// retiene lo parcial en el buffer (Review Focus 4).
pub fn parse_ndjson(state: &mut LineBuf, bytes: &[u8], out: &mut Vec<LineEvent>) {
    state.buf.extend_from_slice(bytes);
    while let Some(pos) = state.buf.iter().position(|&b| b == b'\n') {
        // línea [0..pos] sin el \n
        let line: Vec<u8> = state.buf.drain(..=pos).collect();
        let line = &line[..line.len() - 1];
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_slice::<serde_json::Value>(line) else {
            continue; // línea inválida: se ignora sin romper el stream
        };
        if let Some(t) = v.pointer("/message/thinking").and_then(|x| x.as_str()) {
            if !t.is_empty() {
                out.push(LineEvent::Thinking { delta: t.to_string() });
            }
        }
        if let Some(c) = v.pointer("/message/content").and_then(|x| x.as_str()) {
            if !c.is_empty() {
                out.push(LineEvent::Content { delta: c.to_string() });
            }
        }
        if v.get("done").and_then(|x| x.as_bool()) == Some(true) {
            out.push(LineEvent::Done);
        }
    }
}

/// Flags de cancelación por generación.
static CANCELS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn register_cancel(id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    CANCELS
        .lock()
        .unwrap()
        .insert(id.to_string(), flag.clone());
    flag
}

fn unregister_cancel(id: &str) {
    CANCELS.lock().unwrap().remove(id);
}

/// Detiene la generación en curso (RF-12).
#[tauri::command]
pub fn chat_stop(id: String) {
    if let Some(flag) = CANCELS.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Inicia una generación con streaming contra /api/chat.
#[tauri::command]
pub async fn chat_start(
    id: String,
    ollama_url: String,
    model: String,
    messages: Vec<ChatMsg>,
    think: bool,
    on_chunk: Channel<StreamChunk>,
) -> Result<(), String> {
    let cancel = register_cancel(&id);
    let started = Instant::now();
    let url = format!("{}/api/chat", ollama_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "think": think,
        "stream": true,
    });

    let result = async {
        use futures_util::StreamExt;

        let resp = reqwest::Client::new()
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("No se pudo conectar con Ollama: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama respondió {}: {}", status, text));
        }

        let mut stream = resp.bytes_stream();
        let mut state = LineBuf::default();
        let mut pending: Vec<StreamChunk> = Vec::new();
        let mut last_flush = Instant::now();
        let mut done_sent = false;

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let bytes = chunk.map_err(|e| format!("Error del stream: {}", e))?;
            let mut events = Vec::new();
            parse_ndjson(&mut state, &bytes, &mut events);
            for ev in events {
                match ev {
                    LineEvent::Thinking { delta } => pending.push(StreamChunk::Thinking {
                        id: id.clone(),
                        delta,
                    }),
                    LineEvent::Content { delta } => pending.push(StreamChunk::Content {
                        id: id.clone(),
                        delta,
                    }),
                    LineEvent::Done => {
                        done_sent = true;
                        break;
                    }
                }
            }
            // Batching: flush cada ~16ms para no saturar el IPC por token
            if last_flush.elapsed() >= std::time::Duration::from_millis(16) || done_sent {
                for c in pending.drain(..) {
                    let _ = on_chunk.send(c);
                }
                last_flush = Instant::now();
            }
            if done_sent {
                break;
            }
        }

        for c in pending.drain(..) {
            let _ = on_chunk.send(c);
        }
        // Un único done: natural, fin de stream sin done, o cancelación
        let _ = on_chunk.send(StreamChunk::Done {
            id: id.clone(),
            thinking_ms: started.elapsed().as_millis() as u64,
        });
        Ok::<(), String>(())
    }
    .await;

    unregister_cancel(&id);
    if let Err(message) = result.clone() {
        let _ = on_chunk.send(StreamChunk::Error {
            id: id.clone(),
            message,
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ndjson_lineas_completas_emiten_eventos() {
        let mut state = LineBuf::default();
        let mut out = Vec::new();
        let input = b"{\"message\":{\"thinking\":\"hola\"},\"done\":false}\n{\"message\":{\"content\":\"4\"},\"done\":false}\n";
        parse_ndjson(&mut state, input, &mut out);
        assert_eq!(
            out,
            vec![
                LineEvent::Thinking {
                    delta: "hola".to_string()
                },
                LineEvent::Content {
                    delta: "4".to_string()
                },
            ]
        );
    }

    #[test]
    fn ndjson_linea_partida_se_retorna_en_el_buffer() {
        let mut state = LineBuf::default();
        let mut out = Vec::new();
        // Primera parte: línea completa + inicio de otra
        parse_ndjson(
            &mut state,
            b"{\"message\":{\"thinking\":\"hola\"},\"done\":false}\n{\"message\":{\"content\":\"4\"},\"done\":fal",
            &mut out,
        );
        assert_eq!(out.len(), 1); // solo la primera línea procesada
        assert_eq!(out[0], LineEvent::Thinking { delta: "hola".to_string() });
        // Segunda parte: el resto de la línea + newline
        parse_ndjson(&mut state, b"se}\n", &mut out);
        assert_eq!(out.len(), 2);
        assert_eq!(out[1], LineEvent::Content { delta: "4".to_string() });
    }

    #[test]
    fn ndjson_done_final_emite_evento_done() {
        let mut state = LineBuf::default();
        let mut out = Vec::new();
        parse_ndjson(
            &mut state,
            b"{\"message\":{\"role\":\"assistant\",\"content\":\"final\"},\"done\":true,\"total_duration\":42}\n",
            &mut out,
        );
        assert_eq!(
            out,
            vec![
                LineEvent::Content {
                    delta: "final".to_string()
                },
                LineEvent::Done,
            ]
        );
    }

    #[test]
    fn ndjson_ignora_lineas_vacias_o_invalidas() {
        let mut state = LineBuf::default();
        let mut out = Vec::new();
        parse_ndjson(&mut state, b"\nno-es-json\n{\"message\":{\"content\":\"ok\"},\"done\":false}\n", &mut out);
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn chat_stop_cancela_el_flag() {
        let id = "test-guard".to_string();
        let flag = register_cancel(&id);
        assert!(!flag.load(Ordering::Relaxed));
        chat_stop(id.clone());
        assert!(flag.load(Ordering::Relaxed));
        unregister_cancel(&id);
    }
}
