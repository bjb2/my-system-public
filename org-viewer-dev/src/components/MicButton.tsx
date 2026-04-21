import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { Theme } from "../themes";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

interface Props {
  theme: Theme;
  terminal: Terminal | null;
  ptyId: number | null;
  onPtyWrite: (ptyId: number, data: string) => void;
}

// Bottom subtitle strip shown while listening / during interim results
function TranscriptOverlay({ text, isListening }: { text: string; isListening: boolean }) {
  if (!isListening && !text) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "9%",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "none",
        maxWidth: 680,
        minWidth: 200,
        padding: "8px 28px 10px",
        background: "rgba(0,0,0,0.82)",
        borderRadius: 4,
        textAlign: "center",
        fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
        fontSize: 18,
        fontWeight: 600,
        color: "#fff",
        letterSpacing: "0.01em",
        lineHeight: 1.4,
        wordBreak: "break-word",
        textShadow: "0 1px 4px rgba(0,0,0,0.9)",
      }}
    >
      {text || (
        <span style={{ color: "#ff4444", fontSize: 13, letterSpacing: 5 }}>
          ● ● ●
        </span>
      )}
    </div>
  );
}

// Permission dialog
export function PermitDialog({ theme, onAccept, onDismiss }: { theme: Theme; onAccept: () => void; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: theme.bgSecondary,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          padding: "24px 28px",
          maxWidth: 380,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🎤</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 8, textAlign: "center" }}>
          Enable Speech-to-Text
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 20, textAlign: "center", lineHeight: 1.6 }}>
          Org Viewer will request microphone access to transcribe speech into terminal commands.
          Your browser will ask for permission once.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onAccept}
            style={{
              background: theme.accent,
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "7px 20px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Allow
          </button>
          <button
            onClick={onDismiss}
            style={{
              background: "transparent",
              color: theme.textMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: 4,
              padding: "7px 16px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MicButton({ theme, terminal, ptyId, onPtyWrite }: Props) {
  const interimRef = useRef(false);
  const { isListening, interim, start, needsPermit, acceptPermit, dismissPermit } = useSpeechRecognition();

  // Clean up interim terminal display when we stop listening without a final result
  useEffect(() => {
    if (!isListening && interimRef.current) {
      interimRef.current = false;
      terminal?.write("\r\x1b[2K");
    }
  }, [isListening, terminal]);

  const handleClick = () => {
    start(
      // Final result → clear interim display, inject to PTY + submit
      (text) => {
        if (interimRef.current) {
          terminal?.write("\r\x1b[2K");
          interimRef.current = false;
        }
        if (ptyId !== null) {
          onPtyWrite(ptyId, text + "\r\n");
        }
      },
      // Interim → write to terminal display (not PTY)
      (text) => {
        interimRef.current = true;
        terminal?.write("\r\x1b[2K\x1b[36m\x1b[2m" + text + "\x1b[0m");
      },
    );
  };

  return (
    <>
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={handleClick}
        title={isListening ? "Stop listening" : "Speak command (STT)"}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 3px",
          lineHeight: 1,
          fontSize: 13,
          color: isListening ? "#ff3333" : theme.textDim,
          opacity: isListening ? 1 : 0.6,
          animation: isListening ? "stt-pulse 0.9s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
      >
        🎤
      </button>

      <TranscriptOverlay text={interim} isListening={isListening} />

      {needsPermit && (
        <PermitDialog theme={theme} onAccept={acceptPermit} onDismiss={dismissPermit} />
      )}
    </>
  );
}
