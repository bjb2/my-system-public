import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Theme } from "../themes";
import { useAgentKaomoji } from "../hooks/useAgentKaomoji";
import MicButton from "./MicButton";
import "@xterm/xterm/css/xterm.css";

export interface TileConfig {
  id: string;
  type?: 'agent' | 'browser';
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  taskPath: string | null;
  projectRoot: string;
  promptSuffix?: string;
  promptOverride?: string;
  agentId?: string;
  agentLabel?: string;
  launchCmd?: string;
  submitKey?: "enter" | "shift+enter";
}

interface Props {
  tile: TileConfig;
  theme: Theme;
  onUpdate: (id: string, patch: Partial<Pick<TileConfig, "x" | "y" | "width" | "height">>) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onPtyReady?: (id: string, ptyId: number) => void;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_W = 280;
const MIN_H = 180;

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


export default function AgentTile({ tile, theme, onUpdate, onFocus, onClose, onPtyReady }: Props) {
  const termRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const initRef = useRef(false);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [spawnError, setSpawnError] = useState<string | null>(null);
  const kaomoji = useAgentKaomoji(!!(tile.taskPath || tile.promptOverride));
  const taskSentRef = useRef(false);
  const sendTaskMsgRef = useRef<(() => void) | null>(null);

  // Terminal init + PTY spawn
  useEffect(() => {
    if (!termRef.current || initRef.current) return;
    initRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.0,
      letterSpacing: 0,
      allowProposedApi: true,
      scrollback: 5000,
      minimumContrastRatio: 1,
      theme: {
        background: theme.bg,
        foreground: theme.text,
        cursor: theme.accent,
        cursorAccent: theme.bg,
        selectionBackground: theme.accentMuted,
        selectionForeground: theme.text,
        black: "#1a1a2e", red: theme.error, green: theme.success,
        yellow: theme.warning, blue: "#4a8cf0", magenta: "#c84af0",
        cyan: "#4ac8f0", white: "#d0d0e8",
        brightBlack: theme.textDim, brightRed: "#ff7060", brightGreen: "#6eff90",
        brightYellow: "#ffe060", brightBlue: "#7aaaf8", brightMagenta: "#e07af8",
        brightCyan: "#7ae8f8", brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    const unicode11 = new Unicode11Addon();
    term.loadAddon(fitAddon);
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    term.parser.registerOscHandler(7,   () => true);
    term.parser.registerOscHandler(133, () => true);
    term.parser.registerOscHandler(633, () => true);

    term.open(termRef.current);
    // Prevent xterm's native paste-event handler from doubling our Ctrl+V paste.
    // Must use capture phase so this fires before xterm's textarea handler (inner elements fire first in bubble).
    // stopPropagation prevents the event from reaching the textarea entirely.
    term.element?.addEventListener('paste', (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true });

    // Ctrl+C with selection → copy to clipboard (don't send SIGINT).
    // Ctrl+V → paste from clipboard into PTY (don't send \x16).
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown' || !e.ctrlKey || e.shiftKey || e.altKey) return true;
      if (e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        return false;
      }
      if (e.key === 'v') {
        navigator.clipboard.readText().then(text => { if (text) term.paste(text); }).catch(() => {});
        return false;
      }
      return true;
    });

    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => { try { webgl?.dispose(); } catch {} webgl = null; });
      term.loadAddon(webgl);
    } catch { webgl = null; }

    fitAddon.fit();
    terminalRef.current = term;
    fitRef.current = fitAddon;

    const cwd = tile.projectRoot || ".";

    invoke<number>("pty_create", { shell: "powershell", args: ["-NoLogo"], cwd })
      .then(id => {
        ptyIdRef.current = id;
        onPtyReady?.(tile.id, id);
        const dim = fitAddon.proposeDimensions();
        if (dim) invoke("pty_resize", { ptyId: id, rows: dim.rows, cols: dim.cols }).catch(() => {});

        term.onData(data => invoke("pty_write", { ptyId: id, data }).catch(() => {}));

        // Launch interactive agent at 600ms (claude/gemini/etc are .cmd scripts — must go through PS PTY)
        setTimeout(() => {
          const cmd = tile.launchCmd ?? "claude";
          invoke("pty_write", { ptyId: ptyIdRef.current!, data: `${cmd}\r\n` }).catch(() => {});
        }, 600);

        // Shift+Enter = kitty keyboard protocol sequence (for agents configured with submitKey: "shift+enter")
        const submitSeq = tile.submitKey === "shift+enter" ? "\x1b[13;2u" : "\r\n";

        if (tile.promptOverride || tile.taskPath) {
          const sendTaskMsg = () => {
            if (taskSentRef.current) return;
            taskSentRef.current = true;
            if (tile.promptOverride) {
              invoke("pty_write", { ptyId: id, data: tile.promptOverride! })
                .then(() => invoke("pty_write", { ptyId: id, data: submitSeq }))
                .catch(() => {});
            } else {
              const suffix = tile.promptSuffix ? `\n\nAdditional context from user:\n${tile.promptSuffix}` : "";
              const msg = `Read ${tile.taskPath} for your task. Project context is in ${tile.projectRoot}/CLAUDE.md. Begin working immediately.${suffix}`;
              invoke("pty_write", { ptyId: id, data: msg })
                .then(() => invoke("pty_write", { ptyId: id, data: submitSeq }))
                .catch(() => {});
            }
          };
          sendTaskMsgRef.current = sendTaskMsg;
          // 15s fallback — fires if the ready-indicator watch below misses the prompt
          setTimeout(sendTaskMsg, 15000);
        }
      })
      .catch(err => {
        console.error("AgentTile spawn error:", err);
        setSpawnError(String(err));
        term.write(`\r\n\x1b[31mFailed to start process:\x1b[0m ${err}\r\n`);
      });

    return () => {
      initRef.current = false;
      terminalRef.current = null;
      fitRef.current = null;
      if (ptyIdRef.current !== null) {
        invoke("pty_kill", { ptyId: ptyIdRef.current }).catch(() => {});
        ptyIdRef.current = null;
      }
      try { webgl?.dispose(); } catch {}
      webgl = null;
      try { term.dispose(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PTY output → xterm renderer + permission prompt logging
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    // eslint-disable-next-line no-control-regex
    const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
    listen<{ pty_id: number; data: string }>("pty-output", ({ payload }) => {
      if (payload.pty_id !== ptyIdRef.current) return;
      terminalRef.current?.write(payload.data);
      const plain = payload.data.replace(ANSI_RE, "");
      // Detect Claude Code's ready prompt (◆ or line-starting > / ❯) and fire task message immediately
      if (sendTaskMsgRef.current && !taskSentRef.current && /◆|^[>❯]\s/m.test(plain)) {
        sendTaskMsgRef.current();
      }
      if (/Allow\b/.test(plain) && /\?/.test(plain)) {
        for (const line of plain.split("\n")) {
          const trimmed = line.trim();
          if (/Allow\b/.test(trimmed) && /\?/.test(trimmed)) {
            invoke("append_permission_log", {
              entry: JSON.stringify({
                timestamp: new Date().toISOString(),
                agent: tile.title,
                line: trimmed.slice(0, 300),
              }),
            }).catch(() => {});
          }
        }
      }
    }).then(fn => {
      if (cancelled) fn(); else unlisten = fn;
    });
    return () => { cancelled = true; unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refit when tile dimensions change
  useEffect(() => {
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => {
      if (fitRef.current && ptyIdRef.current !== null) {
        fitRef.current.fit();
        const dim = fitRef.current.proposeDimensions();
        if (dim) invoke("pty_resize", { ptyId: ptyIdRef.current, rows: dim.rows, cols: dim.cols }).catch(() => {});
      }
    }, 60);
  }, [tile.width, tile.height]);

  // Drag title bar
  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
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

  // Resize handles
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

  const hasPrompt = !!(tile.taskPath || tile.promptOverride);
  const titleBarBg = hasPrompt ? theme.accentMuted : theme.bgTertiary;

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
      {/* Resize handles */}
      {HANDLES.map(h => (
        <div
          key={h.id}
          style={{ position: "absolute", zIndex: 10, ...h.style }}
          onMouseDown={e => handleResizeStart(e, h.id)}
        />
      ))}

      {/* Title bar */}
      <div
        style={{
          background: titleBarBg, borderBottom: `1px solid ${theme.border}`,
          padding: "3px 8px", display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0, cursor: "move", userSelect: "none",
        }}
        onMouseDown={handleDragStart}
      >
        <span style={{
          fontSize: hasPrompt ? 13 : 10,
          color: hasPrompt ? theme.accent : theme.textDim,
          flexShrink: 0,
          lineHeight: 1,
          transition: "opacity 0.3s",
        }}>
          {hasPrompt ? kaomoji : "❯_"}
        </span>
        <span style={{
          flex: 1, fontSize: 11, color: theme.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {tile.title}
        </span>
        {tile.agentLabel && (
          <span style={{
            fontSize: 9, color: theme.textDim, background: theme.bgTertiary,
            border: `1px solid ${theme.border}`, borderRadius: 3,
            padding: "1px 4px", flexShrink: 0, letterSpacing: "0.03em",
          }}>
            [{tile.agentLabel}]
          </span>
        )}
        <MicButton
          theme={theme}
          terminal={terminalRef.current}
          ptyId={ptyIdRef.current}
          onPtyWrite={(ptyId, data) => invoke("pty_write", { ptyId, data }).catch(() => {})}
        />
        <button
          style={{ fontSize: 12, color: theme.text, background: "none", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1, opacity: 0.7 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onClose(tile.id)}
        >
          ✕
        </button>
      </div>

      {/* Error banner */}
      {spawnError && (
        <div style={{
          padding: "6px 10px", fontSize: 11, color: theme.error,
          background: theme.bgSecondary, borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0, wordBreak: "break-all",
        }}>
          <strong>Spawn error:</strong> {spawnError}
        </div>
      )}

      {/* Terminal */}
      <div ref={termRef} style={{ flex: 1, background: theme.bg, overflow: "hidden" }} />
    </div>
  );
}
