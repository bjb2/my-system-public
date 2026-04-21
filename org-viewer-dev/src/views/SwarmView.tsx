import { Theme } from "../themes";
import AgentTile, { TileConfig } from "../components/AgentTile";
import BrowserTile from "../components/BrowserTile";
import ErrorBoundary from "../components/ErrorBoundary";

interface Props {
  theme: Theme;
  orgRoot: string;
  tiles: TileConfig[];
  visible: boolean;
  onTileUpdate: (id: string, patch: Partial<Pick<TileConfig, "x" | "y" | "width" | "height">>) => void;
  onTileFocus: (id: string) => void;
  onTileClose: (id: string) => void;
  onAddShell: () => void;
  onResetPositions: () => void;
  onAddBrowser?: () => void;
  onTriggerObserver?: () => void;
  observerRunning?: boolean;
  onTilePtyReady?: (id: string, ptyId: number) => void;
}

export default function SwarmView({ theme, tiles, visible, onTileUpdate, onTileFocus, onTileClose, onAddShell, onResetPositions, onAddBrowser, onTriggerObserver, observerRunning, onTilePtyReady }: Props) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: theme.bg, overflow: "hidden" }}>
      {/* Toolbar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 32,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          borderBottom: `1px solid ${theme.border}`,
          background: theme.bgSecondary,
        }}
      >
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          Swarm
        </span>
        <span style={{ fontSize: 10, color: theme.textDim }}>
          {tiles.length} agent{tiles.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        {tiles.length > 0 && (
          <button
            onClick={onResetPositions}
            style={{
              fontSize: 11,
              color: theme.textDim,
              background: "none",
              border: `1px solid ${theme.border}`,
              borderRadius: 3,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            reset positions
          </button>
        )}
        <button
          onClick={onAddShell}
          style={{
            fontSize: 11,
            color: theme.accent,
            background: theme.accentMuted,
            border: `1px solid ${theme.border}`,
            borderRadius: 3,
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          + shell
        </button>
        {onAddBrowser && (
          <button
            onClick={onAddBrowser}
            style={{
              fontSize: 11,
              color: theme.accent,
              background: theme.accentMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: 3,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            + browser
          </button>
        )}
        {onTriggerObserver && (
          <button
            onClick={onTriggerObserver}
            disabled={observerRunning}
            title={observerRunning ? "Observer already running" : "Run observer agent"}
            style={{
              fontSize: 11,
              color: observerRunning ? theme.textDim : theme.accent,
              background: observerRunning ? "transparent" : theme.accentMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: 3,
              padding: "2px 8px",
              cursor: observerRunning ? "not-allowed" : "pointer",
              opacity: observerRunning ? 0.5 : 1,
            }}
          >
            ヽ༼ຈل͜ຈ༽ﾉ
          </button>
        )}
      </div>

      {/* Tile canvas */}
      <div style={{ position: "absolute", top: 32, left: 0, right: 0, bottom: 0 }}>
        {tiles.length === 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 36, opacity: 0.2 }}>ヽ༼ຈل͜ຈ༽ﾉ</span>
            <p style={{ fontSize: 13, color: theme.textDim, margin: 0 }}>no agents running</p>
            <p style={{ fontSize: 11, color: theme.textDim, margin: 0 }}>
              use <span style={{ color: theme.accent }}>❯</span> on a task to spawn one, or{" "}
              <button
                onClick={onAddShell}
                style={{ background: "none", border: "none", color: theme.accent, cursor: "pointer", fontSize: 11, padding: 0 }}
              >
                + shell
              </button>{" "}
              for a blank terminal
            </p>
          </div>
        ) : (
          tiles.map(tile => (
            <ErrorBoundary key={tile.id} label={`tile:${tile.title}`} onClose={() => onTileClose(tile.id)}>
              {tile.type === "browser" ? (
                <BrowserTile
                  tile={tile}
                  theme={theme}
                  onUpdate={onTileUpdate}
                  onFocus={onTileFocus}
                  onClose={onTileClose}
                  visible={visible}
                />
              ) : (
                <AgentTile
                  tile={tile}
                  theme={theme}
                  onUpdate={onTileUpdate}
                  onFocus={onTileFocus}
                  onClose={onTileClose}
                  onPtyReady={onTilePtyReady}
                />
              )}
            </ErrorBoundary>
          ))
        )}
      </div>
    </div>
  );
}
