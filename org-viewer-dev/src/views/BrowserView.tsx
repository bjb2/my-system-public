import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Theme } from "../themes";

interface Props {
  theme: Theme;
  initialUrl: string;
  onUrlChange: (url: string) => void;
  visible: boolean;
}

export default function BrowserView({ theme, initialUrl, onUrlChange, visible }: Props) {
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const anchorRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);

  const getScreenBounds = () => {
    const el = anchorRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: window.screenX + r.left,
      y: window.screenY + r.top,
      w: r.width,
      h: r.height,
    };
  };

  // Mount once: create the native webview window
  useEffect(() => {
    const b = getScreenBounds();
    if (!b) return;
    invoke("browser_open", { url: initialUrl, ...b }).catch(console.error);

    const obs = new ResizeObserver(() => {
      if (!visibleRef.current) return;
      const b2 = getScreenBounds();
      if (b2) invoke("browser_show", b2).catch(console.error);
    });
    if (anchorRef.current) obs.observe(anchorRef.current);

    let unlistenMove: (() => void) | null = null;
    getCurrentWindow().onMoved(() => {
      if (!visibleRef.current) return;
      const b2 = getScreenBounds();
      if (b2) invoke("browser_show", b2).catch(console.error);
    }).then(fn => { unlistenMove = fn; });

    return () => {
      obs.disconnect();
      unlistenMove?.();
      invoke("browser_hide").catch(console.error);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show/hide native webview when visibility changes — no reload
  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      const b = getScreenBounds();
      if (b) invoke("browser_show", b).catch(console.error);
    } else {
      invoke("browser_hide").catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const navigate = useCallback((raw: string) => {
    let target = raw.trim();
    if (!target) return;
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "https://" + target;
    }
    setInputUrl(target);
    onUrlChange(target);
    const b = getScreenBounds();
    if (b) invoke("browser_open", { url: target, ...b }).catch(console.error);
  }, [onUrlChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: theme.bg }}>
      {/* URL bar — rendered by React, sits above the native webview */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgSecondary,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, opacity: 0.4 }}>⊙</span>
        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") navigate(inputUrl); }}
          onFocus={e => e.currentTarget.select()}
          style={{
            flex: 1,
            background: theme.bgTertiary,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            padding: "3px 10px",
            fontSize: 12,
            fontFamily: "inherit",
            outline: "none",
          }}
          placeholder="https://..."
        />
        <button
          onClick={() => navigate(inputUrl)}
          style={{
            fontSize: 11,
            color: theme.accent,
            background: theme.accentMuted,
            border: `1px solid ${theme.border}`,
            borderRadius: 3,
            padding: "3px 10px",
            cursor: "pointer",
          }}
        >
          Go
        </button>
      </div>

      {/* Anchor — the native browser window covers this exact area */}
      <div ref={anchorRef} style={{ flex: 1 }} />
    </div>
  );
}
