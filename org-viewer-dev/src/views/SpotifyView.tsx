import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Theme } from "../themes";

interface CurrentTrack {
  title: string;
  artist: string;
  album: string;
  album_art: string | null;
  is_playing: boolean;
  progress_ms: number;
  duration_ms: number;
  volume_percent: number | null;
}

interface Props {
  theme: Theme;
  onPlayingChange?: (playing: boolean) => void;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function SpotifyView({ theme, onPlayingChange }: Props) {
  const [clientId, setClientId] = useState("");
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [track, setTrack] = useState<CurrentTrack | null>(null);
  const [volume, setVolume] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "waiting" | "done">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSavedState = useCallback(async () => {
    try {
      const id = await invoke<string | null>("spotify_get_client_id");
      if (id) setSavedClientId(id);
      const tokens = await invoke<{ access_token: string; expires_at: number } | null>("spotify_get_tokens");
      if (tokens?.access_token) setAuthed(true);
    } catch { /* no saved state */ }
  }, []);

  useEffect(() => { loadSavedState(); }, [loadSavedState]);

  const fetchTrack = useCallback(async () => {
    try {
      const t = await invoke<CurrentTrack | null>("spotify_current_track");
      setTrack(t);
      setError(null);
      onPlayingChange?.(t?.is_playing ?? false);
      if (t?.volume_percent != null) setVolume(t.volume_percent);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Not authenticated")) {
        setAuthed(false);
      } else {
        setError(msg);
      }
    }
  }, [onPlayingChange]);

  // Poll current track every 5s when authed
  useEffect(() => {
    if (!authed) return;
    fetchTrack();
    pollRef.current = setInterval(fetchTrack, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [authed, fetchTrack]);

  // Listen for OAuth callback
  useEffect(() => {
    const unlisten = listen<string>("spotify-auth-callback", async (event) => {
      setAuthStatus("done");
      try {
        const id = savedClientId ?? clientId;
        await invoke("spotify_exchange_code", { clientId: id, code: event.payload });
        setAuthed(true);
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [savedClientId, clientId]);

  const saveClientId = async () => {
    const id = clientId.trim();
    if (!id) return;
    await invoke("spotify_save_client_id", { clientId: id });
    setSavedClientId(id);
  };

  const startAuth = async () => {
    const id = savedClientId ?? clientId.trim();
    if (!id) return;
    setAuthStatus("waiting");
    setError(null);
    try {
      const url = await invoke<string>("spotify_start_auth", { clientId: id });
      // Open auth URL in system browser
      await invoke("open_external_url", { url });
    } catch (e) {
      setError(String(e));
      setAuthStatus("idle");
    }
  };

  const playPause = async () => {
    if (!track) return;
    try {
      await invoke("spotify_play_pause", { play: !track.is_playing });
      setTrack(t => t ? { ...t, is_playing: !t.is_playing } : t);
      onPlayingChange?.(!track.is_playing);
    } catch (e) { setError(String(e)); }
  };

  const skipNext = async () => {
    try {
      await invoke("spotify_next");
      setTimeout(fetchTrack, 800);
    } catch (e) { setError(String(e)); }
  };

  const skipPrev = async () => {
    try {
      await invoke("spotify_prev");
      setTimeout(fetchTrack, 800);
    } catch (e) { setError(String(e)); }
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setVolume(v);
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      invoke("spotify_set_volume", { percent: v }).catch(err => setError(String(err)));
    }, 200);
  };

  const disconnect = async () => {
    await invoke("spotify_clear_tokens");
    setAuthed(false);
    setTrack(null);
    onPlayingChange?.(false);
  };

  // ── Setup screen: no client ID ───────────────────────────────────────────
  if (!savedClientId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-80 p-6 border rounded" style={{ background: theme.bgSecondary, borderColor: theme.border }}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: theme.text }}>Spotify Client ID</h2>
          <p className="text-xs mb-4 leading-relaxed" style={{ color: theme.textMuted }}>
            Register an app at{" "}
            <span style={{ color: theme.accent }}>developer.spotify.com</span>,
            set the redirect URI to{" "}
            <span className="font-mono" style={{ color: theme.accent }}>http://127.0.0.1:8888/callback</span>,
            then paste your Client ID below.
          </p>
          <input
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="client ID..."
            className="w-full bg-transparent text-sm outline-none px-3 py-2 rounded border mb-3"
            style={{ borderColor: theme.border, color: theme.text }}
            onKeyDown={e => { if (e.key === "Enter") saveClientId(); }}
          />
          <button
            onClick={saveClientId}
            className="w-full py-2 rounded text-sm"
            style={{ background: theme.accent, color: theme.bg }}
          >
            Save
          </button>
          {error && <p className="mt-3 text-xs" style={{ color: theme.error }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ── Connect screen: client ID saved, not authed ──────────────────────────
  if (!authed) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-80 p-6 border rounded" style={{ background: theme.bgSecondary, borderColor: theme.border }}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: theme.text }}>Connect Spotify</h2>
          {authStatus === "waiting" ? (
            <p className="text-xs mb-4" style={{ color: theme.textMuted }}>
              Waiting for authorization... Check your browser and approve the request.
            </p>
          ) : (
            <p className="text-xs mb-4" style={{ color: theme.textMuted }}>
              Click Connect to open the Spotify auth page in your browser.
            </p>
          )}
          <button
            onClick={startAuth}
            disabled={authStatus === "waiting"}
            className="w-full py-2 rounded text-sm mb-2"
            style={{
              background: authStatus === "waiting" ? theme.bgTertiary : theme.accent,
              color: authStatus === "waiting" ? theme.textMuted : theme.bg,
            }}
          >
            {authStatus === "waiting" ? "Waiting..." : "Connect Spotify"}
          </button>
          <button
            onClick={() => setSavedClientId(null)}
            className="w-full py-1.5 rounded text-xs"
            style={{ background: "transparent", color: theme.textDim, border: `1px solid ${theme.border}` }}
          >
            Change Client ID
          </button>
          {error && <p className="mt-3 text-xs" style={{ color: theme.error }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ── Player ───────────────────────────────────────────────────────────────
  const progress = track ? track.progress_ms / Math.max(track.duration_ms, 1) : 0;

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: theme.border, background: theme.bgSecondary }}
      >
        <div>
          <h2 className="text-base font-semibold" style={{ color: theme.accent }}>Spotify</h2>
          <p className="text-xs mt-0.5" style={{ color: theme.textDim }}>remote control</p>
        </div>
        <button
          onClick={disconnect}
          className="text-xs px-2 py-1 rounded"
          style={{ color: theme.textDim, border: `1px solid ${theme.border}` }}
        >
          disconnect
        </button>
      </div>

      {/* Player area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        {track ? (
          <>
            {/* Album art */}
            {track.album_art ? (
              <img
                src={track.album_art}
                alt={track.album}
                className="rounded shadow-lg"
                style={{ width: 200, height: 200, objectFit: "cover" }}
              />
            ) : (
              <div
                className="rounded flex items-center justify-center"
                style={{ width: 200, height: 200, background: theme.bgTertiary, color: theme.textDim, fontSize: 48 }}
              >
                ♫
              </div>
            )}

            {/* Track info */}
            <div className="text-center w-full max-w-xs">
              <div
                className="text-base font-semibold truncate"
                style={{ color: theme.text }}
              >
                {track.title}
              </div>
              <div className="text-sm mt-1 truncate" style={{ color: theme.textMuted }}>
                {track.artist}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: theme.textDim }}>
                {track.album}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-xs">
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: theme.bgTertiary }}
              >
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progress * 100}%`, background: theme.accent }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs font-mono" style={{ color: theme.textDim }}>
                  {formatMs(track.progress_ms)}
                </span>
                <span className="text-xs font-mono" style={{ color: theme.textDim }}>
                  {formatMs(track.duration_ms)}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-5">
              <button
                onClick={skipPrev}
                className="flex items-center justify-center rounded-full transition-colors"
                style={{ width: 40, height: 40, background: theme.bgSecondary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                title="Previous"
              >
                ⏮
              </button>
              <button
                onClick={playPause}
                className="flex items-center justify-center rounded-full transition-colors"
                style={{ width: 52, height: 52, background: theme.accent, color: theme.bg, fontSize: 20 }}
                title={track.is_playing ? "Pause" : "Play"}
              >
                {track.is_playing ? "⏸" : "▶"}
              </button>
              <button
                onClick={skipNext}
                className="flex items-center justify-center rounded-full transition-colors"
                style={{ width: 40, height: 40, background: theme.bgSecondary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                title="Next"
              >
                ⏭
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 w-full max-w-xs">
              <span className="text-xs" style={{ color: theme.textDim }}>🔈</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={handleVolume}
                className="flex-1"
                style={{ accentColor: theme.accent }}
              />
              <span className="text-xs w-8 text-right font-mono" style={{ color: theme.textDim }}>
                {volume}%
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div style={{ fontSize: 48, color: theme.textDim }}>♫</div>
            <p className="text-sm" style={{ color: theme.textMuted }}>Nothing playing</p>
            <p className="text-xs" style={{ color: theme.textDim }}>Start playing something in Spotify</p>
            <button
              onClick={fetchTrack}
              className="mt-2 px-4 py-1.5 rounded text-xs"
              style={{ background: theme.bgSecondary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
            >
              ↻ refresh
            </button>
          </div>
        )}
      </div>

      {/* Error bar */}
      {error && (
        <div
          className="px-4 py-2 text-xs border-t flex-shrink-0"
          style={{ borderColor: theme.border, color: theme.error, background: theme.bgSecondary }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
