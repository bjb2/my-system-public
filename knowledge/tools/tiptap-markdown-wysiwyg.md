---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [react, tiptap, wysiwyg, markdown, tauri]
---

# TipTap WYSIWYG Markdown Editor in React

## Packages

```
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit tiptap-markdown
npm install @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-link
```

## Minimal setup

```tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

const editor = useEditor({
  extensions: [
    StarterKit,
    Markdown.configure({ html: false, transformCopiedText: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ],
  content: markdownString,  // tiptap-markdown parses this automatically
  onUpdate: ({ editor }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = (editor.storage as any).markdown.getMarkdown();
    save(md);
  },
});

<EditorContent editor={editor} />
```

`editor.storage.markdown` is untyped — cast to `any` to access `.getMarkdown()`.

## Frontmatter round-trip (critical)

Scanned doc content is frontmatter-stripped. If you save `doc.content` directly you silently destroy the frontmatter. Always read the raw file first, split, and reconstruct on save:

```tsx
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

// On mount:
const raw = await invoke<string>("read_file", { path: doc.path });
const { prefix, body } = splitFrontmatter(raw);
editor.commands.setContent(body); // load body into TipTap

// On save:
await invoke("write_file", { path: doc.path, content: prefix + "\n" + markdown });
```

## Auto-save pattern

```tsx
const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

onUpdate: ({ editor }) => {
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => save(getMarkdown(editor)), 1500);
};

// Ctrl+S immediate save
useEffect(() => {
  const h = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") { e.preventDefault(); save(getMarkdown(editor)); }
  };
  window.addEventListener("keydown", h);
  return () => window.removeEventListener("keydown", h);
}, [editor]);
```

## Related

- [[tauri-dev-setup]]
- [[tiptap-docx-export-pattern]] — exporting content from the editor to DOCX
