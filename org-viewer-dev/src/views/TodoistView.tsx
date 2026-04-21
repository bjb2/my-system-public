import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Theme } from "../themes";

interface TodoistTask {
  id: string;
  content: string;
  description: string;
  priority: number;
  due: { date: string; datetime: string | null; string: string | null } | null;
  labels: string[];
  project_id: string;
  /** v1 API uses `checked` instead of `is_completed` */
  checked: boolean;
}

interface Props {
  theme: Theme;
}

export default function TodoistView({ theme }: Props) {
  const [tasks, setTasks] = useState<TodoistTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [filter, setFilter] = useState<"all" | "today" | "overdue">("all");

  const loadToken = useCallback(async () => {
    try {
      const token = await invoke<string | null>("todoist_get_token");
      if (token) { setApiToken(token); setTokenSaved(true); }
    } catch { /* no token yet */ }
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!tokenSaved) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TodoistTask[]>("todoist_get_tasks", { token: apiToken });
      setTasks(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [apiToken, tokenSaved]);

  useEffect(() => { loadToken(); }, [loadToken]);
  useEffect(() => { if (tokenSaved) fetchTasks(); }, [tokenSaved, fetchTasks]);

  const saveToken = async () => {
    await invoke("todoist_save_token", { token: apiToken });
    setTokenSaved(true);
  };

  const completeTask = async (id: string) => {
    await invoke("todoist_complete_task", { token: apiToken, taskId: id });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const createTask = async () => {
    if (!newTaskContent.trim()) return;
    const due_string = newTaskDue.trim() || undefined;
    const task = await invoke<TodoistTask>("todoist_create_task", { token: apiToken, content: newTaskContent, dueString: due_string });
    setTasks(prev => [task, ...prev]);
    setNewTaskContent("");
    setNewTaskDue("");
  };

  const today = new Date().toISOString().slice(0, 10);

  const filtered = tasks.filter(t => {
    if (filter === "today") return t.due?.date === today;
    if (filter === "overdue") return t.due?.date != null && t.due.date < today;
    return true;
  });

  const PRIORITY_COLORS = ["", theme.error, theme.warning, theme.accent, theme.textMuted];

  if (!tokenSaved) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-80 p-6 border rounded" style={{ background: theme.bgSecondary, borderColor: theme.border }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Todoist API Token</h2>
          <p className="text-xs mb-4" style={{ color: theme.textMuted }}>
            Find your token at todoist.com → Settings → Integrations → API token
          </p>
          <input
            type="password"
            value={apiToken}
            onChange={e => setApiToken(e.target.value)}
            placeholder="paste token here..."
            className="w-full bg-transparent text-sm outline-none px-3 py-2 rounded border mb-3"
            style={{ borderColor: theme.border, color: theme.text }}
            onKeyDown={e => { if (e.key === "Enter") saveToken(); }}
          />
          <button
            onClick={saveToken}
            className="w-full py-2 rounded text-sm"
            style={{ background: theme.accent, color: theme.bg }}
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b flex-shrink-0"
        style={{ borderColor: theme.border, background: theme.bgSecondary }}
      >
        <div className="flex gap-1">
          {(["all", "today", "overdue"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-2 py-0.5 text-xs rounded"
              style={{
                background: filter === f ? theme.accentMuted : "transparent",
                color: filter === f ? theme.accent : theme.textDim,
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={newTaskContent}
            onChange={e => setNewTaskContent(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createTask(); }}
            placeholder="quick add task..."
            className="flex-1 bg-transparent text-xs outline-none px-2 py-1 rounded border"
            style={{ borderColor: theme.border, color: theme.text }}
          />
          <input
            type="text"
            value={newTaskDue}
            onChange={e => setNewTaskDue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createTask(); }}
            placeholder="due (e.g. today at 3pm)"
            className="w-40 bg-transparent text-xs outline-none px-2 py-1 rounded border"
            style={{ borderColor: theme.border, color: theme.textDim }}
          />
        </div>
        <button
          onClick={fetchTasks}
          disabled={loading}
          className="text-xs"
          style={{ color: theme.textDim }}
        >
          {loading ? "syncing..." : "↻ sync"}
        </button>
        <button
          onClick={() => setTokenSaved(false)}
          className="text-xs"
          style={{ color: theme.textDim }}
        >
          token
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-2 text-xs" style={{ color: theme.error }}>{error}</div>
        )}
        {filtered.length === 0 && !loading && (
          <div className="h-full flex items-center justify-center text-sm" style={{ color: theme.textDim }}>
            {filter === "today" ? "nothing due today" : filter === "overdue" ? "nothing overdue" : "no tasks"}
          </div>
        )}
        {filtered.map(task => (
          <div
            key={task.id}
            className="flex items-start gap-3 px-4 py-3 border-b"
            style={{ borderColor: theme.border }}
          >
            <button
              onClick={() => completeTask(task.id)}
              className="mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center"
              style={{ borderColor: PRIORITY_COLORS[task.priority] ?? theme.border }}
              title="Complete task"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: theme.text }}>{task.content}</div>
              {task.description && (
                <div className="text-xs mt-0.5 truncate" style={{ color: theme.textMuted }}>{task.description}</div>
              )}
              <div className="flex items-center gap-2 mt-1">
                {task.due && (
                  <span
                    className="text-xs"
                    style={{ color: task.due.date < today ? theme.error : task.due.date === today ? theme.warning : theme.textDim }}
                  >
                    ◷ {task.due.datetime
                      ? new Date(task.due.datetime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : task.due.date}
                  </span>
                )}
                {task.labels.map(l => (
                  <span key={l} className="text-xs px-1.5 rounded" style={{ background: theme.accentMuted, color: theme.accent }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
