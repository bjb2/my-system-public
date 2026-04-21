use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use once_cell::sync::Lazy;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "org-viewer-store.json";
const TOKENS_KEY: &str = "spotify_tokens";
const CLIENT_ID_KEY: &str = "spotify_client_id";
const REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";
const SCOPES: &str =
    "user-read-playback-state user-modify-playback-state user-read-currently-playing";

static VERIFIER: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

// ── Public types ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SpotifyTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CurrentTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: Option<String>,
    pub is_playing: bool,
    pub progress_ms: u64,
    pub duration_ms: u64,
    pub volume_percent: Option<u32>,
}

// ── Serde shapes for Spotify API responses ──────────────────────────────────

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct SpotifyImage {
    url: String,
    height: Option<u32>,
}

#[derive(Deserialize)]
struct SpotifyAlbum {
    name: String,
    images: Vec<SpotifyImage>,
}

#[derive(Deserialize)]
struct SpotifyArtist {
    name: String,
}

#[derive(Deserialize)]
struct SpotifyTrack {
    name: String,
    duration_ms: u64,
    artists: Vec<SpotifyArtist>,
    album: SpotifyAlbum,
}

#[derive(Deserialize)]
struct SpotifyDevice {
    volume_percent: Option<u32>,
}

#[derive(Deserialize)]
struct PlayerState {
    is_playing: bool,
    #[serde(default)]
    progress_ms: u64,
    item: Option<SpotifyTrack>,
    device: Option<SpotifyDevice>,
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

fn generate_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rng.gen::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

fn verifier_to_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

// ── Store helpers ────────────────────────────────────────────────────────────

fn save_tokens_to_store(app: &tauri::AppHandle, tokens: &SpotifyTokens) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        TOKENS_KEY,
        serde_json::to_value(tokens).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

// ── Token commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn spotify_get_client_id(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(store
        .get(CLIENT_ID_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
pub async fn spotify_save_client_id(
    app: tauri::AppHandle,
    client_id: String,
) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(CLIENT_ID_KEY, serde_json::Value::String(client_id));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn spotify_get_tokens(app: tauri::AppHandle) -> Result<Option<SpotifyTokens>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    if let Some(val) = store.get(TOKENS_KEY) {
        let tokens: SpotifyTokens = serde_json::from_value(val).map_err(|e| e.to_string())?;
        return Ok(Some(tokens));
    }
    Ok(None)
}

#[tauri::command]
pub async fn spotify_clear_tokens(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(TOKENS_KEY);
    store.save().map_err(|e| e.to_string())
}

// ── OAuth PKCE auth ──────────────────────────────────────────────────────────

/// Returns the Spotify authorization URL to open in the browser.
/// Also starts the local callback server (port 8888) in the background.
#[tauri::command]
pub async fn spotify_start_auth(
    app: tauri::AppHandle,
    client_id: String,
) -> Result<String, String> {
    let verifier = generate_verifier();
    let challenge = verifier_to_challenge(&verifier);
    *VERIFIER.lock().unwrap() = Some(verifier);

    tauri::async_runtime::spawn(async move {
        let _ = run_callback_server(app).await;
    });

    let auth_url = format!(
        "https://accounts.spotify.com/authorize\
?response_type=code\
&client_id={}\
&scope={}\
&redirect_uri={}\
&code_challenge_method=S256\
&code_challenge={}",
        client_id,
        urlencoding::encode(SCOPES),
        urlencoding::encode(REDIRECT_URI),
        challenge,
    );

    Ok(auth_url)
}

async fn run_callback_server(app: tauri::AppHandle) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:8888")
        .await
        .map_err(|e| e.to_string())?;

    let accept_result = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        listener.accept(),
    )
    .await
    .map_err(|_| "auth timeout")?
    .map_err(|e| e.to_string())?;

    let (mut stream, _) = accept_result;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).await.unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);

    let html = "<html><head><style>\
        body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;\
        height:100vh;margin:0;background:#0a0a0f;color:#e2e2f0}\
        h2{font-weight:400;letter-spacing:.05em}\
    </style></head><body><h2>Connected to Spotify — you can close this tab.</h2></body></html>";
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.flush().await;

    if let Some(code) = extract_code(&req) {
        let _ = app.emit("spotify-auth-callback", code);
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

/// Exchange authorization code for access + refresh tokens.
#[tauri::command]
pub async fn spotify_exchange_code(
    app: tauri::AppHandle,
    client_id: String,
    code: String,
) -> Result<(), String> {
    let verifier = VERIFIER
        .lock()
        .unwrap()
        .take()
        .ok_or("No code verifier — call spotify_start_auth first")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://accounts.spotify.com/api/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed {status}: {body}"));
    }

    let tr: TokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    let tokens = SpotifyTokens {
        access_token: tr.access_token,
        refresh_token: tr.refresh_token.unwrap_or_default(),
        expires_at: chrono::Utc::now().timestamp() + tr.expires_in as i64,
    };
    save_tokens_to_store(&app, &tokens)
}

// ── Internal: get a fresh access token, refreshing if needed ────────────────

async fn fresh_token(app: &tauri::AppHandle) -> Result<String, String> {
    let tokens = spotify_get_tokens(app.clone())
        .await?
        .ok_or("Not authenticated — connect Spotify first")?;

    if chrono::Utc::now().timestamp() < tokens.expires_at - 60 {
        return Ok(tokens.access_token);
    }

    let client_id = spotify_get_client_id(app.clone())
        .await?
        .ok_or("No Spotify client ID saved")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://accounts.spotify.com/api/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("client_id", client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Token refresh failed: {}", resp.status()));
    }

    let tr: TokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    let new_tokens = SpotifyTokens {
        access_token: tr.access_token.clone(),
        refresh_token: tr
            .refresh_token
            .unwrap_or(tokens.refresh_token),
        expires_at: chrono::Utc::now().timestamp() + tr.expires_in as i64,
    };
    save_tokens_to_store(app, &new_tokens)?;
    Ok(tr.access_token)
}

// ── Player commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn spotify_current_track(
    app: tauri::AppHandle,
) -> Result<Option<CurrentTrack>, String> {
    let token = fresh_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.spotify.com/v1/me/player")
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().as_u16() == 204 {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("Spotify API error: {}", resp.status()));
    }

    let state: PlayerState = resp.json().await.map_err(|e| e.to_string())?;
    let Some(track) = state.item else {
        return Ok(None);
    };

    let artist = track
        .artists
        .first()
        .map(|a| a.name.clone())
        .unwrap_or_default();

    let album_name = track.album.name.clone();
    let album_art = track
        .album
        .images
        .iter()
        .find(|img| img.height.map_or(false, |h| h <= 300))
        .or_else(|| track.album.images.first())
        .map(|img| img.url.clone());

    let volume_percent = state.device.and_then(|d| d.volume_percent);

    Ok(Some(CurrentTrack {
        title: track.name,
        artist,
        album: album_name,
        album_art,
        is_playing: state.is_playing,
        progress_ms: state.progress_ms,
        duration_ms: track.duration_ms,
        volume_percent,
    }))
}

#[tauri::command]
pub async fn spotify_play_pause(app: tauri::AppHandle, play: bool) -> Result<(), String> {
    let token = fresh_token(&app).await?;
    let endpoint = if play {
        "https://api.spotify.com/v1/me/player/play"
    } else {
        "https://api.spotify.com/v1/me/player/pause"
    };
    let client = reqwest::Client::new();
    let resp = client
        .put(endpoint)
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 204 {
        return Err(format!("Spotify API error: {}", resp.status()));
    }
    Ok(())
}

#[tauri::command]
pub async fn spotify_next(app: tauri::AppHandle) -> Result<(), String> {
    let token = fresh_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.spotify.com/v1/me/player/next")
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 204 {
        return Err(format!("Spotify API error: {}", resp.status()));
    }
    Ok(())
}

#[tauri::command]
pub async fn spotify_prev(app: tauri::AppHandle) -> Result<(), String> {
    let token = fresh_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.spotify.com/v1/me/player/previous")
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 204 {
        return Err(format!("Spotify API error: {}", resp.status()));
    }
    Ok(())
}

#[tauri::command]
pub async fn spotify_set_volume(app: tauri::AppHandle, percent: u32) -> Result<(), String> {
    let token = fresh_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .put("https://api.spotify.com/v1/me/player/volume")
        .bearer_auth(&token)
        .query(&[("volume_percent", percent.to_string())])
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 204 {
        return Err(format!("Spotify API error: {}", resp.status()));
    }
    Ok(())
}
