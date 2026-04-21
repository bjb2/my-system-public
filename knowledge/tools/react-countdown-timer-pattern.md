---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [react, hooks, timer, gotcha]
---

# React Countdown Timer: Two-Effect Pattern

Building a countdown timer in React has two non-obvious pitfalls: stale closures in interval callbacks and safe mode-switching at zero.

## The Pattern

```tsx
const modeRef = useRef(mode);
modeRef.current = mode; // always current — no closure trap

// Effect 1: tick while running
useEffect(() => {
  if (!running) return;
  const id = setInterval(() => setSeconds(s => s - 1), 1000);
  return () => clearInterval(id);
}, [running]);

// Effect 2: switch mode at zero
useEffect(() => {
  if (seconds > 0) return;
  setRunning(false);
  const next = modeRef.current === "work" ? "break" : "work";
  setMode(next);
  setSeconds(next === "break" ? BREAK_SECS : WORK_SECS);
}, [seconds]);
```

## Why Two Effects

A single effect that both ticks and handles zero is tempting but breaks:

```tsx
// WRONG — mode is stale inside setInterval callback
useEffect(() => {
  const id = setInterval(() => {
    setSeconds(s => {
      if (s <= 1) {
        const next = mode === "work" ? "break" : "work"; // stale!
        setMode(next);
      }
      return s - 1;
    });
  }, 1000);
  return () => clearInterval(id);
}, [running]); // mode not in deps → stale closure
```

Adding `mode` to deps would restart the interval on every mode change — wrong.

## Why modeRef

The zero-switch effect reads `mode` state, but `mode` is not in its deps (we only want it to fire on `seconds` change). Using `modeRef.current` instead gives always-current mode without adding it as a dependency.

## SVG Arc Progress Ring

```tsx
const r = 22;
const circumference = 2 * Math.PI * r;
const dashOffset = circumference * (1 - progress); // progress = seconds / total

<svg width={56} height={56} style={{ transform: "rotate(-90deg)" }}>
  {/* Track */}
  <circle cx={28} cy={28} r={r} fill="none" stroke={theme.bgTertiary} strokeWidth={2.5} />
  {/* Progress arc */}
  <circle
    cx={28} cy={28} r={r}
    fill="none" stroke={modeColor} strokeWidth={2.5}
    strokeDasharray={circumference}
    strokeDashoffset={dashOffset}
    strokeLinecap="round"
    style={{ transition: running ? "stroke-dashoffset 0.8s linear" : "none" }}
  />
</svg>
```

`rotate(-90deg)` on the SVG starts the arc at 12 o'clock. Disable transition when paused so scrubbing is instant.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
