mod chat;
mod ollama;
mod skills;
mod store_fs;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ollama::list_models,
            chat::chat_start,
            chat::chat_stop,
            skills::list_skills,
            skills::read_skill,
            store_fs::history_save,
            store_fs::history_load,
            store_fs::settings_save,
            store_fs::settings_load,
            store_fs::app_dir,
            store_fs::projects_save,
            store_fs::projects_load
        ])
        .run(tauri::generate_context!())
        .expect("error al correr agentdesk");
}
