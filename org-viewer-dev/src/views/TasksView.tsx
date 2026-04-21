import { useMemo, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ViewProps } from "../components/ViewProps";
import DocViewer from "../components/DocViewer";
import { OrgDocument } from "../types";
import { AGENT_STYLE, useAgentKaomoji } from "../hooks/useAgentKaomoji";

const STATUS_ORDER = ["active", "blocked", "review", "paused", "backlog", "incubating", "complete"];

const PROJECT_NORMALIZATIONS: Record<string, string> = {
  "stateenforce": "state-enforce",
  "outgoing-world": "outgoing",
};

function extractProject(doc: OrgDocument): string {
  const titleMatch = doc.title.match(/^([A-Za-z][A-Za-z0-9\-\.]+):\s/);
  if (titleMatch) {
    const raw = titleMatch[1].toLowerCase().replace(/\./g, "-");
    return PROJECT_NORMALIZATIONS[raw] ?? raw;
  }
  const projectTags = ["outgoing-world", "outgoing", "state-enforce", "org-viewer", "privacy-docs", "sift", "delectable"];
  for (const tag of doc.tags) {
    const normalized = tag.replace(/^#/, "").toLowerCase();
    if (projectTags.includes(normalized)) return PROJECT_NORMALIZATIONS[normalized] ?? normalized;
  }
  return "other";
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}


const MIN_LIST_W = 200;
const MAX_LIST_W = 720;
const DEFAULT_LIST_W = 380;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TasksView({ docs, theme, orgRoot, selectedDoc, setSelectedDoc, onSpawnClaude, onOpenUrl, activePaths }: ViewProps) {
  const [filter, setFilter] = useState<string>("active");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const hasActive = activePaths != null && activePaths.size > 0;
  const kaomoji = useAgentKaomoji(hasActive);

  const [listWidth, setListWidth] = useState(() => {
    const saved = localStorage.getItem("tasksListWidth");
    return saved ? Number(saved) : DEFAULT_LIST_W;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    localStorage.setItem("tasksListWidth", String(listWidth));
  }, [listWidth]);

  const allTasks = useMemo(() => docs.filter(d => d.type === "task"), [docs]);

  const projects = useMemo(() => {
    const seen = new Set<string>();
    allTasks.forEach(d => seen.add(extractProject(d)));
    const sorted = Array.from(seen).filter(p => p !== "other").sort();
    if (seen.has("other")) sorted.push("other");
    return ["all", ...sorted];
  }, [allTasks]);

  const tasks = useMemo(() =>
    allTasks
      .filter(d => filter === "all" || d.status === filter)
      .filter(d => projectFilter === "all" || extractProject(d) === projectFilter)
      .sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a.status ?? "");
        const bi = STATUS_ORDER.indexOf(b.status ?? "");
        return ai - bi;
      }),
    [allTasks, filter, projectFilter]
  );

  const filters = ["active", "blocked", "paused", "complete", "all"];

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || !orgRoot) return;
    setSaving(true);
    try {
      const slug = slugify(title);
      const sep = orgRoot.includes("\\") ? "\\" : "/";
      const path = `${orgRoot}${sep}tasks${sep}${slug}.md`;
      const content = `---
type: task
status: active
created: ${today()}
completed: null
tags: []
blocked-by: []
---

# ${title}

## What



## Steps

- [ ]

`;
      await invoke("write_file", { path, content });
      setNewTitle("");
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSpawnClaude = (e: React.MouseEvent, doc: OrgDocument) => {
    e.stopPropagation();
    const agentId = typeof doc.frontmatter?.agent === "string" ? doc.frontmatter.agent : undefined;
    onSpawnClaude?.(doc.path, doc.title, undefined, agentId);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: listWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.max(MIN_LIST_W, Math.min(MAX_LIST_W, dragRef.current.startW + ev.clientX - dragRef.current.startX));
      setListWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex h-full">
      <style>{AGENT_STYLE}</style>

      {/* Left: task list */}
      <div
        className="flex flex-col flex-shrink-0 border-r"
        style={{ width: listWidth, borderColor: theme.border, position: "relative" }}
      >
        {/* Filter bar + new button */}
        <div className="flex flex-col gap-0 border-b flex-shrink-0" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-1 p-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div className="flex gap-1 flex-1 flex-wrap">
              {filters.map(f => (
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
            <button
              onClick={() => setCreating(true)}
              className="text-xs px-2 py-0.5 rounded flex-shrink-0"
              style={{ background: theme.accentMuted, color: theme.accent }}
              title="New task"
            >
              + new
            </button>
          </div>
          {projects.length > 2 && (
            <div className="flex gap-1 p-2 flex-wrap">
              {projects.map(p => (
                <button
                  key={p}
                  onClick={() => setProjectFilter(p)}
                  className="px-2 py-0.5 text-xs rounded"
                  style={{
                    background: projectFilter === p ? theme.accentMuted : "transparent",
                    color: projectFilter === p ? theme.accent : theme.textDim,
                    opacity: p === "other" ? 0.6 : 1,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* New task form */}
        {creating && (
          <div className="p-2 border-b flex gap-2" style={{ borderColor: theme.border, background: theme.bgTertiary }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Task title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setCreating(false); setNewTitle(""); }
              }}
              className="flex-1 bg-transparent text-sm outline-none px-2 py-1 rounded border"
              style={{ borderColor: theme.accent, color: theme.text }}
            />
            <button
              onClick={handleCreate}
              disabled={saving || !newTitle.trim()}
              className="text-xs px-2 py-1 rounded flex-shrink-0"
              style={{ background: theme.accent, color: theme.bg, opacity: saving || !newTitle.trim() ? 0.5 : 1 }}
            >
              {saving ? "…" : "create"}
            </button>
            <button
              onClick={() => { setCreating(false); setNewTitle(""); }}
              className="text-xs"
              style={{ color: theme.textDim }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Task list */}
        <div className="overflow-y-auto flex-1">
          {tasks.length === 0 ? (
            <div className="p-6 text-sm" style={{ color: theme.textDim }}>
              No {filter !== "all" ? filter : ""} tasks.
            </div>
          ) : (
            tasks.map(doc => {
              const isSelected = selectedDoc?.path === doc.path;
              const isActive = activePaths?.has(doc.path) ?? false;
              return (
                <button
                  key={doc.path}
                  onClick={() => setSelectedDoc(doc)}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left text-sm border-b"
                  style={{
                    background: isSelected ? theme.accentMuted : "transparent",
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                >
                  {/* Status dot / agent indicator */}
                  <span className="flex-shrink-0 mt-0.5" style={{ position: "relative", width: 8, height: 8 }}>
                    {isActive ? (
                      <>
                        {/* Expanding ring */}
                        <span style={{
                          position: "absolute", inset: 0,
                          borderRadius: "50%",
                          background: theme.accent,
                          animation: "agentRing 1.2s ease-out infinite",
                        }} />
                        {/* Solid pulsing core */}
                        <span style={{
                          position: "absolute", inset: 0,
                          borderRadius: "50%",
                          background: theme.accent,
                          animation: "agentPulse 1.2s ease-in-out infinite",
                        }} />
                      </>
                    ) : (
                      <span style={{
                        position: "absolute", inset: 0,
                        borderRadius: "50%",
                        background: doc.status === "active" ? theme.success
                          : doc.status === "blocked" ? theme.warning
                          : theme.textDim,
                      }} />
                    )}
                  </span>

                  {/* Title + meta */}
                  <span className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                    <span
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: "1.35",
                        fontSize: 13,
                        color: isActive ? theme.accent : theme.text,
                      }}
                    >
                      {doc.title}
                    </span>
                    {doc.created && (
                      <span style={{ fontSize: 10, color: theme.textDim }}>
                        {formatDate(doc.created)}
                      </span>
                    )}
                    {doc.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {doc.tags.slice(0, 4).map(tag => (
                          <span key={tag} style={{
                            fontSize: 9,
                            color: theme.accent,
                            background: theme.accentMuted,
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </span>

                  {/* Right column: status/kaomoji + spawn */}
                  <span className="flex flex-col items-end gap-1 flex-shrink-0">
                    {isActive ? (
                      <span style={{ fontSize: 11, color: theme.accent, lineHeight: 1 }}>
                        {kaomoji}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: theme.textDim }}>{doc.status}</span>
                    )}
                    {onSpawnClaude && !isActive && (
                      <button
                        onClick={e => handleSpawnClaude(e, doc)}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ color: "#7c6af5", background: "rgba(124,106,245,0.15)", fontSize: "10px" }}
                        title="Spawn Claude on this task"
                      >
                        ❯
                      </button>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Drag handle — right edge */}
        <div
          onMouseDown={handleDragStart}
          style={{
            position: "absolute",
            top: 0, right: 0, bottom: 0,
            width: 5,
            cursor: "ew-resize",
            zIndex: 10,
          }}
          title="Drag to resize"
        />
      </div>

      {/* Right: doc viewer */}
      <div className="flex-1 overflow-hidden">
        {selectedDoc ? (
          <DocViewer
            key={selectedDoc.path}
            doc={selectedDoc}
            theme={theme}
            onClose={() => setSelectedDoc(null)}
            onDismiss={async () => {
              const filename = selectedDoc.path.replace(/\\/g, "/").split("/").pop() ?? "task.md";
              const sep = orgRoot.includes("\\") ? "\\" : "/";
              const dest = `${orgRoot}${sep}archive${sep}tasks${sep}${filename}`;
              await invoke("move_file", { src: selectedDoc.path, dst: dest });
              setSelectedDoc(null);
            }}
            onOpenUrl={onOpenUrl}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-sm" style={{ color: theme.textDim }}>
            <span>select a task to view</span>
            {tasks.length > 0 && onSpawnClaude && (
              <span className="text-xs">
                click <span style={{ color: "#7c6af5" }}>❯</span> on any task to spawn a Claude agent
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
