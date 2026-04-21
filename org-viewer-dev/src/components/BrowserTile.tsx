import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Theme } from "../themes";
import { TileConfig } from "./AgentTile";

interface Props {
  tile: TileConfig;
  theme: Theme;
  onUpdate: (id: string, patch: Partial<Pick<TileConfig, "x" | "y" | "width" | "height">>) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  visible: boolean;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_W = 320;
const MIN_H = 200;

const HANDLES: { id: ResizeHandle; style: React.CSSProperties }[] = [
  { id: "n",  style: { top: 0,    left: 8,   right: 8,  height: 4, cursor: "ns-resize" } },
  { id: "s",  style: { bottom: 0, left: 8,   right: 8,  height: 4, cursor: "ns-resize" } },
  { id: "e",  style: { right: 0,  top: 8,    bottom: 8, width: 4,  cursor: "ew-resize" } },
  { id: "w",  style: { left: 0,   top: 8,    bottom: 8, width: 4,  cursor: "ew-resize" } },
  { id: "ne", style: { top: 0,    right: 0,  width: 10, height: 10, cursor: "nesw-resize" } },
  { id: "nw", style: { top: 0,    left: 0,   width: 10, height: 10, cursor: "nwse-resize" } },
  { id: "se", style: { bottom: 0, right: 0,  width: 10, height: 10, cursor: "nwse-resize" } },
  { id: "sw", style: { bottom: 0, left: 0,   width: 10, height: 10, cursor: "nesw-resize" } },
];

function applyResize(
  handle: ResizeHandle,
  origin: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
) {
  let { x, y, w, h } = origin;
  if (handle.includes("e")) w = Math.max(MIN_W, w + dx);
  if (handle.includes("w")) { const nw = Math.max(MIN_W, w - dx); x += w - nw; w = nw; }
  if (handle.includes("s")) h = Math.max(MIN_H, h + dy);
  if (handle.includes("n")) { const nh = Math.max(MIN_H, h - dy); y += h - nh; h = nh; }
  return { x, y, width: w, height: h };
}

export default function BrowserTile({ tile, theme, onUpdate, onFocus, onClose, visible }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);
  const rafRef = useRef<number | null>(null);
  const winLabel = "bw" + tile.id;

  const initialUrl = tile.taskPath || localStorage.getItem("browser-url") || "https://www.youtube.com";
  const [inputUrl, setInputUrl] = useState(initialUrl);

  const getScreenBounds = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: window.screenX + r.left, y: window.screenY + r.top, w: r.width, h: r.height };
  }, []);

  const syncPosition = useCallback(() => {
    if (!visibleRef.current) return;
    const b = getScreenBounds();
    if (b) invoke("browser_show", { label: winLabel, ...b }).catch(console.error);
  }, [getScreenBounds, winLabel]);

  // Mount: open native browser; unmount: destroy it
  useEffect(() => {
    // rAF ensures layout is complete before reading bounds
    const raf = requestAnimationFrame(() => {
      const b = getScreenBounds();
      if (b) invoke("browser_open", { label: winLabel, url: inputUrl, ...b }).catch(console.error);
    });
    return () => {
      cancelAnimationFrame(raf);
      invoke("browser_close", { label: winLabel }).catch(console.error);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show/hide when swarm view visibility changes
  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      const b = getScreenBounds();
      if (b) invoke("browser_show", { label: winLabel, ...b }).catch(console.error);
    } else {
      invoke("browser_hide", { label: winLabel }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Reposition when tile bounds change (drag / resize)
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(syncPosition);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.x, tile.y, tile.width, tile.height]);

  // Re-sync when the main Tauri window is moved or resized (screen coords change)
  useEffect(() => {
    let unlistenMove: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;
    const win = getCurrentWindow();
    win.onMoved(() => syncPosition()).then(fn => { unlistenMove = fn; });
    win.onResized(() => syncPosition()).then(fn => { unlistenResize = fn; });
    return () => { unlistenMove?.(); unlistenResize?.(); };
  }, [syncPosition]);

  const navigate = useCallback((raw: string) => {
    let target = raw.trim();
    if (!target) return;
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "https://" + target;
    }
    setInputUrl(target);
    localStorage.setItem("browser-url", target);
    const b = getScreenBounds();
    if (b) invoke("browser_open", { label: winLabel, url: target, ...b }).catch(console.error);
  }, [getScreenBounds, winLabel]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    e.preventDefault();
    onFocus(tile.id);
    const start = { x: e.clientX, y: e.clientY, tx: tile.x, ty: tile.y };
    const onMove = (ev: MouseEvent) =>
      onUpdate(tile.id, { x: start.tx + ev.clientX - start.x, y: start.ty + ev.clientY - start.y });
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    onFocus(tile.id);
    const origin = { x: tile.x, y: tile.y, w: tile.width, h: tile.height };
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: MouseEvent) =>
      onUpdate(tile.id, applyResize(handle, origin, ev.clientX - start.x, ev.clientY - start.y));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: tile.x, top: tile.y, width: tile.width, height: tile.height,
        zIndex: tile.zIndex,
        display: "flex", flexDirection: "column",
        border: `1px solid ${theme.border}`, borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
      onMouseDown={() => onFocus(tile.id)}
    >
      {HANDLES.map(h => (
        <div
          key={h.id}
          style={{ position: "absolute", zIndex: 10, ...h.style }}
          onMouseDown={e => handleResizeStart(e, h.id)}
        />
      ))}

      {/* Title bar with URL input */}
      <div
        style={{
          background: theme.bgSecondary,
          borderBottom: `1px solid ${theme.border}`,
          padding: "3px 8px",
          display: "flex", alignItems: "center", gap: 6,
          flexShrink: 0, cursor: "move", userSelect: "none",
        }}
        onMouseDown={handleDragStart}
      >
        <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>⊙</span>
        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") navigate(inputUrl); }}
          onFocus={e => e.currentTarget.select()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            flex: 1,
            background: theme.bgTertiary,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 3,
            padding: "2px 8px",
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
            minWidth: 0,
          }}
          placeholder="https://..."
        />
        <button
          style={{ fontSize: 11, color: theme.text, background: "none", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1, opacity: 0.7, flexShrink: 0 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onClose(tile.id)}
        >
          ✕
        </button>
      </div>

      {/* Anchor — native browser window covers this area */}
      <div ref={anchorRef} style={{ flex: 1, background: theme.bg }} />
    </div>
  );
}
