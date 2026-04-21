---
type: knowledge
created: 2026-04-16
updated: 2026-04-17
tags: [todoist, api, rust, tauri, notifications]
---

# Todoist API v1 Migration

REST v2 (`api.todoist.com/rest/v2/`) is gone — returns **410 Gone**. New base URL:

```
https://api.todoist.com/api/v1
```

(Docs at https://developer.todoist.com/api/v1/)

## Key Changes from REST v2

| Thing | v2 | v1 |
|---|---|---|
| Base URL | `api.todoist.com/rest/v2` | `api.todoist.com/api/v1` |
| Task list response | bare `Vec<Task>` | `{ results: [...], next_cursor: ... }` |
| Completed field | `is_completed: bool` | `checked: bool` |
| URL field | `url: String` | removed |
| Due.string | `String` | `Option<String>` |

## Rust Pattern (Tauri)

```rust
const BASE_URL: &str = "https://api.todoist.com/api/v1";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TodoistTask {
    pub id: String,
    pub content: String,
    pub description: String,
    pub priority: u8,
    pub due: Option<TodoistDue>,
    pub labels: Vec<String>,
    pub project_id: String,
    pub checked: bool,  // was is_completed in v2
}

#[derive(Deserialize)]
struct PaginatedTasks {
    results: Vec<TodoistTask>,
}

// List tasks
let resp = client
    .get(format!("{}/tasks", BASE_URL))
    .query(&[("limit", "200")])
    .bearer_auth(&token)
    .send().await?;
let page = resp.json::<PaginatedTasks>().await?;
// page.results is your Vec<TodoistTask>

// Complete a task — endpoint unchanged
client.post(format!("{}/tasks/{}/close", BASE_URL, task_id))
    .bearer_auth(&token).send().await?;
```

The `/tasks/{id}/close` endpoint still exists in v1 (confirmed). Returns 204 No Content.

## Time-Based Tasks (due_datetime)

`TodoistDue` has a `datetime: Option<String>` field (ISO 8601, e.g. `"2026-04-17T15:00:00Z"`) populated only when the task has a specific time. Date-only tasks have `date` but `datetime: null`.

```rust
pub struct TodoistDue {
    pub date: String,
    pub datetime: Option<String>,
    pub string: Option<String>,
}
```

## Creating Tasks with Natural Language Due Date

Pass `due_string` to set due dates (including time). Todoist parses natural language:

```rust
#[derive(Serialize)]
struct CreateTaskBody {
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    due_string: Option<String>,
}

// Examples: "today at 3pm", "tomorrow at 9am", "every monday at 8am"
```

## Time-Based Notification Polling Pattern (Frontend)

Replace file-based reminder loops with a 60s interval that checks `due.datetime`:

```ts
useEffect(() => {
  const notifiedBatch = new Set<string>(); // date-based startup dedup
  const notifiedTime = new Set<string>();  // time-based per-minute dedup

  async function check(isStartup: boolean) {
    const tasks = await invoke<TodoistTask[]>("todoist_get_tasks", { token });
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const minuteKey = now.toISOString().slice(0, 16); // "2026-04-17T15:03"

    if (isStartup) {
      // batch toast: overdue + due today (date-only tasks)
    } else {
      // individual toasts: tasks with datetime <= now, deduped by id+minute
      for (const task of tasks) {
        if (task.checked || !task.due?.datetime) continue;
        if (task.due.datetime > now.toISOString()) continue;
        const key = `${task.id}|${minuteKey}`;
        if (notifiedTime.has(key)) continue;
        notifiedTime.add(key);
        addToast(task.content, `Due: ${...}`);
      }
    }
  }

  check(true);
  const id = setInterval(() => check(false), 60_000);
  return () => clearInterval(id);
}, [addToast]);
```

**Why per-minute key**: prevents re-firing on every poll tick if the task isn't completed yet. Resets each new minute window.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
