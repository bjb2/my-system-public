import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { themes, ViewKey } from "./themes";
import { OrgDocument } from "./types";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import DashboardView from "./views/DashboardView";
import TasksView from "./views/TasksView";
import KnowledgeView from "./views/KnowledgeView";
import InboxView from "./views/InboxView";
import GraphView from "./views/GraphView";
import CodeView from "./views/CodeView";
import TerminalView from "./views/TerminalView";
import TodoistView from "./views/TodoistView";
import SwarmView from "./views/SwarmView";
import RadioView from "./views/RadioView";
import SpotifyView from "./views/SpotifyView";
import AssetsView from "./views/AssetsView";
import SettingsView from "./views/SettingsView";
import { TileConfig } from "./components/AgentTile";
import { pickAgentName } from "./lib/agentNames";
import { AgentRegistry, resolveAgent } from "./lib/agents";
import ToastContainer, { Toast } from "./components/ToastContainer";
import SearchPalette from "./components/SearchPalette";

const VIEW_KEYS: Record<string, ViewKey> = {
  "1": "dashboard",
  "2": "tasks",
  "3": "knowledge",
  "4": "inbox",
  "5": "graph",
  "6": "code",
  "7": "radio",
  "8": "todoist",
  "9": "spotify",
  "0": "swarm",
};

interface TodoistTask {
  id: string;
  content: string;
  checked: boolean;
  due: { date: string; datetime: string | null } | null;
}

let toastCounter = 0;
function newToastId() { return String(++toastCounter); }

let tileCounter = 0;
function nextTileId() { return String(++tileCounter); }


export default function App() {
  const [themeIdx, setThemeIdx] = useState(0);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [orgRoot, setOrgRoot] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<OrgDocument | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(480);
  const termDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [swarmTiles, setSwarmTiles] = useState<TileConfig[]>(() => {
    try {
      const saved = localStorage.getItem("swarmTiles");
      if (!saved) return [];
      const tiles: TileConfig[] = JSON.parse(saved);
      // Drop observer tiles and prompt-only tiles — their PTYs are gone after restart
      const restored = tiles.filter(t => t.title !== "observer");
      tileCounter = restored.reduce((m, t) => Math.max(m, parseInt(t.id) || 0), 0);
      // Clamp persisted positions into visible bounds — viewport may differ from last session
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return restored.map(t => ({
        ...t,
        x: Math.max(0, Math.min(t.x, vw - 100)),
        y: Math.max(0, Math.min(t.y, vh - 60)),
      }));
    } catch {
      return [];
    }
  });
  const maxZRef = useRef(swarmTiles.reduce((m, t) => Math.max(m, t.zIndex), 1));
  const tilePtyIdsRef = useRef<Map<string, number>>(new Map());
  const swarmTilesRef = useRef(swarmTiles);
  useEffect(() => { swarmTilesRef.current = swarmTiles; }, [swarmTiles]);
  const [radioStation, setRadioStation] = useState(0);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioVolume, setRadioVolume] = useState(0.7);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [agentRegistry, setAgentRegistry] = useState<AgentRegistry | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastQueueRef = useRef<{ title: string; body: string }[]>([]);
  const toastDrainRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = useCallback((title: string, body: string) => {
    toastQueueRef.current.push({ title, body });
    if (!toastDrainRef.current) {
      const drain = () => {
        const next = toastQueueRef.current.shift();
        if (next) {
          setToasts(prev => [...prev, { id: newToastId(), title: next.title, body: next.body }]);
        }
        if (toastQueueRef.current.length === 0) {
          clearInterval(toastDrainRef.current!);
          toastDrainRef.current = null;
        }
      };
      drain();
      toastDrainRef.current = setInterval(drain, 700);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Todoist notifications: startup batch (overdue/today) + 60s poll for time-based tasks
  useEffect(() => {
    const notifiedBatch = new Set<string>(); // date-based batch dedup
    const notifiedTime = new Set<string>();  // time-based per-minute dedup

    async function check(isStartup: boolean) {
      try {
        const token = await invoke<string | null>("todoist_get_token");
        if (!token) return;
        const tasks = await invoke<TodoistTask[]>("todoist_get_tasks", { token });
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const nowIso = now.toISOString();
        // Current minute key for time-based dedup
        const minuteKey = now.toISOString().slice(0, 16);

        if (isStartup) {
          // Batch toast for overdue + due today (date-only tasks)
          const overdue: string[] = [];
          const dueToday: string[] = [];
          for (const task of tasks) {
            if (task.checked) continue;
            const due = task.due?.date;
            if (!due || due > today) continue;
            if (notifiedBatch.has(task.id)) continue;
            notifiedBatch.add(task.id);
            if (due < today) overdue.push(task.content);
            else dueToday.push(task.content);
          }
          if (overdue.length > 0) {
            const preview = overdue.slice(0, 3).join(" · ");
            addToast(
              `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
              overdue.length > 3 ? `${preview} +${overdue.length - 3} more` : preview,
            );
          }
          if (dueToday.length > 0) {
            const preview = dueToday.slice(0, 3).join(" · ");
            addToast(
              `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today`,
              dueToday.length > 3 ? `${preview} +${dueToday.length - 3} more` : preview,
            );
          }
        } else {
          // Poll: fire individual toasts for time-based tasks due now
          for (const task of tasks) {
            if (task.checked) continue;
            const dt = task.due?.datetime;
            if (!dt) continue;
            if (dt > nowIso) continue;
            const key = `${task.id}|${minuteKey}`;
            if (notifiedTime.has(key)) continue;
            notifiedTime.add(key);
            addToast(task.content, `Due: ${new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
          }
        }
      } catch { /* no token or network error */ }
    }

    check(true);
    const id = setInterval(() => check(false), 60_000);
    return () => clearInterval(id);
  }, [addToast]);

  const theme = themes[themeIdx];

  const loadDocs = useCallback(async () => {
    try {
      const result = await invoke<OrgDocument[]>("get_documents");
      setDocs(result);
    } catch (e) {
      console.error("Failed to load docs:", e);
    }
  }, []);

  const loadOrgRoot = useCallback(async () => {
    try {
      const root = await invoke<string>("get_org_root");
      setOrgRoot(root);
    } catch (e) {
      console.error("Failed to get org root:", e);
    }
  }, []);

  const loadAgentRegistry = useCallback(async () => {
    try {
      const json = await invoke<string>("read_org_config");
      setAgentRegistry(JSON.parse(json) as AgentRegistry);
    } catch {
      // Falls back to claude defaults when org.config.json is absent
    }
  }, []);

  const handleRegistryChange = useCallback((registry: AgentRegistry) => {
    setAgentRegistry(registry);
  }, []);

  useEffect(() => {
    loadDocs();
    loadOrgRoot();
    loadAgentRegistry();
    const unlisten = listen("org-changed", () => { loadDocs(); loadAgentRegistry(); });
    return () => { unlisten.then(f => f()); };
  }, [loadDocs, loadOrgRoot, loadAgentRegistry]);

  const addBrowserRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;

      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setSearchOpen(o => !o);
      } else if (e.key === "`") {
        setTerminalOpen(o => !o);
      } else if (e.key === "a") {
        setView("assets");
        setSelectedDoc(null);
      } else if (e.key === "s") {
        setView("settings");
        setSelectedDoc(null);
      } else if (e.key === "b") {
        addBrowserRef.current();
      } else if (VIEW_KEYS[e.key]) {
        setView(VIEW_KEYS[e.key]);
        setSelectedDoc(null);
      } else if (e.key === "t") {
        setThemeIdx(i => (i + 1) % themes.length);
      } else if (e.key === "Escape") {
        setSelectedDoc(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("swarmTiles", JSON.stringify(swarmTiles));
  }, [swarmTiles]);

  const addTile = useCallback((taskPath: string | null, _title: string, root: string, promptSuffix?: string, agentId?: string) => {
    const z = ++maxZRef.current;
    const offset = (swarmTiles.length % 8) * 24;
    const agentCfg = resolveAgent(agentId, agentRegistry);
    setSwarmTiles(prev => [...prev, {
      id: nextTileId(),
      title: pickAgentName(agentCfg.id),
      x: 40 + offset,
      y: 40 + offset,
      width: 660,
      height: 420,
      zIndex: z,
      taskPath,
      projectRoot: root,
      promptSuffix,
      agentId: agentCfg.id,
      agentLabel: agentCfg.label,
      launchCmd: agentCfg.launchCmd,
      submitKey: agentCfg.submitKey,
    }]);
  }, [swarmTiles.length, agentRegistry]);

  const onSpawnClaude = useCallback((path: string, title: string, notes?: string, agentId?: string) => {
    addTile(path, title, orgRoot, notes, agentId);
  }, [addTile, orgRoot]);

  const observerRunning = useMemo(
    () => swarmTiles.some(t => t.title === "observer"),
    [swarmTiles],
  );

  const handleTriggerObserver = useCallback(() => {
    if (observerRunning) return;
    const z = ++maxZRef.current;
    const offset = (swarmTiles.length % 8) * 24;
    setSwarmTiles(prev => [...prev, {
      id: nextTileId(),
      title: "observer",
      x: 40 + offset,
      y: 40 + offset,
      width: 660,
      height: 420,
      zIndex: z,
      taskPath: `${orgRoot}/setup/agents/observer.md`,
      projectRoot: orgRoot,
    }]);
    setView("swarm");
  }, [observerRunning, swarmTiles.length, orgRoot]);

  const handleTileUpdate = useCallback((id: string, patch: Partial<Pick<TileConfig, "x" | "y" | "width" | "height">>) => {
    setSwarmTiles(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const handleTileFocus = useCallback((id: string) => {
    const z = ++maxZRef.current;
    setSwarmTiles(prev => prev.map(t => t.id === id ? { ...t, zIndex: z } : t));
  }, []);

  const handleTilePtyReady = useCallback((id: string, ptyId: number) => {
    tilePtyIdsRef.current.set(id, ptyId);
  }, []);

  const handleTileClose = useCallback((id: string) => {
    tilePtyIdsRef.current.delete(id);
    setSwarmTiles(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleAddShell = useCallback(() => {
    setView("swarm");
    addTile(null, "Shell", orgRoot);
  }, [addTile, orgRoot]);

  const handleResetPositions = useCallback(() => {
    setSwarmTiles(prev => prev.map((t, i) => ({
      ...t,
      x: 40 + (i % 8) * 24,
      y: 40 + (i % 8) * 24,
    })));
  }, []);

  const handleAddBrowser = useCallback(() => {
    const z = ++maxZRef.current;
    const offset = (swarmTiles.length % 8) * 24;
    setSwarmTiles(prev => [...prev, {
      id: nextTileId(),
      type: "browser",
      title: "browser",
      x: 40 + offset,
      y: 40 + offset,
      width: 720,
      height: 480,
      zIndex: z,
      taskPath: localStorage.getItem("browser-url") || "https://www.youtube.com",
      projectRoot: orgRoot,
    }]);
    setView("swarm");
  }, [swarmTiles, orgRoot]);
  addBrowserRef.current = handleAddBrowser;

  const getSwarmTargets = useCallback((): { title: string; ptyId: number }[] => {
    return swarmTilesRef.current
      .filter(t => t.type !== "browser" && tilePtyIdsRef.current.has(t.id))
      .sort((a, b) => a.zIndex - b.zIndex) // ascending so last = highest zIndex (most recently focused)
      .map(t => ({ title: t.title, ptyId: tilePtyIdsRef.current.get(t.id)! }));
  }, []);

  const activePaths = useMemo(
    () => new Set(swarmTiles.map(t => t.taskPath).filter(Boolean) as string[]),
    [swarmTiles],
  );

  const viewProps = {
    docs, theme, orgRoot, selectedDoc, setSelectedDoc,
    onSpawnClaude,
    onTriggerObserver: handleTriggerObserver,
    observerRunning,
    onOpenUrl: (url: string) => {
      localStorage.setItem("browser-url", url);
      handleAddBrowser();
    },
    activePaths,
  };

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg, color: theme.text }}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} theme={theme} />
      {searchOpen && (
        <SearchPalette
          docs={docs}
          theme={theme}
          onSelect={doc => { setSelectedDoc(doc); setSearchOpen(false); }}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <Header theme={theme} view={view} orgRoot={orgRoot} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          theme={theme}
          view={view}
          setView={(v) => {
            if (v === "browser") { handleAddBrowser(); return; }
            setView(v);
            setSelectedDoc(null);
          }}
          terminalOpen={terminalOpen}
          toggleTerminal={() => setTerminalOpen(o => !o)}
          swarmCount={swarmTiles.length}
          radioPlaying={radioPlaying}
          spotifyPlaying={spotifyPlaying}
        />
        <main className="flex-1 overflow-hidden" style={{ position: "relative" }}>
          {/* Regular views — unmount when inactive */}
          <div style={{ display: view === "swarm" || view === "radio" || view === "spotify" ? "none" : "flex", flexDirection: "column", height: "100%" }}>
            {view === "dashboard"  && <DashboardView  {...viewProps} />}
            {view === "tasks"      && <TasksView      {...viewProps} />}
            {view === "knowledge"  && <KnowledgeView  {...viewProps} />}
            {view === "inbox"      && <InboxView      {...viewProps} />}
            {view === "graph"      && <GraphView      {...viewProps} />}
            {view === "code"       && <CodeView       {...viewProps} />}
            {view === "assets"     && <AssetsView     {...viewProps} />}
            {view === "todoist"    && <TodoistView     theme={theme} />}
            {view === "settings"   && <SettingsView    theme={theme} agentRegistry={agentRegistry} onRegistryChange={handleRegistryChange} />}
          </div>

          {/* Radio — always mounted so audio persists across view switches */}
          <div style={{
            position: "absolute", inset: 0,
            visibility: view === "radio" ? "visible" : "hidden",
            pointerEvents: view === "radio" ? "auto" : "none",
          }}>
            <RadioView
              theme={theme}
              stationIdx={radioStation}
              setStationIdx={setRadioStation}
              playing={radioPlaying}
              setPlaying={setRadioPlaying}
              volume={radioVolume}
              setVolume={setRadioVolume}
            />
          </div>

          {/* Spotify — always mounted so polling and auth callbacks survive view switches */}
          <div style={{
            position: "absolute", inset: 0,
            visibility: view === "spotify" ? "visible" : "hidden",
            pointerEvents: view === "spotify" ? "auto" : "none",
          }}>
            <SpotifyView
              theme={theme}
              onPlayingChange={setSpotifyPlaying}
            />
          </div>

          {/* Swarm — always mounted so PTY sessions survive view switches */}
          <div style={{
            position: "absolute", inset: 0,
            visibility: view === "swarm" ? "visible" : "hidden",
            pointerEvents: view === "swarm" ? "auto" : "none",
          }}>
            <SwarmView
              theme={theme}
              orgRoot={orgRoot}
              tiles={swarmTiles}
              visible={view === "swarm"}
              onTileUpdate={handleTileUpdate}
              onTileFocus={handleTileFocus}
              onTileClose={handleTileClose}
              onAddShell={handleAddShell}
              onResetPositions={handleResetPositions}
              onAddBrowser={handleAddBrowser}
              onTriggerObserver={handleTriggerObserver}
              observerRunning={observerRunning}
              onTilePtyReady={handleTilePtyReady}
            />
          </div>
        </main>

        {/* Terminal right sidebar — single instance, width hides/shows it */}
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            width: terminalOpen ? terminalWidth : 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "4px",
              flexShrink: 0,
              cursor: "col-resize",
              background: "transparent",
              borderLeft: `1px solid ${theme.border}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.accent; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            onMouseDown={e => {
              e.preventDefault();
              termDragRef.current = { startX: e.clientX, startWidth: terminalWidth };
              const onMove = (ev: MouseEvent) => {
                if (!termDragRef.current) return;
                const delta = termDragRef.current.startX - ev.clientX;
                const next = Math.max(200, Math.min(window.innerWidth * 0.8, termDragRef.current.startWidth + delta));
                setTerminalWidth(next);
              };
              const onUp = () => {
                termDragRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />
          <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
            <TerminalView
              theme={theme}
              orgRoot={orgRoot}
              visible={terminalOpen}
              pendingClaudeTask={null}
              onClaudeTaskHandled={() => {}}
              onRequestOpen={() => setTerminalOpen(true)}
              getSwarmTargets={getSwarmTargets}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
