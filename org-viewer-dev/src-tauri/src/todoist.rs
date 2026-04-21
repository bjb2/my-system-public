use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

const STORE_KEY: &str = "todoist_token";
const STORE_FILE: &str = "org-viewer-store.json";
const BASE_URL: &str = "https://api.todoist.com/api/v1";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TodoistDue {
    pub date: String,
    pub datetime: Option<String>,
    pub string: Option<String>,
}

/// Task shape returned by Todoist API v1 (ItemSyncView).
/// Key changes from REST v2:
/// - `is_completed` renamed to `checked`
/// - `url` field removed
/// - GET /tasks returns a paginated envelope, not a bare array
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TodoistTask {
    pub id: String,
    pub content: String,
    pub description: String,
    pub priority: u8,
    pub due: Option<TodoistDue>,
    pub labels: Vec<String>,
    pub project_id: String,
    /// v1 uses `checked` instead of `is_completed`
    pub checked: bool,
}

/// Paginated response wrapper returned by GET /api/v1/tasks
#[derive(Deserialize)]
struct PaginatedTasks {
    results: Vec<TodoistTask>,
}

#[tauri::command]
pub async fn todoist_get_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(store.get(STORE_KEY).and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
pub async fn todoist_save_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(STORE_KEY, serde_json::Value::String(token));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn todoist_get_tasks(token: String) -> Result<Vec<TodoistTask>, String> {
    let client = reqwest::Client::new();
    // v1 returns { results: [...], next_cursor: ... } — fetch first page (up to 200 tasks)
    let resp = client
        .get(format!("{}/tasks", BASE_URL))
        .query(&[("limit", "200")])
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Todoist API error: {}", resp.status()));
    }
    let page = resp.json::<PaginatedTasks>().await.map_err(|e| e.to_string())?;
    Ok(page.results)
}

#[tauri::command]
pub async fn todoist_complete_task(token: String, task_id: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/tasks/{}/close", BASE_URL, task_id))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Todoist API error: {}", resp.status()));
    }
    Ok(())
}

#[derive(Serialize)]
struct CreateTaskBody {
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    due_string: Option<String>,
}

#[tauri::command]
pub async fn todoist_create_task(token: String, content: String, due_string: Option<String>) -> Result<TodoistTask, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/tasks", BASE_URL))
        .bearer_auth(&token)
        .json(&CreateTaskBody { content, due_string })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Todoist API error: {}", resp.status()));
    }
    resp.json::<TodoistTask>().await.map_err(|e| e.to_string())
}
