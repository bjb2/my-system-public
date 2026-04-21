import { useRef, useEffect, useState } from "react";
import { Theme } from "../themes";

interface Station {
  group: string;
  name: string;
  url: string;
}

export const RADIO_STATIONS: Station[] = [
  { group: "Worship",       name: "Air1",                   url: "https://maestro.emfcdn.com/stream_for/air1/airable/aac" },
  { group: "Worship",       name: "K-LOVE",                 url: "https://maestro.emfcdn.com/stream_for/klove/airable/aac" },
  { group: "Ambient",       name: "Lush",                   url: "https://ice1.somafm.com/lush-128-mp3" },
  { group: "Ambient",       name: "Drone Zone",             url: "https://ice1.somafm.com/dronezone-128-mp3" },
  { group: "Ambient",       name: "Deep Space One",         url: "https://ice1.somafm.com/deepspaceone-128-mp3" },
  { group: "Ambient",       name: "Space Station",          url: "https://ice1.somafm.com/spacestation-128-mp3" },
  { group: "Focus",         name: "Groove Salad",           url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { group: "Focus",         name: "Cliqhop IDM",            url: "https://ice1.somafm.com/cliqhop-128-mp3" },
  { group: "Focus",         name: "Beat Blender",           url: "https://ice1.somafm.com/beatblender-128-mp3" },
  { group: "Jazz & Lounge", name: "Illinois Street Lounge", url: "https://ice1.somafm.com/illstreet-128-mp3" },
  { group: "Jazz & Lounge", name: "Sonic Universe",         url: "https://ice1.somafm.com/sonicuniverse-128-mp3" },
  { group: "Jazz & Lounge", name: "Radio Swiss Jazz",       url: "https://stream.srg-ssr.ch/m/rsj/mp3_128" },
  { group: "Classical",     name: "Radio Swiss Classic",    url: "https://stream.srg-ssr.ch/m/rsc_de/mp3_128" },
  { group: "Electronic",    name: "The Trip",               url: "https://ice1.somafm.com/thetrip-128-mp3" },
  { group: "Electronic",    name: "DEF CON Radio",          url: "https://ice1.somafm.com/defcon-128-mp3" },
  { group: "Indie",         name: "Indie Pop Rocks",        url: "https://ice1.somafm.com/indiepop-128-mp3" },
];

interface Props {
  theme: Theme;
  stationIdx: number;
  setStationIdx: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
}

// Single shared audio element — lives for the lifetime of the app
let _audio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement {
  if (!_audio) _audio = new Audio();
  return _audio;
}

export function radioPlay(url: string, volume: number) {
  const audio = getAudio();
  audio.volume = volume;
  audio.src = url;
  audio.play().catch(() => {});
}

export function radioPause() {
  getAudio().pause();
}

export function radioSetVolume(v: number) {
  getAudio().volume = v;
}

export default function RadioView({ theme, stationIdx, setStationIdx, playing, setPlaying, volume, setVolume }: Props) {
  const mounted = useRef(false);
  const [customStations, setCustomStations] = useState<Station[]>([]);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const allStations = [...RADIO_STATIONS, ...customStations];
  const safeIdx = stationIdx < allStations.length ? stationIdx : 0;
  const currentStation = allStations[safeIdx];

  useEffect(() => {
    const audio = getAudio();
    audio.volume = volume;
    mounted.current = true;
  }, []);

  const togglePlay = () => {
    if (playing) {
      radioPause();
      setPlaying(false);
    } else {
      radioPlay(currentStation.url, volume);
      setPlaying(true);
    }
  };

  const selectStation = (i: number) => {
    if (i === safeIdx) {
      togglePlay();
    } else {
      setStationIdx(i);
      if (playing) {
        radioPlay(allStations[i].url, volume);
      }
    }
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    radioSetVolume(v);
  };

  const addCustomStation = () => {
    const name = customName.trim() || customUrl.trim();
    const url = customUrl.trim();
    if (!url) return;
    setCustomStations(prev => [...prev, { group: "Custom", name, url }]);
    setCustomName("");
    setCustomUrl("");
  };

  // Render station list grouped by genre
  const rendered: JSX.Element[] = [];
  let lastGroup = "";
  allStations.forEach((s, i) => {
    if (s.group !== lastGroup) {
      rendered.push(
        <div
          key={`group-${s.group}`}
          className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider"
          style={{ color: theme.textDim }}
        >
          {s.group}
        </div>
      );
      lastGroup = s.group;
    }
    const active = i === safeIdx;
    rendered.push(
      <button
        key={s.url + i}
        onClick={() => selectStation(i)}
        className="w-full flex items-center gap-3 px-4 py-2.5 mb-1 rounded text-left"
        style={{
          background: active ? theme.accentMuted : theme.bgSecondary,
          border: `1px solid ${active ? theme.accent : theme.border}`,
          color: active ? theme.accent : theme.text,
        }}
      >
        <span className="text-sm w-4 text-center flex-shrink-0">
          {active && playing ? "▐▐" : "▶"}
        </span>
        <span className="flex-1 text-sm">{s.name}</span>
        {active && (
          <span className="text-xs" style={{ color: playing ? theme.success : theme.textDim }}>
            {playing ? "● live" : "paused"}
          </span>
        )}
      </button>
    );
  });

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor: theme.border, background: theme.bgSecondary }}>
        <h2 className="text-base font-semibold" style={{ color: theme.accent }}>Radio</h2>
        <p className="text-xs mt-0.5" style={{ color: theme.textDim }}>Air1 · K-LOVE · SomaFM · Radio Swiss · free internet radio</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {rendered}

        <div className="mt-4 mb-2 px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider border-t" style={{ color: theme.textDim, borderColor: theme.border }}>
          Add Stream
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          <input
            type="text"
            placeholder="Name (optional)"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            className="w-full px-3 py-1.5 rounded text-sm"
            style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Stream URL (mp3/aac)"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustomStation()}
              className="flex-1 px-3 py-1.5 rounded text-sm"
              style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
            <button
              onClick={addCustomStation}
              className="px-3 py-1.5 rounded text-xs font-semibold flex-shrink-0"
              style={{ background: theme.accent, color: theme.bg }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-4 px-6 py-3 border-t flex-shrink-0"
        style={{ borderColor: theme.border, background: theme.bgSecondary }}
      >
        <button
          onClick={togglePlay}
          className="px-3 py-1 rounded text-xs font-semibold flex-shrink-0"
          style={{ background: theme.accent, color: theme.bg }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="text-xs truncate" style={{ color: theme.textMuted }}>
          {currentStation.name}
        </span>
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <span className="text-xs" style={{ color: theme.textDim }}>vol</span>
          <input
            type="range" min="0" max="1" step="0.05"
            value={volume}
            onChange={handleVolume}
            className="w-20"
            style={{ accentColor: theme.accent }}
          />
        </div>
      </div>
    </div>
  );
}
