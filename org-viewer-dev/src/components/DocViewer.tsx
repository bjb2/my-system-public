import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { OrgDocument } from "../types";
import { Theme } from "../themes";

interface Props {
  doc: OrgDocument;
  theme: Theme;
  onClose: () => void;
  onApprove?: (notes: string) => void;
  onDismiss?: () => void;
  onOpenUrl?: (url: string) => void;
}

function splitFrontmatter(raw: string): { prefix: string; body: string } {
  if (!raw.startsWith("---")) return { prefix: "", body: raw };
  const rest = raw.slice(3);
  const end = rest.indexOf("\n---");
  if (end === -1) return { prefix: "", body: raw };
  return {
    prefix: "---" + rest.slice(0, end) + "\n---\n",
    body: rest.slice(end + 4).replace(/^\n+/, ""),
  };
}

const SAVE_DEBOUNCE_MS = 1500;
const TASK_STATUSES = ["active", "blocked", "review", "paused", "backlog", "incubating", "complete"];

export default function DocViewer({ doc, theme, onClose, onApprove, onDismiss, onOpenUrl }: Props) {
  const isTask = doc.type === "task";
  const [taskStatus, setTaskStatus] = useState(doc.status ?? "active");
  const [notes, setNotes] = useState("");
  const [approved, setApproved] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefixRef = useRef("");

  // Load raw file content so we can round-trip the frontmatter.
  // cancelled flag prevents calling setContent on a disposed editor if the component
  // unmounts (e.g. view switch) before the async read resolves.
  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_file", { path: doc.path }).then(raw => {
      if (cancelled) return;
      const { prefix: fm, body } = splitFrontmatter(raw);
      prefixRef.current = fm;
      editor?.commands.setContent(body);
      setSaveState("saved");
    }).catch(() => {
      if (cancelled) return;
      prefixRef.current = "";
      editor?.commands.setContent(doc.content);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.path]);

  const doSave = useCallback(async (markdown: string) => {
    setSaveState("saving");
    try {
      await invoke("write_file", {
        path: doc.path,
        content: prefixRef.current ? prefixRef.current + "\n" + markdown : markdown,
      });
      setSaveState("saved");
    } catch {
      setSaveState("unsaved");
    }
  }, [doc.path]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    setTaskStatus(newStatus);
    try {
      const raw = await invoke<string>("read_file", { path: doc.path });
      let updated = raw.replace(/^status: .+$/m, `status: ${newStatus}`);
      const todayStr = new Date().toISOString().split("T")[0];
      if (newStatus === "complete") {
        updated = updated.replace(/^completed: .+$/m, `completed: ${todayStr}`);
      } else {
        updated = updated.replace(/^completed: .+$/m, "completed: null");
      }
      await invoke("write_file", { path: doc.path, content: updated });
    } catch {
      setTaskStatus(doc.status ?? "active");
    }
  }, [doc.path, doc.status]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: "code-block" } } }),
      Markdown.configure({ html: false, transformCopiedText: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
    ],
    content: doc.content,
    editorProps: {
      attributes: { class: "wysiwyg-editor", spellcheck: "false" },
    },
    onUpdate: ({ editor }) => {
      setSaveState("unsaved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const md = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor.storage as any).markdown.getMarkdown();
        doSave(md);
      }, SAVE_DEBOUNCE_MS);
    },
  });

  // Ctrl+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        if (editor) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          doSave(// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor.storage as any).markdown.getMarkdown());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor, doSave]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const saveColor = saveState === "saved" ? theme.textDim
    : saveState === "saving" ? theme.warning
    : theme.error;

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b text-sm flex-shrink-0"
        style={{ background: theme.bgTertiary, borderColor: theme.border }}
      >
        <span className="font-semibold truncate" style={{ color: theme.text }}>{doc.title}</span>
        <div className="flex items-center gap-3 flex-shrink-0">
          {isTask ? (
            <select
              value={taskStatus}
              onChange={e => handleStatusChange(e.target.value)}
              className="text-xs px-1.5 py-0.5 rounded outline-none cursor-pointer"
              style={{ background: theme.accentMuted, color: theme.accent, border: "none" }}
            >
              {TASK_STATUSES.map(s => (
                <option key={s} value={s} style={{ background: theme.bgTertiary, color: theme.text }}>{s}</option>
              ))}
            </select>
          ) : doc.status ? (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: theme.accentMuted, color: theme.accent }}>
              {doc.status}
            </span>
          ) : null}
          <span className="text-xs" style={{ color: saveColor }}>
            {saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "unsaved"}
          </span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: theme.bgTertiary, color: theme.textDim, border: `1px solid ${theme.border}` }}
              title="Archive this item — moves to archive/research/"
            >
              Archive
            </button>
          )}
          <button onClick={onClose} className="text-xs" style={{ color: theme.textDim }}>✕</button>
        </div>
      </div>

      {/* Editor */}
      <div
        className="flex-1 overflow-y-auto"
        onClick={e => {
          if (!onOpenUrl) return;
          const link = (e.target as HTMLElement).closest("a");
          if (!link) return;
          const href = link.getAttribute("href");
          if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
            e.preventDefault();
            onOpenUrl(href);
          }
        }}
      >
        <style>{`
          .wysiwyg-editor {
            outline: none;
            min-height: 100%;
            padding: 1.25rem 1.5rem;
            color: ${theme.text};
            font-size: 0.875rem;
            line-height: 1.7;
            caret-color: ${theme.accent};
          }
          .wysiwyg-editor h1 {
            font-size: 1.4em; font-weight: 700; margin: 1em 0 0.4em;
            color: ${theme.accent}; border-bottom: 1px solid ${theme.border}; padding-bottom: 0.2em;
          }
          .wysiwyg-editor h2 {
            font-size: 1.15em; font-weight: 600; margin: 0.9em 0 0.3em;
            color: ${theme.text};
          }
          .wysiwyg-editor h3 {
            font-size: 1em; font-weight: 600; margin: 0.8em 0 0.25em;
            color: ${theme.textMuted};
          }
          .wysiwyg-editor p { margin: 0.4em 0; }
          .wysiwyg-editor strong { color: ${theme.text}; font-weight: 700; }
          .wysiwyg-editor em { color: ${theme.textMuted}; }
          .wysiwyg-editor a { color: ${theme.accent}; text-decoration: underline; }
          .wysiwyg-editor code {
            background: ${theme.bgTertiary}; color: ${theme.accent};
            padding: 0.1em 0.35em; border-radius: 3px;
            font-family: 'Cascadia Code', Consolas, monospace; font-size: 0.85em;
          }
          .wysiwyg-editor pre {
            background: ${theme.bgTertiary}; border: 1px solid ${theme.border};
            padding: 0.85rem 1rem; border-radius: 4px; overflow-x: auto; margin: 0.6em 0;
          }
          .wysiwyg-editor pre code {
            background: none; padding: 0; color: ${theme.text}; font-size: 0.8em;
          }
          .wysiwyg-editor blockquote {
            border-left: 3px solid ${theme.accent}; padding-left: 1em;
            color: ${theme.textMuted}; margin: 0.5em 0;
          }
          .wysiwyg-editor ul, .wysiwyg-editor ol {
            padding-left: 1.5em; margin: 0.4em 0;
          }
          .wysiwyg-editor li { margin: 0.15em 0; }
          .wysiwyg-editor ul[data-type="taskList"] { list-style: none; padding-left: 0.25em; }
          .wysiwyg-editor ul[data-type="taskList"] li {
            display: flex; align-items: flex-start; gap: 0.5em;
          }
          .wysiwyg-editor ul[data-type="taskList"] li label { margin-top: 0.15em; }
          .wysiwyg-editor ul[data-type="taskList"] li input[type="checkbox"] {
            accent-color: ${theme.accent}; cursor: pointer;
          }
          .wysiwyg-editor hr {
            border: none; border-top: 1px solid ${theme.border}; margin: 1em 0;
          }
          .wysiwyg-editor .is-empty::before {
            content: 'Start writing…'; color: ${theme.textDim};
            pointer-events: none; position: absolute;
          }
        `}</style>
        <EditorContent editor={editor} />
      </div>

      {/* Approval panel — shown for inbox/decision docs */}
      {onApprove && (
        <div
          className="flex flex-col gap-2 px-4 py-3 border-t flex-shrink-0"
          style={{ borderColor: theme.border, background: theme.bgSecondary }}
        >
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Answer open questions or add context for the agent… (optional)"
            rows={3}
            className="w-full resize-none rounded px-2 py-1.5 text-xs outline-none"
            style={{
              background: theme.bgTertiary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          />
          <div className="flex justify-end">
            <button
              onClick={() => { if (approved) return; setApproved(true); onApprove(notes); }}
              disabled={approved}
              className="text-xs px-3 py-1 rounded font-medium"
              style={{ background: approved ? theme.bgTertiary : theme.accent, color: approved ? theme.textDim : theme.bg, cursor: approved ? "not-allowed" : "pointer" }}
            >
              {approved ? "Spawned ✓" : "Approve ❯"}
            </button>
          </div>
        </div>
      )}

      {/* Tags footer */}
      {doc.tags.length > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-t flex-shrink-0 flex-wrap"
          style={{ borderColor: theme.border, background: theme.bgSecondary }}
        >
          {doc.tags.map(t => (
            <span key={t} className="text-xs px-2 py-0.5 rounded" style={{ background: theme.accentMuted, color: theme.accent }}>
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
