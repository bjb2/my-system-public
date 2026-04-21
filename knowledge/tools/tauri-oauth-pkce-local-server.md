---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [tauri, oauth, pkce, rust, #gotcha]
---

# Tauri: OAuth PKCE via One-Shot Local HTTP Server

Pattern for any OAuth2 PKCE flow in a Tauri app (Spotify, Google, GitHub, etc.) where you control a redirect to `http://127.0.0.1:<port>/callback`.

## Architecture

1. **Rust command** generates PKCE verifier + challenge, stores verifier in a `Lazy<Mutex<Option<String>>>`, returns auth URL, spawns tokio callback server
2. **Frontend** receives auth URL, opens it in system browser via `cmd /c start <url>`
3. **Local server** accepts one connection, parses `code` query param, emits Tauri event `<name>-auth-callback` with the code
4. **Frontend** listens for the event, calls exchange command with the code
5. **Exchange command** retrieves verifier from global state, POSTs to token endpoint

## Key Code Patterns

### Global verifier storage

```rust
static VERIFIER: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

// In start_auth:
*VERIFIER.lock().unwrap() = Some(verifier);

// In exchange_code:
let verifier = VERIFIER.lock().unwrap().take()
    .ok_or("No code verifier — call start_auth first")?;
```

### One-shot tokio callback server

```rust
async fn run_callback_server(app: tauri::AppHandle) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:8888").await?;
    // 5-minute timeout — user may take time to approve
    let (mut stream, _) = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        listener.accept(),
    ).await.map_err(|_| "auth timeout")??.0;  // double ? for timeout + accept errors

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).await.unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);

    // Send response before emitting event
    let html = "<html>...</html>";
    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.flush().await;

    if let Some(code) = extract_code(&req) {
        let _ = app.emit("auth-callback", code);
    }
    Ok(())
}

fn extract_code(request: &str) -> Option<String> {
    let line = request.lines().next()?;
    let path = line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        if kv.next()? == "code" {
            return kv.next().map(|s| s.to_string());
        }
    }
    None
}
```

### PKCE generation (no extra deps required for Spotify PKCE)

```rust
// Cargo.toml: base64 = "0.22", sha2 = "0.10", rand = "0.8"
fn generate_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rng.gen::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

fn verifier_to_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
```

### Open system browser (Windows)

```rust
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

### Frontend auth event listener

```tsx
useEffect(() => {
    const unlisten = listen<string>("auth-callback", async (event) => {
        await invoke("exchange_code", { clientId, code: event.payload });
        setAuthed(true);
    });
    return () => { unlisten.then(f => f()); };
}, [clientId]);
```

## Gotchas

- **Spawn server before returning auth URL** — don't await the server, spawn it with `tauri::async_runtime::spawn`
- **Send HTTP response before emitting event** — browser hangs until response received; emit after flush
- **Partial move of API response structs** — if you call `.into_iter()` on a nested Vec, the parent struct field is partially moved. Extract needed fields to variables first:
  ```rust
  let album_name = track.album.name.clone();
  let art = track.album.images.iter().find(|i| ...).map(|i| i.url.clone());
  // now track.album.name is still accessible via album_name
  ```
- **`urlencoding` crate** needed for scopes/redirect URI in the auth URL query params — `URL_SAFE_NO_PAD` only encodes bytes, not URL query strings
- **Port conflicts** — if port 8888 is in use, `TcpListener::bind` fails. Consider trying a few ports or using port 0 (OS assigns) and extracting the bound port for the redirect URI

## Token Refresh Pattern

```rust
async fn fresh_token(app: &AppHandle) -> Result<String, String> {
    let tokens = get_tokens(app).await?.ok_or("not authed")?;
    if chrono::Utc::now().timestamp() < tokens.expires_at - 60 {
        return Ok(tokens.access_token);
    }
    // refresh...
}
```

Store `expires_at` as a Unix timestamp (not `expires_in`) — `expires_in` is seconds from now, meaningless after a restart.

## Related

- [[tauri-webview-api-gotchas]] — browser overlay pattern
- [[tauri-capabilities-permission-names]] — if you need to whitelist network access in capabilities

<!-- orphan: 0 inbound links as of 2026-04-20 -->
