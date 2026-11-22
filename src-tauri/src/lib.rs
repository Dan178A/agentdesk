mod ollama;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ollama::list_models])
        .run(tauri::generate_context!())
        .expect("error al correr agentdesk");
}
