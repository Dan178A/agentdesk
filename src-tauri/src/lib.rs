mod chat;
mod cloud_usage;
mod credentials;
mod files;
mod ollama;
mod skills;
mod store_fs;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ollama::list_models,
            chat::chat_start,
            chat::chat_stop,
            skills::list_skills,
            skills::read_skill,
            files::read_file,
            files::write_file,
            files::read_dir_files,
            cloud_usage::cloud_usage,
            credentials::get_ollama_api_key,
            credentials::set_ollama_api_key,
            store_fs::history_save,
            store_fs::history_load,
            store_fs::settings_save,
            store_fs::settings_load,
            store_fs::app_dir,
            store_fs::projects_save,
            store_fs::projects_load,
            store_fs::teams_save,
            store_fs::teams_load,
            store_fs::usage_save,
            store_fs::usage_load
        ])
        .run(tauri::generate_context!())
        .expect("error al correr agentdesk");
}
