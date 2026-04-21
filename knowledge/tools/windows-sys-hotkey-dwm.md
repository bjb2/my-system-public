---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [rust, windows, hotkey, dwm, autohotkey, gotcha, #gotcha]
---

# windows-sys: Global Hotkeys + DWM Window Polish

## RegisterHotKey: GetMessageW, not GetMessage

`GetMessage` does not exist in `windows-sys`. Use `GetMessageW`:

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.52", features = [
    "Win32_UI_Input_KeyboardAndMouse",
    "Win32_UI_WindowsAndMessaging",
    "Win32_Foundation",
    "Win32_Graphics_Dwm",
] }
```

```rust
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, MOD_ALT, VK_SPACE};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetMessageW, WM_HOTKEY, MSG};

// MOD_ALT: u32 = 1
// VK_SPACE: u16 — must cast to u32 for RegisterHotKey's 4th param
RegisterHotKey(0, HOTKEY_ID, MOD_ALT, VK_SPACE as u32);

loop {
    let mut msg: MSG = std::mem::zeroed();
    let ret = GetMessageW(&mut msg, 0, 0, 0);
    if ret <= 0 { break; }  // WM_QUIT or error
    if msg.message == WM_HOTKEY && msg.wParam as i32 == HOTKEY_ID {
        // handle toggle
    }
}
```

Run this in a dedicated background thread. The `GetMessageW` loop blocks until a message arrives — it does not spin. `RegisterHotKey` returns 0 (false) if the hotkey is already registered by another app; handle gracefully.

## Windows Key: What Can Be Intercepted

The bare `Win` key is owned by Windows at the kernel level — `RegisterHotKey` cannot intercept it alone. Win+key combos have varying availability:

| Combo | Status |
|-------|--------|
| `Win+Space` | Language switcher — `RegisterHotKey` usually fails. **Exception:** if only one input language is installed, Windows' switcher is inactive and you can steal it with `MOD_WIN + VK_SPACE`. Worth trying; check return value of `RegisterHotKey`. |
| `Win+S` | Windows Search / Copilot — owned by OS |
| `Win+F` | Feedback Hub — usually stealable |
| `Alt+Space` | PowerToys Run default — usually free |
| `Ctrl+Space` | Safe, but IDEs often own it |

Use `MOD_ALT + VK_SPACE` for Alt+Space (reliable cross-system choice).

## AutoHotkey: Raise-or-Launch Pattern

For a Spotlight-style launcher that raises an existing window instead of launching a duplicate — the most useful pattern for any always-on tool:

```ahk
; Win+Space = toggle launcher (suppress default language switcher)
#Space::
    if WinExist("Sift") {
        if WinActive("Sift")
            WinMinimize
        else
            WinActivate
    } else {
        Run, C:\Users\bryan\enclave\sift\target\release\sift.exe
    }
return
```

- `WinExist("Sift")` matches by window title substring
- First press: launches or raises. Second press while focused: minimizes. This is the Spotlight UX model.
- Put the script in startup folder (`shell:startup`) to run at login.

**PowerToys alternative (no scripting):** Keyboard Manager → Remap shortcut → launch program. Simpler but no raise-or-launch logic — always spawns a new process.

## DWM Rounded Corners (Windows 11)

Apply after the window is created (earliest: first `update()` frame). Find the window by title since eframe 0.29 doesn't expose HWND directly:

```rust
use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;
use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;

unsafe {
    let title: Vec<u16> = "Sift\0".encode_utf16().collect();
    let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
    if hwnd != 0 {
        let pref: u32 = 2; // DWMWCP_ROUND (Windows 11+)
        // DWMWA_WINDOW_CORNER_PREFERENCE = 33
        DwmSetWindowAttribute(hwnd, 33, &pref as *const _ as _, 4);
    }
}
```

Values for DWMWCP:
- `0` = default (system decides)
- `1` = DONOTROUND
- `2` = ROUND
- `3` = ROUNDSMALL

Only works on Windows 11. On Windows 10, call succeeds but has no effect.

## No-Decorations Borderless Window (eframe 0.29)

```rust
let options = eframe::NativeOptions {
    viewport: egui::ViewportBuilder::default()
        .with_decorations(false)  // no title bar
        .with_inner_size([860.0, 560.0]),
    centered: true,
    ..Default::default()
};
```

Add drag-to-move via `StartDrag`:
```rust
let drag = ui.allocate_response(Vec2::new(24.0, 30.0), Sense::click_and_drag());
if drag.dragged() {
    ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
}
```

Minimize/restore:
```rust
ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
// Check state:
let minimized = ctx.input(|i| i.viewport().minimized.unwrap_or(false));
```

<!-- orphan: 0 inbound links as of 2026-04-20 -->
