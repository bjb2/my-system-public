import { useEffect, useRef } from "react";
import { Theme } from "../themes";

export interface Toast {
  id: string;
  title: string;
  body: string;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  theme: Theme;
}

const AUTO_DISMISS_MS = 6000;

export default function ToastContainer({ toasts, onDismiss, theme }: Props) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    for (const toast of toasts) {
      if (!timers.current.has(toast.id)) {
        const t = setTimeout(() => {
          onDismiss(toast.id);
          timers.current.delete(toast.id);
        }, AUTO_DISMISS_MS);
        timers.current.set(toast.id, t);
      }
    }
    // Clear timers for dismissed toasts
    for (const [id, t] of timers.current.entries()) {
      if (!toasts.find(toast => toast.id === id)) {
        clearTimeout(t);
        timers.current.delete(id);
      }
    }
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 48,
        right: 16,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 320,
        pointerEvents: "none",
      }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
          style={{
            background: theme.bgSecondary,
            border: `1px solid ${theme.accent}`,
            borderRadius: 6,
            padding: "10px 14px",
            boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
            cursor: "pointer",
            pointerEvents: "auto",
            animation: "toast-in 0.2s ease",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 2 }}>
            {toast.title}
          </div>
          {toast.body && (
            <div style={{ fontSize: 11, color: theme.textMuted }}>
              {toast.body}
            </div>
          )}
        </div>
      ))}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
