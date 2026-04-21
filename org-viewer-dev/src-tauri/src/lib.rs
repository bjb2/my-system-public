mod documents;
mod pty;
mod spotify;
mod todoist;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use notify::{Watcher, RecursiveMode, Event};
use tauri::{Manager, Emitter};

const ADBLOCKER: &str = r#"
(function() {
  'use strict';
  const BLOCKED = [
    'doubleclick.net','googlesyndication.com','adservice.google',
    'pagead2.','googleadservices.com','adnxs.com','amazon-adsystem.com',
    'scorecardresearch.com','outbrain.com','taboola.com','pubmatic.com',
    'rubiconproject.com','openx.net','criteo.com','adsafeprotected.com',
    'ads.youtube.com','youtube.com/api/stats/ads','youtube.com/pagead',
    'youtube.com/ptracking','youtube.com/api/stats/watchtime',
  ];
  const blocked = url => url && BLOCKED.some(d => String(url).includes(d));
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (blocked(url)) return Promise.resolve(new Response('', {status:200}));
    return origFetch(input, init);
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url) {
    this.__b = blocked(url);
    if (!this.__b) xhrOpen.apply(this, arguments);
  };
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() { if (!this.__b) xhrSend.apply(this, arguments); };
  const css = `
    [class*="ad-slot"],[class*="adsbygoogle"],[id*="google_ads"],[id^="div-gpt-ad"],
    ins.adsbygoogle,.ytp-ad-module,.ytp-ad-player-overlay,.ytp-ad-overlay-container,
    .ytd-banner-promo-renderer,.ytd-ad-slot-renderer,#masthead-ad,
    ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer,
    #player-ads,.ytd-action-companion-ad-renderer,
    iframe[src*="doubleclick"],iframe[src*="googlesyndication"]
    {display:none!important;visibility:hidden!important}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.documentElement.appendChild(s);
  setInterval(() => {
    const skip = document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-container button,.ytp-ad-skip-button');
    if (skip) { skip.click(); return; }
    const vid = document.querySelector('video');
    if (vid && document.querySelector('.ad-showing') && vid.duration > 0) {
      vid.currentTime = vid.duration;
      vid.playbackRate = 16;
    }
  }, 300);
})();
"#;

/// Find the org root by searching for a directory containing CLAUDE.md.
/// Search order: exe ancestors, then cwd ancestors.
/// Production: exe is in org root, so exe's parent wins immediately.
/// Dev: cwd is org-viewer-dev project dir; we check siblings for my-org.
fn find_org_root() -> PathBuf {
    // Check exe ancestors (works in production)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().unwrap_or(&exe).to_path_buf();
        loop {
            if dir.join("CLAUDE.md").exists() {
                return dir;
            }
            match dir.parent() {
                Some(p) => dir = p.to_path_buf(),
                None => break,
            }
        }
    }

    // Walk cwd ancestors; at each level check the dir itself and its siblings.
    // This handles dev mode where cwd may be deep (e.g. target/debug) while
    // my-org is a sibling of org-viewer-dev several levels up.
    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = cwd.clone();
        loop {
            if dir.join("CLAUDE.md").exists() {
                return dir.clone();
            }
            if let Some(parent) = dir.parent() {
                if let Ok(entries) = std::fs::read_dir(parent) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() && path != dir && path.join("CLAUDE.md").exists() {
                            return path;
                        }
                    }
                }
                dir = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    // Last resort: exe's parent
    std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}


pub struct AppState {
    pub org_root: PathBuf,
}

#[tauri::command]
fn get_org_root(state: tauri::State<Arc<AppState>>) -> String {
    state.org_root.to_string_lossy().to_string()
}

#[tauri::command]
fn get_documents(state: tauri::State<Arc<AppState>>) -> Vec<documents::OrgDocument> {
    documents::scan_org(&state.org_root)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
fn move_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dst).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&src, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_bytes(path: String, b64: String) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(&b64).map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dst).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_code_files(dir: String) -> Vec<documents::FileEntry> {
    documents::list_files(&dir)
}

#[tauri::command]
async fn browser_open(app: tauri::AppHandle, label: String, url: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;

    if let Some(bv) = app.get_webview_window(&label) {
        bv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        bv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        bv.show().map_err(|e| e.to_string())?;
        let js = format!("window.location.replace({});", serde_json::to_string(&url).unwrap());
        let _ = bv.eval(&js);
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title("Browser")
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .position(x, y)
        .inner_size(w, h)
        .initialization_script(ADBLOCKER)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn browser_hide(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(bv) = app.get_webview_window(&label) {
        bv.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_show(app: tauri::AppHandle, label: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Manager};
    if let Some(bv) = app.get_webview_window(&label) {
        bv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        bv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        bv.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_close(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(bv) = app.get_webview_window(&label) {
        bv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_resize(app: tauri::AppHandle, label: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Manager};
    if let Some(bv) = app.get_webview_window(&label) {
        bv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        bv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_env_var(name: String) -> Result<String, String> {
    std::env::var(&name).map_err(|_| format!("env var {} not set", name))
}

#[tauri::command]
fn read_org_config(state: tauri::State<Arc<AppState>>) -> Result<String, String> {
    let path = state.org_root.join("org.config.json");
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_org_config(content: String, state: tauri::State<Arc<AppState>>) -> Result<(), String> {
    let path = state.org_root.join("org.config.json");
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

fn load_print_cmd(org_root: &std::path::Path, agent_id: Option<&str>) -> (String, Vec<String>) {
    let default_cmd = "claude".to_string();
    let default_args = vec!["--print".to_string()];

    let config_path = org_root.join("org.config.json");
    let Ok(raw) = std::fs::read_to_string(&config_path) else {
        return (default_cmd, default_args);
    };
    let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return (default_cmd, default_args);
    };

    let id = agent_id
        .map(|s| s.to_string())
        .or_else(|| cfg.get("defaultAgent").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "claude".to_string());

    let Some(agent) = cfg.get("agents").and_then(|a| a.get(&id)) else {
        return (default_cmd, default_args);
    };

    let cmd = agent.get("launchCmd").and_then(|v| v.as_str()).unwrap_or("claude").to_string();
    let args = agent.get("printArgs")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or(default_args);

    (cmd, args)
}

#[tauri::command]
fn generate_ad_ideas(
    state: tauri::State<Arc<AppState>>,
    brand: String,
    style: String,
    size: String,
) -> Result<String, String> {
    let prompt = format!(
        "You are writing Facebook ad copy for outgoing.world — an event discovery app.\n\
        Brand: {brand}. Style: {style}. Size: {size}.\n\n\
        Generate 5 distinct ad copy variations. Return a JSON array ONLY, no other text:\n\
        [{{\"headline\": \"...\", \"subtext\": \"...\", \"brand\": \"...\", \"rationale\": \"one sentence\"}}]\n\n\
        Rules:\n\
        - headline: max 40 chars, 2 lines OK, ends with → or action word\n\
        - subtext: max 60 chars, benefit-focused\n\
        - brand: always \"outgoing.world\" unless instructed otherwise\n\
        - Vary the hook type: curiosity / social proof / FOMO / benefit / identity"
    );

    let (cmd, args) = load_print_cmd(&state.org_root, None);
    let invoke = format!("{} {} $p", cmd, args.join(" "));
    // PowerShell here-string passes the multiline prompt without shell-escaping issues
    let ps_script = format!("$p = @\"\n{}\n\"@\n{}", prompt, invoke);

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{cmd} failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn append_permission_log(state: tauri::State<'_, Arc<AppState>>, entry: String) -> Result<(), String> {
    use std::io::Write;
    let log_dir = state.org_root.join("setup").join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("permission-requests.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", entry).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let org_root = std::env::args().nth(1)
        .map(PathBuf::from)
        .or_else(|| std::env::var("ORG_ROOT").ok().map(PathBuf::from))
        .unwrap_or_else(|| find_org_root());

    let state = Arc::new(AppState { org_root: org_root.clone() });

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(state.clone())
        .manage(pty::PtyManager::new())
        .setup(move |app| {
            let handle = app.handle().clone();

            // Clean up AUMID registry key if previously written — writing to
            // HKCU\SOFTWARE\Classes\AppUserModelId\<id> breaks WebView2's internal
            // content scheme (ERR_CONNECTION_REFUSED). No-op if key doesn't exist.
            let _ = std::process::Command::new("reg")
                .args(["delete", r"HKCU\SOFTWARE\Classes\AppUserModelId\com.org-viewer.app", "/f"])
                .output();

            let watch_path = org_root.clone();
            let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    use notify::EventKind::*;
                    match event.kind {
                        Create(_) | Modify(_) | Remove(_) => {
                            let _ = handle.emit("org-changed", ());
                        }
                        _ => {}
                    }
                }
            }).expect("watcher failed");
            watcher.watch(&watch_path, RecursiveMode::Recursive).expect("watch failed");
            // Keep watcher alive
            app.manage(Mutex::new(watcher));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_org_root,
            get_documents,
            read_file,
            write_file,
            read_file_base64,
            write_file_bytes,
            list_code_files,
            move_file,
            copy_file,
            pty::pty_create,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            todoist::todoist_get_token,
            todoist::todoist_save_token,
            todoist::todoist_get_tasks,
            todoist::todoist_complete_task,
            todoist::todoist_create_task,
            browser_open,
            browser_hide,
            browser_show,
            browser_close,
            browser_resize,
            append_permission_log,
            open_external_url,
            get_env_var,
            read_org_config,
            write_org_config,
            generate_ad_ideas,
            spotify::spotify_get_client_id,
            spotify::spotify_save_client_id,
            spotify::spotify_get_tokens,
            spotify::spotify_clear_tokens,
            spotify::spotify_start_auth,
            spotify::spotify_exchange_code,
            spotify::spotify_current_track,
            spotify::spotify_play_pause,
            spotify::spotify_next,
            spotify::spotify_prev,
            spotify::spotify_set_volume,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
