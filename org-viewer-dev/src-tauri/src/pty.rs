use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tauri::{AppHandle, Emitter};
use serde::Serialize;

#[derive(Serialize, Clone)]
struct PtyOutput {
    pty_id: u32,
    data: String,
}

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct PtyManager {
    ptys: Mutex<HashMap<u32, PtyInstance>>,
    counter: Mutex<u32>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            ptys: Mutex::new(HashMap::new()),
            counter: Mutex::new(0),
        }
    }
}

#[tauri::command]
pub fn pty_create(
    shell: String,
    args: Option<Vec<String>>,
    cwd: String,
    app: AppHandle,
    manager: tauri::State<PtyManager>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&shell);
    if let Some(a) = args {
        for arg in a { cmd.arg(arg); }
    }
    cmd.cwd(&cwd);

    cmd.env("TERM", "xterm-256color");
    // Suppress PSReadLine's shell-integration OSC sequences and fancy features
    // that don't render correctly in embedded terminals
    cmd.env("TERM_PROGRAM", "xterm");
    cmd.env("TERM_PROGRAM_VERSION", "");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = {
        let mut c = manager.counter.lock().unwrap();
        *c += 1;
        *c
    };

    // Spawn reader thread
    let app_clone = app.clone();
    let pty_id = id;
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("pty-output", PtyOutput { pty_id, data });
                }
            }
        }
    });

    manager.ptys.lock().unwrap().insert(id, PtyInstance {
        writer,
        master: pair.master,
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(
    pty_id: u32,
    data: String,
    manager: tauri::State<PtyManager>,
) -> Result<(), String> {
    let mut ptys = manager.ptys.lock().unwrap();
    if let Some(pty) = ptys.get_mut(&pty_id) {
        pty.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        pty.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    pty_id: u32,
    rows: u16,
    cols: u16,
    manager: tauri::State<PtyManager>,
) -> Result<(), String> {
    let ptys = manager.ptys.lock().unwrap();
    if let Some(pty) = ptys.get(&pty_id) {
        pty.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(
    pty_id: u32,
    manager: tauri::State<PtyManager>,
) -> Result<(), String> {
    manager.ptys.lock().unwrap().remove(&pty_id);
    Ok(())
}
