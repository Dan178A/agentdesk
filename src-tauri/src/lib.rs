mod chat;
mod ollama;
mod skills;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ollama::list_models,
            chat::chat_start,
            chat::chat_stop,
            skills::list_skills,
            skills::read_skill
        ])
        .run(tauri::generate_context!())
        .expect("error al correr agentdesk");
}
