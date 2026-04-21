import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ViewProps } from "../components/ViewProps";
import { Theme } from "../themes";
import AssetBuilderView from "./AssetBuilderView";

const STATUSES = ["active", "planned", "paused", "draft", "retired"];

interface AssetMeta {
  filename: string;
  adName: string;
  campaign: string;
  adSet: string;
  format: string;
  status: string;
  spend: string;
  cpl: string;
  notes: string;
}

interface AssetCopy {
  primaryTexts: string[];  // 5 slots
  headlines: string[];     // 5 slots
  description: string;
  notes: string;
  created: string;
}

interface AssetFile {
  path: string;
  name: string;
  platform: string;
  project: string;
  isImage: boolean;
  isVideo: boolean;
  meta?: AssetMeta;
}

interface FileEntry {
  path: string;
  name: string;
  size: number;
  extension: string;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "webm", "mkv"]);

const STATUS_COLORS: Record<string, string> = {
  active:  "#4af076",
  planned: "#7a9afa",
  paused:  "#f0c44a",
  draft:   "#8888aa",
  retired: "#666688",
};

function sidecarPath(assetPath: string): string {
  const norm = assetPath.replace(/\\/g, "/");
  const lastDot = norm.lastIndexOf(".");
  const base = lastDot >= 0 ? norm.slice(0, lastDot) : norm;
  return base + ".copy.md";
}

function parseIndexTable(content: string): Map<string, AssetMeta> {
  const map = new Map<string, AssetMeta>();
  const lines = content.split("\n");
  let headerCols: string[] | null = null;

  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length === 0) continue;
    if (cells.every(c => /^[-:]+$/.test(c))) continue;

    if (!headerCols) {
      headerCols = cells.map(c => c.toLowerCase());
      continue;
    }

    const get = (key: string) => {
      const idx = headerCols!.findIndex(h => h.includes(key));
      return idx >= 0 ? (cells[idx] ?? "").replace(/\*/g, "") : "";
    };

    const filename = get("filename") || get("file");
    if (!filename || filename === "(empty)") continue;

    map.set(filename, {
      filename,
      adName: get("ad name") || get("ad_name"),
      campaign: get("campaign"),
      adSet: get("ad set") || get("adset"),
      format: get("format"),
      status: get("status"),
      spend: get("spend"),
      cpl: get("cpl"),
      notes: get("notes"),
    });
  }

  return map;
}

function upsertIndexRow(content: string, meta: AssetMeta): string {
  const HEADER = "| Filename | Ad Name | Campaign | Ad Set | Format | Status | Spend | CPL | Notes |";
  const SEP = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
  const row = `| ${meta.filename} | ${meta.adName} | ${meta.campaign} | ${meta.adSet} | ${meta.format} | ${meta.status} | ${meta.spend} | ${meta.cpl} | ${meta.notes} |`;

  const lines = content.split("\n");
  let headerIdx = -1;
  let sepIdx = -1;
  let existingIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("|") && trimmed.toLowerCase().includes("filename")) headerIdx = i;
    if (headerIdx >= 0 && sepIdx < 0 && trimmed.match(/^\|[-| :]+\|$/)) sepIdx = i;
    if (sepIdx >= 0 && trimmed.startsWith("|")) {
      const cells = trimmed.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells[0] === meta.filename) { existingIdx = i; break; }
    }
  }

  if (existingIdx >= 0) {
    lines[existingIdx] = row;
    return lines.join("\n");
  }

  if (headerIdx >= 0 && sepIdx >= 0) {
    lines.splice(sepIdx + 1, 0, row);
    return lines.join("\n");
  }

  return content.trimEnd() + `\n\n${HEADER}\n${SEP}\n${row}\n`;
}

function parseCopySidecar(content: string): AssetCopy {
  const today = new Date().toISOString().slice(0, 10);
  let created = today;

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    created = fmMatch[1].match(/^created:\s*(.*)$/m)?.[1]?.trim() ?? today;
  }

  const body = fmMatch ? content.slice(fmMatch[0].length) : content;

  const parseNumberedList = (sectionBody: string): string[] => {
    const items: string[] = ["", "", "", "", ""];
    for (const line of sectionBody.split("\n")) {
      const m = line.match(/^(\d+)\.\s*(.*)/);
      if (m) {
        const idx = parseInt(m[1]) - 1;
        if (idx >= 0 && idx < 5) items[idx] = m[2].trim();
      }
    }
    return items;
  };

  const getSection = (heading: string): string => {
    const re = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
    return body.match(re)?.[1] ?? "";
  };

  return {
    primaryTexts: parseNumberedList(getSection("Primary Texts")),
    headlines: parseNumberedList(getSection("Headlines")),
    description: getSection("Description").trim(),
    notes: getSection("Notes").replace(/<!--[\s\S]*?-->/g, "").trim(),
    created,
  };
}

function buildCopySidecar(assetName: string, platform: string, copy: AssetCopy): string {
  const today = new Date().toISOString().slice(0, 10);
  const texts = copy.primaryTexts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const heads = copy.headlines.map((h, i) => `${i + 1}. ${h}`).join("\n");

  return `---
type: asset-copy
asset: ${assetName}
platform: ${platform}
created: ${copy.created || today}
updated: ${today}
---

## Primary Texts

${texts}

## Headlines

${heads}

## Description

${copy.description}

## Notes

${copy.notes}
`.trimEnd() + "\n";
}

function openInExplorer(path: string) {
  invoke("open_external_url", { url: path.replace(/\//g, "\\") });
}

function ThumbImage({ path, theme, version }: { path: string; theme: Theme; version?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(false);
    invoke<string>("read_file_base64", { path })
      .then(b64 => {
        if (cancelled) return;
        const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
        const mime =
          ext === "png" ? "image/png" :
          ext === "gif" ? "image/gif" :
          ext === "webp" ? "image/webp" :
          ext === "svg" ? "image/svg+xml" : "image/jpeg";
        setSrc(`data:${mime};base64,${b64}`);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [path, version]);

  if (error) return (
    <div className="flex items-center justify-center w-full h-full" style={{ color: theme.textDim }}>⚠</div>
  );
  if (!src) return (
    <div className="flex items-center justify-center w-full h-full text-xs" style={{ color: theme.textDim }}>...</div>
  );
  return <img src={src} alt="" className="w-full h-full object-cover" />;
}

function MetaRow({ label, value, theme }: { label: string; value: React.ReactNode; theme: Theme }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: theme.textDim, width: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ color: theme.text, flex: 1, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

interface EditFormProps {
  meta: AssetMeta;
  onChange: (m: AssetMeta) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  theme: Theme;
}

function EditForm({ meta, onChange, onSave, onCancel, saving, theme }: EditFormProps) {
  const inputStyle = {
    background: theme.bgTertiary, color: theme.text, border: `1px solid ${theme.border}`,
    borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit",
  };

  const field = (label: string, key: keyof AssetMeta, multiline?: boolean) => (
    <div className="flex flex-col gap-0.5">
      <label style={{ color: theme.textDim, fontSize: 10 }}>{label}</label>
      {multiline ? (
        <textarea
          rows={2}
          value={meta[key]}
          onChange={e => onChange({ ...meta, [key]: e.target.value })}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      ) : (
        <input
          type="text"
          value={meta[key]}
          onChange={e => onChange({ ...meta, [key]: e.target.value })}
          style={inputStyle}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <label style={{ color: theme.textDim, fontSize: 10 }}>status</label>
        <div className="flex gap-1 flex-wrap">
          {["", ...STATUSES].map(s => (
            <button
              key={s || "none"}
              onClick={() => onChange({ ...meta, status: s })}
              className="px-2 py-0.5 rounded text-xs"
              style={{
                background: meta.status === s ? theme.accentMuted : theme.bgTertiary,
                color: meta.status === s
                  ? (s ? STATUS_COLORS[s] ?? theme.accent : theme.accent)
                  : theme.textMuted,
                border: `1px solid ${meta.status === s ? theme.accent + "44" : theme.border}`,
              }}
            >
              {s || "none"}
            </button>
          ))}
        </div>
      </div>
      {field("ad name", "adName")}
      {field("campaign", "campaign")}
      {field("ad set", "adSet")}
      {field("format", "format")}
      <div className="flex gap-2">
        <div className="flex flex-col gap-0.5 flex-1">
          <label style={{ color: theme.textDim, fontSize: 10 }}>spend ($)</label>
          <input
            type="text"
            placeholder="e.g. 142.50"
            value={meta.spend}
            onChange={e => onChange({ ...meta, spend: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-0.5 flex-1">
          <label style={{ color: theme.textDim, fontSize: 10 }}>CPL ($)</label>
          <input
            type="text"
            placeholder="e.g. 8.20"
            value={meta.cpl}
            onChange={e => onChange({ ...meta, cpl: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
      {field("notes", "notes", true)}
      <div className="flex gap-2 mt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-1.5 text-xs rounded"
          style={{ background: theme.accent, color: theme.bg, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 text-xs rounded"
          style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface CopyEditFormProps {
  copy: AssetCopy;
  onChange: (c: AssetCopy) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  theme: Theme;
}

function CopyEditForm({ copy, onChange, onSave, onCancel, saving, theme }: CopyEditFormProps) {
  const inputStyle: React.CSSProperties = {
    background: theme.bgTertiary, color: theme.text, border: `1px solid ${theme.border}`,
    borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit",
    width: "100%", boxSizing: "border-box",
  };

  const updateText = (idx: number, val: string) => {
    const next = [...copy.primaryTexts];
    next[idx] = val;
    onChange({ ...copy, primaryTexts: next });
  };

  const updateHeadline = (idx: number, val: string) => {
    const next = [...copy.headlines];
    next[idx] = val;
    onChange({ ...copy, headlines: next });
  };

  return (
    <div className="flex flex-col gap-2">
      <div style={{ color: theme.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Primary Texts
      </div>
      {copy.primaryTexts.map((t, i) => (
        <div key={i} className="flex items-start gap-1">
          <span style={{ color: theme.textDim, fontSize: 11, marginTop: 4, flexShrink: 0, width: 12 }}>{i + 1}.</span>
          <textarea
            rows={2}
            value={t}
            onChange={e => updateText(i, e.target.value)}
            placeholder={`Primary text ${i + 1}`}
            style={{ ...inputStyle, resize: "vertical", flex: 1 }}
          />
        </div>
      ))}

      <div style={{ color: theme.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
        Headlines
      </div>
      {copy.headlines.map((h, i) => (
        <div key={i} className="flex items-center gap-1">
          <span style={{ color: theme.textDim, fontSize: 11, flexShrink: 0, width: 12 }}>{i + 1}.</span>
          <input
            type="text"
            value={h}
            onChange={e => updateHeadline(i, e.target.value)}
            placeholder={`Headline ${i + 1}`}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      ))}

      <div className="flex flex-col gap-0.5 mt-2">
        <label style={{ color: theme.textDim, fontSize: 10 }}>description</label>
        <input
          type="text"
          value={copy.description}
          onChange={e => onChange({ ...copy, description: e.target.value })}
          style={inputStyle}
        />
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-1.5 text-xs rounded"
          style={{ background: theme.accent, color: theme.bg, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "saving…" : "Save copy"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 text-xs rounded"
          style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AssetsView({ docs, theme }: ViewProps) {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetFile | null>(null);
  const [projectFilter, setProjectFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dropFeedback, setDropFeedback] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editMeta, setEditMeta] = useState<AssetMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [dupName, setDupName] = useState("");
  const [editingCopy, setEditingCopy] = useState(false);
  const [copySidecar, setCopySidecar] = useState<AssetCopy | null>(null);
  const [editCopy, setEditCopy] = useState<AssetCopy | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [canvasSidecarJson, setCanvasSidecarJson] = useState<string | null>(null);
  const [builderInitialCanvas, setBuilderInitialCanvas] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const assetsDirsRef = useRef<Map<string, string>>(new Map());

  const assetIndexDocs = useMemo(() =>
    docs.filter(d => d.path.replace(/\\/g, "/").includes("/assets/index.md")),
    [docs]
  );

  useEffect(() => {
    if (assetIndexDocs.length === 0) {
      setLoading(false);
      setAssets([]);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      const allFiles: AssetFile[] = [];
      const dirs = new Map<string, string>();

      for (const indexDoc of assetIndexDocs) {
        const normPath = indexDoc.path.replace(/\\/g, "/");
        const assetsDir = normPath.replace("/index.md", "");
        const projectMatch = normPath.match(/projects\/([^/]+)\/assets/);
        const project = projectMatch ? projectMatch[1] : "unknown";
        dirs.set(project, assetsDir);
        const meta = parseIndexTable(indexDoc.content);

        try {
          const files = await invoke<FileEntry[]>("list_code_files", { dir: assetsDir });
          for (const f of files) {
            const ext = f.extension.toLowerCase();
            if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue;
            const normFilePath = f.path.replace(/\\/g, "/");
            const platformMatch = normFilePath.match(/assets\/([^/]+)\/[^/]+$/);
            const platform = platformMatch ? platformMatch[1] : "root";
            allFiles.push({
              path: f.path,
              name: f.name,
              platform,
              project,
              isImage: IMAGE_EXTS.has(ext),
              isVideo: VIDEO_EXTS.has(ext),
              meta: meta.get(f.name),
            });
          }
        } catch { /* assets dir empty or not accessible */ }
      }

      if (!cancelled) {
        assetsDirsRef.current = dirs;
        setAssets(allFiles);
        setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [assetIndexDocs, refreshKey]);

  // Load sidecars when asset is selected
  useEffect(() => {
    if (!selectedAsset) { setCopySidecar(null); setCanvasSidecarJson(null); return; }
    let cancelled = false;
    setCopyLoading(true);
    setCopySidecar(null);
    setCanvasSidecarJson(null);
    invoke<string>("read_file", { path: sidecarPath(selectedAsset.path) })
      .then(content => { if (!cancelled) setCopySidecar(parseCopySidecar(content)); })
      .catch(() => { /* no copy sidecar yet */ })
      .finally(() => { if (!cancelled) setCopyLoading(false); });
    invoke<string>("read_file", { path: selectedAsset.path.replace(/\\/g, "/") + ".canvas.json" })
      .then(content => { if (!cancelled) setCanvasSidecarJson(content); })
      .catch(() => { /* no canvas sidecar yet */ });
    return () => { cancelled = true; };
  }, [selectedAsset?.path]);

  const projects = useMemo(() =>
    ["all", ...Array.from(new Set(assets.map(a => a.project))).sort()],
    [assets]
  );

  const platforms = useMemo(() => {
    const base = projectFilter === "all" ? assets : assets.filter(a => a.project === projectFilter);
    return ["all", ...Array.from(new Set(base.map(a => a.platform))).sort()];
  }, [assets, projectFilter]);

  const filtered = useMemo(() => assets.filter(a => {
    if (projectFilter !== "all" && a.project !== projectFilter) return false;
    if (platformFilter !== "all" && a.platform !== platformFilter) return false;
    if (statusFilter !== "all") {
      const s = a.meta?.status?.toLowerCase() ?? "";
      if (s !== statusFilter) return false;
    }
    return true;
  }), [assets, projectFilter, platformFilter, statusFilter]);

  const statuses = ["all", "active", "planned", "paused", "draft", "retired"];

  const resolveDropDir = useCallback((): string | null => {
    const dirs = assetsDirsRef.current;
    if (dirs.size === 0) return null;
    let baseDir: string | null = null;
    if (projectFilter !== "all" && dirs.has(projectFilter)) {
      baseDir = dirs.get(projectFilter)!;
    } else {
      baseDir = dirs.values().next().value ?? null;
    }
    if (!baseDir) return null;
    if (platformFilter !== "all") return `${baseDir}/${platformFilter}`;
    return baseDir;
  }, [projectFilter, platformFilter]);

  const currentAssetsDir = useCallback((): string | null => {
    return resolveDropDir();
  }, [resolveDropDir]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);

    const destDir = resolveDropDir();
    if (!destDir) {
      setDropFeedback("No assets folder found. Create a projects/*/assets/index.md first.");
      setTimeout(() => setDropFeedback(null), 4000);
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const mediaFiles = files.filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
    });

    if (mediaFiles.length === 0) {
      setDropFeedback("No image or video files detected.");
      setTimeout(() => setDropFeedback(null), 3000);
      return;
    }

    let copied = 0;
    const errors: string[] = [];
    for (const file of mediaFiles) {
      const dst = `${destDir}/${file.name}`;
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.substring(dataUrl.indexOf(",") + 1));
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        await invoke("write_file_bytes", { path: dst, b64 });
        copied++;
      } catch (err) {
        errors.push(`${file.name}: ${err}`);
      }
    }

    if (copied > 0) {
      setRefreshKey(k => k + 1);
      setDropFeedback(errors.length > 0
        ? `Copied ${copied}, ${errors.length} failed.`
        : `Copied ${copied} file${copied !== 1 ? "s" : ""} to ${destDir.split("/").slice(-2).join("/")}`);
    } else {
      setDropFeedback(errors[0] ?? "Copy failed.");
    }
    setTimeout(() => setDropFeedback(null), 4000);
  }, [resolveDropDir]);

  useEffect(() => {
    setEditing(false); setEditMeta(null);
    setDuplicating(false); setDupName("");
    setEditingCopy(false); setEditCopy(null);
  }, [selectedAsset?.path]);

  const openEdit = useCallback((asset: AssetFile) => {
    setEditMeta(asset.meta ?? {
      filename: asset.name,
      adName: "",
      campaign: "",
      adSet: "",
      format: "",
      status: "",
      spend: "",
      cpl: "",
      notes: "",
    });
    setEditing(true);
    setDuplicating(false);
    setEditingCopy(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!selectedAsset || !editMeta) return;
    setSaving(true);
    try {
      const assetsDir = assetsDirsRef.current.get(selectedAsset.project);
      if (!assetsDir) throw new Error("No assets dir for project");
      const indexPath = `${assetsDir}/index.md`;
      let existing = "";
      try { existing = await invoke<string>("read_file", { path: indexPath }); } catch { /* new file */ }
      const updated = upsertIndexRow(existing, { ...editMeta, filename: selectedAsset.name });
      await invoke("write_file", { path: indexPath, content: updated });
      setEditing(false);
      setRefreshKey(k => k + 1);
    } catch (err) {
      setDropFeedback(`Save failed: ${err}`);
      setTimeout(() => setDropFeedback(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [selectedAsset, editMeta]);

  const openEditCopy = useCallback(() => {
    const empty: AssetCopy = {
      primaryTexts: ["", "", "", "", ""],
      headlines: ["", "", "", "", ""],
      description: "",
      notes: "",
      created: new Date().toISOString().slice(0, 10),
    };
    setEditCopy(copySidecar ? { ...copySidecar } : empty);
    setEditingCopy(true);
    setEditing(false);
    setDuplicating(false);
  }, [copySidecar]);

  const saveCopy = useCallback(async () => {
    if (!selectedAsset || !editCopy) return;
    setSaving(true);
    try {
      const sp = sidecarPath(selectedAsset.path);
      const content = buildCopySidecar(selectedAsset.name, selectedAsset.platform, editCopy);
      await invoke("write_file", { path: sp, content });
      setCopySidecar(editCopy);
      setEditingCopy(false);
      setEditCopy(null);
    } catch (err) {
      setDropFeedback(`Save failed: ${err}`);
      setTimeout(() => setDropFeedback(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [selectedAsset, editCopy]);

  const startDuplicate = useCallback((asset: AssetFile) => {
    const dot = asset.name.lastIndexOf(".");
    const base = dot >= 0 ? asset.name.slice(0, dot) : asset.name;
    const ext = dot >= 0 ? asset.name.slice(dot) : "";
    const vMatch = base.match(/^(.*?)(-v(\d+))?$/);
    const stem = vMatch?.[1] ?? base;
    const existingVs = assets
      .filter(a => a.project === asset.project)
      .map(a => {
        const m = a.name.replace(/\.[^.]+$/, "").match(new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-v(\\d+)$`));
        return m ? parseInt(m[1]) : null;
      })
      .filter((v): v is number => v !== null);
    const nextV = existingVs.length > 0 ? Math.max(...existingVs) + 1 : 2;
    setDupName(`${stem}-v${nextV}${ext}`);
    setDuplicating(true);
    setEditing(false);
    setEditingCopy(false);
  }, [assets]);

  const confirmDuplicate = useCallback(async () => {
    if (!selectedAsset || !dupName.trim()) return;
    setSaving(true);
    try {
      const assetsDir = assetsDirsRef.current.get(selectedAsset.project);
      if (!assetsDir) throw new Error("No assets dir");
      const srcDir = selectedAsset.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
      const dst = `${srcDir}/${dupName.trim()}`;
      await invoke("copy_file", { src: selectedAsset.path, dst });

      // pre-populate index row for the duplicate as draft
      const indexPath = `${assetsDir}/index.md`;
      let existing = "";
      try { existing = await invoke<string>("read_file", { path: indexPath }); } catch { /* */ }
      const srcMeta = selectedAsset.meta;
      const dupMeta: AssetMeta = {
        filename: dupName.trim(),
        adName: srcMeta?.adName ? `${srcMeta.adName} (variation)` : "",
        campaign: srcMeta?.campaign ?? "",
        adSet: srcMeta?.adSet ?? "",
        format: srcMeta?.format ?? "",
        status: "draft",
        spend: "",
        cpl: "",
        notes: srcMeta?.notes ?? "",
      };
      const updated = upsertIndexRow(existing, dupMeta);
      await invoke("write_file", { path: indexPath, content: updated });

      // Clone copy sidecar if it exists
      if (copySidecar) {
        const dupStem = dupName.trim().replace(/\.[^.]+$/, "");
        const dupSidecarPath = `${srcDir}/${dupStem}.copy.md`;
        const dupCopy: AssetCopy = {
          ...copySidecar,
          created: new Date().toISOString().slice(0, 10),
        };
        const sidecarContent = buildCopySidecar(dupName.trim(), selectedAsset.platform, dupCopy);
        await invoke("write_file", { path: dupSidecarPath, content: sidecarContent });
      }

      // Clone canvas sidecar if it exists
      if (canvasSidecarJson) {
        const srcCanvasPath = selectedAsset.path.replace(/\\/g, "/") + ".canvas.json";
        const dstCanvasPath = `${srcDir}/${dupName.trim()}.canvas.json`;
        await invoke("copy_file", { src: srcCanvasPath, dst: dstCanvasPath });
      }

      setDuplicating(false);
      setRefreshKey(k => k + 1);
      const extras = [copySidecar && "copy", canvasSidecarJson && "canvas"].filter(Boolean).join(" + ");
      setDropFeedback(`Duplicated → ${dupName.trim()}${extras ? ` (+ ${extras})` : ""}`);
      setTimeout(() => setDropFeedback(null), 3000);
    } catch (err) {
      setDropFeedback(`Duplicate failed: ${err}`);
      setTimeout(() => setDropFeedback(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [selectedAsset, dupName, copySidecar]);

  const textCount = copySidecar ? copySidecar.primaryTexts.filter(t => t).length : 0;
  const headCount = copySidecar ? copySidecar.headlines.filter(h => h).length : 0;

  if (building && currentAssetsDir()) {
    return (
      <div className="flex h-full" style={{ position: "relative" }}>
        <AssetBuilderView
          theme={theme}
          project={projectFilter !== "all" ? projectFilter : (assets[0]?.project ?? "unknown")}
          assetsDir={currentAssetsDir()!}
          initialCanvasJson={builderInitialCanvas ?? undefined}
          initialFilename={builderInitialCanvas && selectedAsset ? selectedAsset.name : undefined}
          onClose={() => { setBuilding(false); setBuilderInitialCanvas(null); }}
          onSaved={() => { setBuilding(false); setBuilderInitialCanvas(null); setRefreshKey(k => k + 1); }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-full"
      style={{ position: "relative" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0 flex-wrap"
          style={{ borderColor: theme.border, background: theme.bgSecondary }}
        >
          {projects.length > 2 && (
            <div className="flex gap-1">
              {projects.map(p => (
                <button
                  key={p}
                  onClick={() => { setProjectFilter(p); setPlatformFilter("all"); }}
                  className="px-2 py-0.5 text-xs rounded"
                  style={{
                    background: projectFilter === p ? theme.accentMuted : "transparent",
                    color: projectFilter === p ? theme.accent : theme.textMuted,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            {platforms.map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className="px-2 py-0.5 text-xs rounded"
                style={{
                  background: platformFilter === p ? theme.accentMuted : "transparent",
                  color: platformFilter === p ? theme.accent : theme.textMuted,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {statuses.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-2 py-0.5 text-xs rounded"
                style={{
                  background: statusFilter === s ? theme.accentMuted : "transparent",
                  color: statusFilter === s
                    ? (s === "all" ? theme.accent : STATUS_COLORS[s] ?? theme.accent)
                    : theme.textMuted,
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {currentAssetsDir() && (
              <button
                onClick={() => setBuilding(true)}
                className="px-2 py-0.5 text-xs rounded flex items-center gap-1"
                style={{
                  background: theme.accentMuted,
                  color: theme.accent,
                  border: `1px solid ${theme.accent}44`,
                }}
              >
                + New Asset
              </button>
            )}
            {currentAssetsDir() && (
              <button
                onClick={() => openInExplorer(currentAssetsDir()!)}
                className="px-2 py-0.5 text-xs rounded flex items-center gap-1"
                title="Open assets folder in Explorer"
                style={{
                  background: theme.bgTertiary,
                  color: theme.textMuted,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <span>📁</span> Open folder
              </button>
            )}
            <span className="text-xs" style={{ color: theme.textDim }}>
              {loading ? "scanning..." : `${filtered.length} asset${filtered.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm" style={{ color: theme.textMuted }}>
              scanning assets...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div style={{ color: theme.textDim, fontSize: 36 }}>⊟</div>
              <div className="text-sm text-center" style={{ color: theme.textMuted }}>
                {assets.length === 0
                  ? "No assets found.\nAdd images or videos to projects/*/assets/platform/"
                  : "No assets match the current filters."}
              </div>
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
            >
              {filtered.map(asset => {
                const active = selectedAsset?.path === asset.path;
                const displayName = asset.meta?.adName || asset.name;
                const showFilename = !!asset.meta?.adName;
                return (
                  <button
                    key={asset.path}
                    onClick={() => setSelectedAsset(asset)}
                    onDoubleClick={async () => {
                      setSelectedAsset(asset);
                      try {
                        const json = await invoke<string>("read_file", { path: asset.path.replace(/\\/g, "/") + ".canvas.json" });
                        setBuilderInitialCanvas(json);
                      } catch {
                        setBuilderInitialCanvas(null);
                      }
                      setBuilding(true);
                    }}
                    className="rounded overflow-hidden text-left transition-all"
                    style={{
                      border: `1px solid ${active ? theme.accent : theme.border}`,
                      background: theme.bgSecondary,
                      outline: active ? `1px solid ${theme.accentMuted}` : "none",
                    }}
                  >
                    <div style={{ height: 100, background: theme.bgTertiary, overflow: "hidden", position: "relative" }}>
                      {asset.isImage ? (
                        <ThumbImage path={asset.path} theme={theme} version={refreshKey} />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-1" style={{ color: theme.textDim }}>
                          <span style={{ fontSize: 28 }}>▶</span>
                          <span style={{ fontSize: 10 }}>{asset.path.split(".").pop()?.toUpperCase()}</span>
                        </div>
                      )}
                      {asset.meta?.status && (
                        <div
                          title={asset.meta.status}
                          style={{
                            position: "absolute", top: 4, right: 4,
                            width: 8, height: 8, borderRadius: "50%",
                            background: STATUS_COLORS[asset.meta.status.toLowerCase()] ?? theme.textDim,
                            border: `1px solid ${theme.bg}`,
                          }}
                        />
                      )}
                      {asset.meta?.cpl && (
                        <div
                          style={{
                            position: "absolute", bottom: 4, left: 4,
                            background: "rgba(0,0,0,0.65)",
                            color: "#4af076",
                            fontSize: 10,
                            padding: "1px 5px",
                            borderRadius: 3,
                            fontWeight: 600,
                          }}
                        >
                          ${asset.meta.cpl}
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-xs font-medium truncate" style={{ color: theme.text }} title={displayName}>
                        {displayName}
                      </div>
                      <div className="text-xs truncate" style={{ color: theme.textDim }}>
                        {showFilename ? asset.name : (asset.meta?.format || asset.platform)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedAsset && (
        <div
          className="flex flex-col border-l flex-shrink-0"
          style={{ width: 280, borderColor: theme.border, background: theme.bgSecondary }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: theme.border }}>
            <div className="flex flex-col min-w-0 flex-1 mr-2">
              <span
                className="text-sm font-semibold leading-tight"
                style={{ color: theme.text }}
                title={selectedAsset.meta?.adName || selectedAsset.name}
              >
                {selectedAsset.meta?.adName || selectedAsset.name}
              </span>
              {selectedAsset.meta?.adName && (
                <span
                  className="text-xs truncate mt-0.5"
                  style={{ color: theme.textDim }}
                  title={selectedAsset.name}
                >
                  {selectedAsset.name}
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedAsset(null)}
              style={{ color: theme.textMuted, fontSize: 18, lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </div>

          {/* Preview */}
          <div style={{ height: 160, background: theme.bgTertiary, flexShrink: 0, overflow: "hidden" }}>
            {selectedAsset.isImage ? (
              <ThumbImage path={selectedAsset.path} theme={theme} version={refreshKey} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: theme.textDim }}>
                <span style={{ fontSize: 40 }}>▶</span>
                <span style={{ fontSize: 11 }}>Video file</span>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-3 flex flex-col gap-2 text-xs">
            {editing && editMeta ? (
              <EditForm
                meta={editMeta}
                onChange={setEditMeta}
                onSave={saveEdit}
                onCancel={() => setEditing(false)}
                saving={saving}
                theme={theme}
              />
            ) : editingCopy && editCopy ? (
              <CopyEditForm
                copy={editCopy}
                onChange={setEditCopy}
                onSave={saveCopy}
                onCancel={() => { setEditingCopy(false); setEditCopy(null); }}
                saving={saving}
                theme={theme}
              />
            ) : duplicating ? (
              <div className="flex flex-col gap-2">
                <div style={{ color: theme.textDim, fontSize: 11 }}>Duplicate as draft for iteration:</div>
                <input
                  type="text"
                  value={dupName}
                  onChange={e => setDupName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmDuplicate(); if (e.key === "Escape") setDuplicating(false); }}
                  autoFocus
                  style={{
                    background: theme.bgTertiary, color: theme.text,
                    border: `1px solid ${theme.accent}`,
                    borderRadius: 4, padding: "4px 8px", fontSize: 11,
                    fontFamily: "monospace",
                  }}
                />
                {copySidecar && (
                  <div style={{ color: theme.textDim, fontSize: 10 }}>Sidecar will be cloned too.</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={confirmDuplicate}
                    disabled={saving}
                    className="flex-1 py-1.5 text-xs rounded"
                    style={{ background: theme.accent, color: theme.bg, opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? "copying…" : "Duplicate"}
                  </button>
                  <button
                    onClick={() => setDuplicating(false)}
                    className="flex-1 py-1.5 text-xs rounded"
                    style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Spend / CPL */}
                {(selectedAsset.meta?.spend || selectedAsset.meta?.cpl) && (
                  <div
                    className="flex gap-3 rounded p-2 mb-1"
                    style={{ background: theme.bgTertiary, border: `1px solid ${theme.border}` }}
                  >
                    {selectedAsset.meta?.spend && (
                      <div className="flex flex-col items-center flex-1">
                        <span style={{ color: theme.textDim, fontSize: 10 }}>spend</span>
                        <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
                          ${selectedAsset.meta.spend}
                        </span>
                      </div>
                    )}
                    {selectedAsset.meta?.cpl && (
                      <div className="flex flex-col items-center flex-1">
                        <span style={{ color: theme.textDim, fontSize: 10 }}>CPL</span>
                        <span style={{ color: "#4af076", fontSize: 14, fontWeight: 600 }}>
                          ${selectedAsset.meta.cpl}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <MetaRow label="project" value={selectedAsset.project} theme={theme} />
                <MetaRow label="platform" value={selectedAsset.platform} theme={theme} />
                {selectedAsset.meta ? (
                  <>
                    {selectedAsset.meta.status && (
                      <MetaRow
                        label="status"
                        theme={theme}
                        value={
                          <span style={{ color: STATUS_COLORS[selectedAsset.meta.status.toLowerCase()] ?? theme.text }}>
                            {selectedAsset.meta.status}
                          </span>
                        }
                      />
                    )}
                    {selectedAsset.meta.format && <MetaRow label="format" value={selectedAsset.meta.format} theme={theme} />}
                    {selectedAsset.meta.campaign && <MetaRow label="campaign" value={selectedAsset.meta.campaign} theme={theme} />}
                    {selectedAsset.meta.adSet && <MetaRow label="ad set" value={selectedAsset.meta.adSet} theme={theme} />}
                    {selectedAsset.meta.notes && <MetaRow label="notes" value={selectedAsset.meta.notes} theme={theme} />}
                  </>
                ) : (
                  <div style={{ color: theme.textDim }}>No metadata. Click Edit to add.</div>
                )}

                {/* Copy section */}
                <div
                  className="flex flex-col gap-1 pt-2 mt-1"
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ color: theme.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Copy
                    </span>
                    {copyLoading && <span style={{ color: theme.textDim, fontSize: 10 }}>loading…</span>}
                    {!copyLoading && copySidecar && (
                      <span style={{ color: theme.textDim, fontSize: 10 }}>
                        {textCount}/5 texts · {headCount}/5 headlines
                      </span>
                    )}
                  </div>
                  {!copyLoading && copySidecar && textCount > 0 && (
                    <div style={{ color: theme.text, fontSize: 11, lineHeight: 1.4, opacity: 0.85 }}>
                      {copySidecar.primaryTexts[0]}
                    </div>
                  )}
                  {!copyLoading && !copySidecar && (
                    <div style={{ color: theme.textDim, fontSize: 11 }}>No sidecar yet — click Edit copy to add.</div>
                  )}
                </div>

                <div
                  className="mt-1 pt-2 text-xs flex items-center gap-1 cursor-pointer"
                  style={{ borderTop: `1px solid ${theme.border}`, color: theme.textDim, wordBreak: "break-all" }}
                  title="Click to open in Explorer"
                  onClick={() => {
                    const dir = selectedAsset.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
                    openInExplorer(dir);
                  }}
                >
                  <span>📂</span>
                  <span style={{ flex: 1 }}>{selectedAsset.path}</span>
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          {!editing && !duplicating && !editingCopy && (
            <div className="flex-shrink-0 px-3 pb-3 flex flex-col gap-2">
              {canvasSidecarJson && (
                <button
                  onClick={() => {
                    setBuilderInitialCanvas(canvasSidecarJson);
                    setBuilding(true);
                  }}
                  className="w-full py-1.5 text-xs rounded"
                  style={{ background: theme.accent, color: theme.bg }}
                >
                  Edit in Builder
                </button>
              )}
              <button
                onClick={() => openEdit(selectedAsset)}
                className="w-full py-1.5 text-xs rounded"
                style={{ background: theme.accentMuted, color: theme.accent, border: `1px solid ${theme.accent}44` }}
              >
                Edit metadata
              </button>
              <button
                onClick={openEditCopy}
                className="w-full py-1.5 text-xs rounded"
                style={{ background: theme.accentMuted, color: theme.accent, border: `1px solid ${theme.accent}44` }}
              >
                {copySidecar ? "Edit copy" : "Add copy"}
              </button>
              <button
                onClick={() => startDuplicate(selectedAsset)}
                className="w-full py-1.5 text-xs rounded"
                style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
              >
                Duplicate for iteration
              </button>
            </div>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {dragging && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 50,
            background: `${theme.accent}22`,
            border: `2px dashed ${theme.accent}`,
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 36, color: theme.accent }}>⊕</div>
          <div style={{ fontSize: 13, color: theme.accent, fontWeight: 500 }}>
            Drop images or videos
          </div>
          {resolveDropDir() && (
            <div style={{ fontSize: 11, color: theme.textDim }}>
              → {resolveDropDir()!.split("/").slice(-3).join("/")}
            </div>
          )}
        </div>
      )}

      {/* Drop feedback toast */}
      {dropFeedback && (
        <div
          style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            zIndex: 60, background: theme.bgSecondary, border: `1px solid ${theme.border}`,
            borderRadius: 6, padding: "6px 14px", fontSize: 12, color: theme.text,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
          }}
        >
          {dropFeedback}
        </div>
      )}
    </div>
  );
}
