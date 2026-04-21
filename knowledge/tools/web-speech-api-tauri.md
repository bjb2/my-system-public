---
type: knowledge
created: 2026-04-16
updated: 2026-04-17
tags: [org-viewer, tauri, speech, xterm, ux]
---

# Web Speech API in Tauri / WebView2

## The Core Pattern

WebView2 (Tauri on Windows) includes the Web Speech API natively. No external deps, no API keys. Mic permission granted once via browser dialog.

```ts
const w = window as Window & {
  SpeechRecognition?: new () => ISpeechRecognition;
  webkitSpeechRecognition?: new () => ISpeechRecognition;
};
const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
if (!SR) return; // unsupported
const rec = new SR();
rec.continuous = false;
rec.interimResults = true;  // enables streaming partial results
rec.lang = "en-US";
```

TypeScript's DOM lib doesn't include SpeechRecognition types. Define a minimal interface locally rather than fighting with lib options:

```ts
interface ISpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: ((e: Event) => void) | null;
  start(): void; stop(): void;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number; results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList { length: number; [i: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { isFinal: boolean; [i: number]: { transcript: string }; }
```

## Interim Results in xterm Without PTY Pollution

Write interim text directly to the xterm `Terminal` object (not via PTY write) using ANSI erase-line to update in place:

```ts
// On interim result — overwrites current line, dim cyan color
terminal.write("\r\x1b[2K\x1b[36m\x1b[2m" + interimText + "\x1b[0m");

// On final result — clear interim, then inject to PTY + submit
terminal.write("\r\x1b[2K");
invoke("pty_write", { ptyId, data: finalText + "\r\n" });
```

`\r` = carriage return (no newline), `\x1b[2K` = erase full line. This writes to the xterm renderer only — the PTY never sees the interim text. The final PTY write then echoes normally.

**Safe because**: The shell is waiting at a prompt and not generating output while you're dictating.

## Permission Flow (First-Use Prompt)

Gate on `localStorage` so the browser mic permission dialog is expected:

```ts
const PERMIT_KEY = "stt:permitted";

function start(onFinal, onInterim) {
  if (!localStorage.getItem(PERMIT_KEY)) {
    // Show your own informational dialog first
    setPendingCallbacks({ onFinal, onInterim });
    setShowPermitDialog(true);
    return;
  }
  doStart(onFinal, onInterim);
}

function acceptPermit() {
  localStorage.setItem(PERMIT_KEY, "1");
  setShowPermitDialog(false);
  doStart(pendingCallbacks.onFinal, pendingCallbacks.onInterim);
}
```

After `localStorage.setItem`, subsequent sessions skip the dialog entirely and go straight to `doStart()`.

## Toggle Pattern

`continuous: false` means recognition auto-stops after one utterance. Click-to-toggle (second click cancels) is cleaner than hold-to-talk:

```ts
function start(onFinal, onInterim) {
  if (recRef.current) {
    recRef.current.stop(); recRef.current = null;
    setIsListening(false); setInterim("");
    return; // toggle off
  }
  // ... proceed to listen
}
```

## Floating Transcript Overlay (Manhua Style)

```tsx
<div style={{
  position: "fixed", top: 64, left: "50%",
  transform: "translateX(-50%) rotate(-1.8deg)",
  zIndex: 9999, pointerEvents: "none",
  background: "#FEFDE8",          // parchment
  border: "3px solid #0a0a0a",
  boxShadow: "5px 5px 0 #0a0a0a", // hard ink shadow
  fontFamily: "'Impact', 'Arial Black', sans-serif",
  fontSize: 26, fontWeight: 900, fontStyle: "italic",
  color: "#0a0a0a", letterSpacing: "-0.5px",
  padding: "12px 24px",
}} />
```

Speed lines as texture: `repeating-linear-gradient(175deg, #000 0px, #000 1px, transparent 1px, transparent 8px)` at 4% opacity.

Speech bubble tail: two stacked zero-width triangles (border trick), inner one matches background color.

## Bottom Subtitle Strip (Transcript Display)

Preferred over the top-floating manhua panel for per-terminal mic buttons — stays readable without obscuring content:

```tsx
<div style={{
  position: "fixed",
  bottom: "9%", left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999, pointerEvents: "none",
  maxWidth: 680, padding: "8px 28px 10px",
  background: "rgba(0,0,0,0.82)",
  borderRadius: 4,
  fontFamily: "Cascadia Code, Consolas, monospace",
  fontSize: 18, fontWeight: 600, color: "#fff",
  textShadow: "0 1px 4px rgba(0,0,0,0.9)",
}} />
```

## Global Voice Overlay (Full-Screen Takeover)

For global STT (hotkey-triggered, routes to named terminals): use the manhua panel centered in a dark backdrop. This draws attention and communicates "you're in voice mode":

```tsx
// Full-screen dim backdrop + centered manhua panel
<div style={{
  position: "fixed", inset: 0, zIndex: 9998,
  background: "rgba(0,0,0,0.80)",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
}}>
  <div style={{
    // Same manhua panel style, but centered and with 7px shadow
    background: "#FEFDE8", border: "3px solid #0a0a0a",
    boxShadow: "7px 7px 0 #0a0a0a",
    transform: "rotate(-1.5deg)",
    padding: "18px 32px 22px",
  }}>
    {interim || <span style={{ color: "#cc0000", letterSpacing: 6 }}>● ● ●</span>}
  </div>
  {/* Routing hint below panel */}
  <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "monospace", fontSize: 12 }}>
    "name: command" — targets: pwsh, claude, ...
  </div>
</div>
```

## Named Terminal Routing (Option B)

Parse `"name: command"` pattern and route to the matching terminal tab:

```ts
const routeVoiceCommand = (text: string) => {
  const match = text.match(/^(.+?):\s*(.+)$/s);
  let target: TermTab | undefined;
  let command: string;

  if (match) {
    const nameLower = match[1].toLowerCase().trim();
    target =
      tabs.find(t => t.label.toLowerCase() === nameLower) ??       // exact
      tabs.find(t => t.label.toLowerCase().startsWith(nameLower)) ?? // prefix
      tabs.find(t => nameLower.startsWith(t.label.toLowerCase())) ?? // contained
      tabs.find(t => t.label.toLowerCase().includes(nameLower));     // substring
    command = match[2].trim();
  } else {
    command = text.trim(); // no name → fallback
  }

  target ??= tabs.find(t => t.id === activeTabId) ?? tabs[tabs.length - 1];
  if (target?.ptyId != null) {
    invoke("pty_write", { ptyId: target.ptyId, data: command + "\r\n" });
    setActiveTabId(target.id);
    onRequestOpen?.(); // open terminal panel if closed
  }
};
```

Use stable `useRef` copies of `tabs` and `activeTabId` in the global keydown handler to avoid stale closure capture.

## Pulse Animation

```css
@keyframes stt-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.25); }
}
```

Apply via `animation: stt-pulse 0.9s ease-in-out infinite` on the mic button when `isListening`.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
