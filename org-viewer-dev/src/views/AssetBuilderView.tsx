import { useEffect, useRef, useState, useCallback } from "react";
import { fabric } from "fabric";
import { invoke } from "@tauri-apps/api/core";
import { Theme } from "../themes";

// ─── Types ───────────────────────────────────────────────────────────────────

type StylePreset = "navy" | "white" | "blue" | "wm-dark" | "wm-light" | "minimal" | "cinema" | "green" | "warm" | "dusk";
type LogoVariant = "wordmark" | "icon";
type SizePreset  = "square" | "portrait" | "story";
type PanelTab    = "design" | "layers";

interface Fields {
  headline: string;
  subtext:  string;
  brand:    string;
}

interface SavedTemplate {
  id:      string;
  name:    string;
  created: string;
}

interface SelProps {
  fill:        string;
  opacity:     number;
  fontSize?:   number;
  fontWeight?: string;
  textAlign?:  string;
  isImage:     boolean;
  rx?:         number;
  stroke?:     string;
  strokeWidth?: number;
  strokeDash?: "solid" | "dash" | "dot";
  isFrame?:    boolean;
  hasClip?:    boolean;
}

interface LayerItem {
  idx:       number;           // display index (0 = topmost)
  name:      string;
  type:      string;
  visible:   boolean;
  fabricObj: fabric.Object;
}

export interface BuilderProps {
  theme:              Theme;
  project:            string;
  assetsDir:          string;
  onClose:            () => void;
  onSaved:            () => void;
  initialCanvasJson?: string;
  initialFilename?:   string;
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","webp","svg","bmp","tiff"]);
const HISTORY_MAX = 20;

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

function guessObjType(obj: fabric.Object): string {
  if (obj instanceof fabric.Textbox || obj instanceof fabric.IText) return "text";
  if (obj instanceof fabric.Image)   return (obj as any)._frameShape ? "framed" : "image";
  if (obj instanceof fabric.Circle)  return (obj as any)._isFrame ? "frame" : "circle";
  if (obj instanceof fabric.Ellipse) return "ellipse";
  if (obj instanceof fabric.Rect)    return (obj as any)._isFrame ? "frame" : "rect";
  if (obj instanceof fabric.Polygon) return "polygon";
  return "shape";
}

function typeIcon(type: string): string {
  switch (type) {
    case "text":    return "T";
    case "image":   return "⬜";
    case "framed":  return "▣";
    case "circle":  return "○";
    case "ellipse": return "⬭";
    case "rect":    return "▭";
    case "polygon": return "⬡";
    case "frame":   return "⊡";
    default:        return "◇";
  }
}

function objDisplayName(obj: fabric.Object): string {
  if ((obj as any)._layerName) return (obj as any)._layerName as string;
  const n = (obj as any).name as string | undefined;
  if (n && n !== "_cropRect") return n;
  return guessObjType(obj);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DISPLAY_W = 520;

const SIZES: Record<SizePreset, { w: number; h: number; label: string }> = {
  square:   { w: 1080, h: 1080, label: "1:1 Feed"   },
  portrait: { w: 1080, h: 1350, label: "4:5 Feed"   },
  story:    { w: 1080, h: 1920, label: "9:16 Story"  },
};

const B = {
  blue:       "#3a39ff",   // design system primary blue
  navy:       "#222325",   // design system dark
  cream:      "#f9f8f6",   // design system off-white 2
  offWhite:   "#f4f3f0",   // design system off-white
  periwinkle: "#7a9afa",   // design system blue text
  green:      "#00a67f",   // design system green fill
  textGreen:  "#008062",   // design system green text
  orange:     "#f8551e",   // design system orange
  textRed:    "#cc3400",   // design system red text
  lavender:   "#ebebff",   // design system lavender fill
  mint:       "#f0fffb",   // design system mint fill
  blush:      "#fcede8",   // design system blush fill
  purple:     "#b819e1",   // design system purple text
  softPurple: "#e580ff",   // design system purple border
};

const STYLE_META: Record<StylePreset, {
  label: string; bg: string; fg: string;
  defaultLogo?: LogoVariant;
  logoTop?: number;       // fraction of h (default 0.76)
  logoWidthFrac?: number; // wordmark width as fraction of w (default 0.38)
  logoLeft?: number;      // absolute px left; undefined = center
}> = {
  navy:       { label: "Navy",        bg: B.navy,    fg: B.cream },
  white:      { label: "White",       bg: "#ffffff", fg: B.navy  },
  blue:       { label: "Blue",        bg: B.blue,    fg: B.cream },
  "wm-dark":  { label: "Brand Dark",  bg: B.navy,    fg: B.cream, defaultLogo: "wordmark", logoTop: 0.10, logoWidthFrac: 0.52 },
  "wm-light": { label: "Brand Light", bg: B.cream,   fg: B.navy,  defaultLogo: "wordmark", logoTop: 0.09, logoWidthFrac: 0.46 },
  minimal:    { label: "Minimal",     bg: "#ffffff", fg: B.navy,  defaultLogo: "wordmark", logoTop: 0.07, logoWidthFrac: 0.44, logoLeft: 100 },
  cinema:     { label: "Cinematic",   bg: "#08080f", fg: B.cream, defaultLogo: "wordmark", logoTop: 0.04, logoWidthFrac: 0.40 },
  green:      { label: "Fresh",       bg: B.green,   fg: "#ffffff" },
  warm:       { label: "Warm",        bg: B.offWhite, fg: B.navy  },
  dusk:       { label: "Dusk",        bg: B.navy,    fg: B.periwinkle },
};

const LOGO_DARK  = "/outgoing-logo-dark.png";
const LOGO_WHITE = "/outgoing-logo-white.png";

const DEFAULTS: Fields = {
  headline: "See what's\nhappening →",
  subtext:  "Events worth showing up for.",
  brand:    "outgoing.world",
};

// ─── Templates ───────────────────────────────────────────────────────────────

function applyNavy(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.navy, () => {});
  canvas.add(new fabric.Ellipse({
    name: "blob1", left: w * 0.52, top: h * -0.08,
    rx: w * 0.52, ry: h * 0.48, fill: B.blue, opacity: 0.40, selectable: true,
  }));
  canvas.add(new fabric.Ellipse({
    name: "blob2", left: -w * 0.08, top: h * 0.76,
    rx: w * 0.24, ry: h * 0.20, fill: B.periwinkle, opacity: 0.22, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.30,
    width: w - 180, fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
    fill: B.cream, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.53,
    width: w - 180, fontSize: 38, fontFamily: "Figtree", fontWeight: "400",
    fill: B.periwinkle, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.85,
    width: w - 180, fontSize: 30, fontFamily: "Figtree", fontWeight: "800",
    fill: B.blue, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyWhite(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor("#ffffff", () => {});
  canvas.add(new fabric.Circle({
    name: "blob1", left: w * 0.40, top: h * -0.18,
    radius: w * 0.56, fill: B.blue, opacity: 0.07, selectable: true,
  }));
  canvas.add(new fabric.Circle({
    name: "blob2", left: -w * 0.10, top: h * 0.74,
    radius: w * 0.22, fill: B.periwinkle, opacity: 0.18, selectable: true,
  }));
  canvas.add(new fabric.Rect({
    name: "topbar", left: 0, top: 0, width: w, height: 10,
    fill: B.blue, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.28,
    width: w - 180, fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
    fill: B.navy, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.52,
    width: w - 180, fontSize: 38, fontFamily: "Figtree", fontWeight: "400",
    fill: B.navy, opacity: 0.55, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.85,
    width: w - 180, fontSize: 30, fontFamily: "Figtree", fontWeight: "800",
    fill: B.blue, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyBlue(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.blue, () => {});
  canvas.add(new fabric.Circle({
    name: "ring", left: w * 0.52, top: h * -0.12,
    radius: w * 0.42, stroke: B.periwinkle, strokeWidth: 60,
    fill: "transparent", opacity: 0.28, selectable: true,
  }));
  canvas.add(new fabric.Circle({
    name: "dot", left: -w * 0.06, top: h * 0.78,
    radius: w * 0.20, fill: B.navy, opacity: 0.16, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.28,
    width: w - 180, fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
    fill: B.cream, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.51,
    width: w - 180, fontSize: 38, fontFamily: "Figtree", fontWeight: "400",
    fill: B.cream, opacity: 0.80, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.87,
    width: w - 180, fontSize: 30, fontFamily: "Figtree", fontWeight: "800",
    fill: B.navy, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyWmDark(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.navy, () => {});
  // glow blob behind wordmark zone
  canvas.add(new fabric.Ellipse({
    name: "blob1", left: w * 0.15, top: -h * 0.04,
    rx: w * 0.70, ry: h * 0.38, fill: B.blue, opacity: 0.28, selectable: true,
  }));
  canvas.add(new fabric.Ellipse({
    name: "blob2", left: -w * 0.06, top: h * 0.78,
    rx: w * 0.22, ry: h * 0.18, fill: B.periwinkle, opacity: 0.18, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.43,
    width: w - 180, fontSize: 84, fontFamily: "Figtree", fontWeight: "800",
    fill: B.cream, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.63,
    width: w - 180, fontSize: 36, fontFamily: "Figtree", fontWeight: "400",
    fill: B.periwinkle, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.85,
    width: w - 180, fontSize: 24, fontFamily: "Figtree", fontWeight: "400",
    fill: B.cream, opacity: 0.30, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyWmLight(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.cream, () => {});
  canvas.add(new fabric.Rect({
    name: "topbar", left: 0, top: 0, width: w, height: 10,
    fill: B.blue, selectable: true,
  }));
  canvas.add(new fabric.Rect({
    name: "btmbar", left: 0, top: h - 10, width: w, height: 10,
    fill: B.blue, selectable: true,
  }));
  // very faint tint circle top-right
  canvas.add(new fabric.Circle({
    name: "tint", left: w * 0.52, top: -h * 0.12,
    radius: w * 0.50, fill: B.blue, opacity: 0.05, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.40,
    width: w - 180, fontSize: 84, fontFamily: "Figtree", fontWeight: "800",
    fill: B.navy, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.60,
    width: w - 180, fontSize: 36, fontFamily: "Figtree", fontWeight: "400",
    fill: B.navy, opacity: 0.50, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.84,
    width: w - 180, fontSize: 26, fontFamily: "Figtree", fontWeight: "800",
    fill: B.blue, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyMinimal(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor("#ffffff", () => {});
  // left accent bar
  canvas.add(new fabric.Rect({
    name: "accentBar", left: 60, top: h * 0.12,
    width: 10, height: h * 0.76,
    fill: B.blue, opacity: 0.85, selectable: true,
  }));
  // small periwinkle circle bottom-right
  canvas.add(new fabric.Circle({
    name: "dot", left: w * 0.78, top: h * 0.82,
    radius: w * 0.12, fill: B.periwinkle, opacity: 0.12, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 100, top: h * 0.30,
    width: w - 160, fontSize: 96, fontFamily: "Figtree", fontWeight: "800",
    fill: B.navy, textAlign: "left", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 100, top: h * 0.57,
    width: w - 160, fontSize: 34, fontFamily: "Figtree", fontWeight: "400",
    fill: B.navy, opacity: 0.52, textAlign: "left", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 100, top: h * 0.83,
    width: w - 160, fontSize: 26, fontFamily: "Figtree", fontWeight: "800",
    fill: B.blue, textAlign: "left", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyCinema(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor("#08080f", () => {});
  // top navy band (wordmark zone)
  canvas.add(new fabric.Rect({
    name: "topBand", left: 0, top: 0, width: w, height: h * 0.155,
    fill: B.navy, selectable: true,
  }));
  // blue rule below top band
  canvas.add(new fabric.Rect({
    name: "rule1", left: 0, top: h * 0.155, width: w, height: 4,
    fill: B.blue, selectable: true,
  }));
  // blue rule near bottom
  canvas.add(new fabric.Rect({
    name: "rule2", left: 0, top: h * 0.90, width: w, height: 4,
    fill: B.blue, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.27,
    width: w - 180, fontSize: 90, fontFamily: "Figtree", fontWeight: "800",
    fill: B.cream, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.54,
    width: w - 180, fontSize: 36, fontFamily: "Figtree", fontWeight: "400",
    fill: B.cream, opacity: 0.65, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.82,
    width: w - 180, fontSize: 26, fontFamily: "Figtree", fontWeight: "800",
    fill: B.blue, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyGreen(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.green, () => {});
  canvas.add(new fabric.Circle({
    name: "blob1", left: w * 0.54, top: -h * 0.10,
    radius: w * 0.48, fill: B.mint, opacity: 0.22, selectable: true,
  }));
  canvas.add(new fabric.Circle({
    name: "blob2", left: -w * 0.10, top: h * 0.76,
    radius: w * 0.24, fill: "#ffffff", opacity: 0.10, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.30,
    width: w - 180, fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
    fill: "#ffffff", textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.53,
    width: w - 180, fontSize: 38, fontFamily: "Figtree", fontWeight: "400",
    fill: B.mint, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.85,
    width: w - 180, fontSize: 30, fontFamily: "Figtree", fontWeight: "800",
    fill: "#ffffff", opacity: 0.70, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyWarm(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.offWhite, () => {});
  // warm orange accent bar
  canvas.add(new fabric.Rect({
    name: "accentBar", left: 0, top: 0, width: w, height: 8,
    fill: B.orange, selectable: true,
  }));
  canvas.add(new fabric.Rect({
    name: "accentBarBtm", left: 0, top: h - 8, width: w, height: 8,
    fill: B.orange, opacity: 0.35, selectable: true,
  }));
  canvas.add(new fabric.Circle({
    name: "blob1", left: w * 0.55, top: -h * 0.12,
    radius: w * 0.44, fill: B.blush, opacity: 0.55, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.30,
    width: w - 180, fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
    fill: B.navy, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.53,
    width: w - 180, fontSize: 38, fontFamily: "Figtree", fontWeight: "400",
    fill: B.navy, opacity: 0.55, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.85,
    width: w - 180, fontSize: 30, fontFamily: "Figtree", fontWeight: "800",
    fill: B.orange, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

function applyDusk(canvas: fabric.Canvas, f: Fields, sz: SizePreset) {
  const { w, h } = SIZES[sz];
  canvas.clear();
  canvas.setBackgroundColor(B.navy, () => {});
  canvas.add(new fabric.Ellipse({
    name: "blob1", left: w * 0.48, top: -h * 0.06,
    rx: w * 0.56, ry: h * 0.44, fill: B.purple, opacity: 0.18, selectable: true,
  }));
  canvas.add(new fabric.Ellipse({
    name: "blob2", left: -w * 0.10, top: h * 0.74,
    rx: w * 0.30, ry: h * 0.22, fill: B.softPurple, opacity: 0.14, selectable: true,
  }));
  canvas.add(new fabric.Textbox(f.headline || DEFAULTS.headline, {
    name: "headline", left: 90, top: h * 0.30,
    width: w - 180, fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
    fill: "#ffffff", textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.subtext || DEFAULTS.subtext, {
    name: "subtext", left: 90, top: h * 0.53,
    width: w - 180, fontSize: 38, fontFamily: "Figtree", fontWeight: "400",
    fill: B.periwinkle, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.add(new fabric.Textbox(f.brand || DEFAULTS.brand, {
    name: "brand", left: 90, top: h * 0.85,
    width: w - 180, fontSize: 30, fontFamily: "Figtree", fontWeight: "800",
    fill: B.softPurple, textAlign: "center", selectable: true, editable: true,
  }));
  canvas.renderAll();
}

const TEMPLATES: Record<StylePreset, (c: fabric.Canvas, f: Fields, s: SizePreset) => void> = {
  navy: applyNavy, white: applyWhite, blue: applyBlue,
  "wm-dark": applyWmDark, "wm-light": applyWmLight, minimal: applyMinimal, cinema: applyCinema,
  green: applyGreen, warm: applyWarm, dusk: applyDusk,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AssetBuilderView({ theme, assetsDir, onClose, onSaved, initialCanvasJson, initialFilename }: BuilderProps) {
  const canvasElRef   = useRef<HTMLCanvasElement>(null);
  const fabricRef     = useRef<fabric.Canvas | null>(null);
  const fontLoadedRef = useRef(false);
  const sizeRef       = useRef<SizePreset>("square");
  const styleRef      = useRef<StylePreset>("navy");

  // history
  const historyRef    = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  // crop
  const cropTargetRef  = useRef<fabric.Image | null>(null);
  const cropOverlayRef = useRef<fabric.Rect | null>(null);

  // frame pan
  const framePanTargetRef   = useRef<fabric.Image | null>(null);
  const framePanOrigClipRef = useRef<fabric.Object | null>(null);
  const framePanOverlayRef  = useRef<fabric.Object | null>(null);

  // logo
  const activeLogoRef = useRef<LogoVariant | null>(null);

  // suppress sidebar→canvas sync while user types directly on canvas
  const canvasEditingRef = useRef(false);

  // suppress object:removed field-clear during template switches
  const applyingTemplateRef = useRef(false);

  // photo drop
  const dragCounterRef   = useRef(0);
  const dragLayerIdxRef  = useRef(-1);

  // ── State ─────────────────────────────────────────────────────────────────
  const [style,         setStyle]        = useState<StylePreset>("navy");
  const [size,          setSize]         = useState<SizePreset>("square");
  const [fields,        setFields]       = useState<Fields>(DEFAULTS);
  const [selProps,      setSelProps]     = useState<SelProps | null>(null);
  const [platform,      setPlatform]     = useState("facebook");
  const [filename,      setFilename]     = useState(initialFilename ?? "identity-card-v1.png");
  const [saving,        setSaving]       = useState(false);
  const [feedback,      setFeedback]     = useState<string | null>(null);
  const [fontReady,     setFontReady]    = useState(false);
  const [activeLogo,    setActiveLogo]   = useState<LogoVariant | null>(null);
  const [panelTab,      setPanelTab]     = useState<PanelTab>("design");
  const [layers,        setLayers]       = useState<LayerItem[]>([]);
  const [isDroppingPhoto, setIsDroppingPhoto] = useState(false);
  const [dragOverIdx,   setDragOverIdx]  = useState(-1);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [savingTemplate,  setSavingTemplate] = useState(false);
  const [cropMode,      setCropMode]     = useState(false);
  const [framePanMode,  setFramePanMode] = useState(false);
  const [canUndo,       setCanUndo]      = useState(false);
  const [canRedo,       setCanRedo]      = useState(false);
  const [generating,    setGenerating]   = useState(false);
  const [bgColor,       setBgColor]      = useState("#131354");
  const [starPoints,    setStarPoints]   = useState(5);

  // keep refs in sync
  useEffect(() => { sizeRef.current  = size;  }, [size]);
  useEffect(() => { styleRef.current = style; }, [style]);

  // ── Font loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (fontLoadedRef.current) { setFontReady(true); return; }
    const id = "figtree-font-css";
    const doLoad = () =>
      Promise.all([
        document.fonts.load("800 20px Figtree"),
        document.fonts.load("400 20px Figtree"),
      ]).then(() => { fontLoadedRef.current = true; setFontReady(true); });
    if (document.getElementById(id)) { doLoad(); return; }
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;800&display=swap";
    link.onload = doLoad;
    document.head.appendChild(link);
  }, []);

  // ── Canvas init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fontReady || !canvasElRef.current || fabricRef.current) return;

    const { w, h } = SIZES[size];
    const zoom = DISPLAY_W / w;
    const fc = new fabric.Canvas(canvasElRef.current, { width: w, height: h });
    fabricRef.current = fc;

    fc.on("selection:created", (e: fabric.IEvent & { selected?: fabric.Object[] }) => syncSel(e.selected?.[0]));
    fc.on("selection:updated", (e: fabric.IEvent & { selected?: fabric.Object[] }) => syncSel(e.selected?.[0]));
    fc.on("selection:cleared", () => setSelProps(null));
    fc.on("object:added",      () => syncLayersFromRef());
    fc.on("object:removed",    (e: any) => {
      syncLayersFromRef();
      if (applyingTemplateRef.current) return;
      const name = e.target ? (e.target as any).name as string : "";
      if (name === "headline" || name === "subtext" || name === "brand") {
        setFields(f => ({ ...f, [name]: "" }));
      }
    });
    fc.on("object:modified",   () => { pushHistoryFromRef(); syncLayersFromRef(); });
    fc.on("text:editing:entered", () => { canvasEditingRef.current = true; });
    fc.on("text:editing:exited",  (e: any) => {
      canvasEditingRef.current = false;
      const obj  = e.target;
      if (!obj) return;
      const name = (obj as any).name as string;
      const text = (obj as fabric.Textbox).text ?? "";
      if (name === "headline" || name === "subtext" || name === "brand") {
        setFields(f => ({ ...f, [name]: text }));
      }
    });
    fc.on("text:changed",      (e: any) => {
      const obj  = e.target;
      if (!obj) return;
      const name = (obj as any).name as string;
      const text = (obj as fabric.Textbox).text ?? "";
      if (name === "headline" || name === "subtext" || name === "brand") {
        setFields(f => ({ ...f, [name]: text }));
      }
    });
    // Manual double-click: mouse:dblclick in Fabric v5 gets target from _currentTransform
    // (last drag), not findTarget — so click-without-drag gives null. Use mouse:down timing instead.
    let dblTapTime = 0;
    // ── Alignment guides ─────────────────────────────────────────────────────
    const SNAP_THRESHOLD = 6; // pixels in display space
    interface Guide { x?: number; y?: number }
    let activeGuides: Guide[] = [];

    fc.on("object:moving", (e: any) => {
      const obj = e.target as fabric.Object;
      if (!obj) return;

      const cw = fc.getWidth();
      const ch = fc.getHeight();
      const zoom = fc.getZoom();
      const threshold = SNAP_THRESHOLD / zoom;

      const objLeft   = obj.left!;
      const objTop    = obj.top!;
      const objW      = (obj.getScaledWidth  ? obj.getScaledWidth()  : obj.width!  * (obj.scaleX ?? 1));
      const objH      = (obj.getScaledHeight ? obj.getScaledHeight() : obj.height! * (obj.scaleY ?? 1));
      const cxObj     = objLeft + objW / 2;
      const cyObj     = objTop  + objH / 2;
      const rObj      = objLeft + objW;
      const bObj      = objTop  + objH;

      const canvasCX  = cw / zoom / 2;
      const canvasCY  = ch / zoom / 2;

      const guides: Guide[] = [];
      let snapLeft = objLeft;
      let snapTop  = objTop;

      // Canvas center guides
      if (Math.abs(cxObj - canvasCX) < threshold) {
        snapLeft = canvasCX - objW / 2;
        guides.push({ x: canvasCX });
      }
      if (Math.abs(cyObj - canvasCY) < threshold) {
        snapTop = canvasCY - objH / 2;
        guides.push({ y: canvasCY });
      }
      // Canvas edge guides
      if (Math.abs(objLeft) < threshold) {
        snapLeft = 0; guides.push({ x: 0 });
      } else if (Math.abs(rObj - cw / zoom) < threshold) {
        snapLeft = cw / zoom - objW; guides.push({ x: cw / zoom });
      }
      if (Math.abs(objTop) < threshold) {
        snapTop = 0; guides.push({ y: 0 });
      } else if (Math.abs(bObj - ch / zoom) < threshold) {
        snapTop = ch / zoom - objH; guides.push({ y: ch / zoom });
      }

      // Other object alignment guides
      const others = fc.getObjects().filter(o => o !== obj && !(o as any)._isFrameBorder);
      for (const other of others) {
        const oLeft  = other.left!;
        const oTop   = other.top!;
        const oW     = (other.getScaledWidth  ? other.getScaledWidth()  : other.width!  * (other.scaleX ?? 1));
        const oH     = (other.getScaledHeight ? other.getScaledHeight() : other.height! * (other.scaleY ?? 1));
        const ocx    = oLeft + oW / 2;
        const ocy    = oTop  + oH / 2;
        const oRight = oLeft + oW;
        const oBot   = oTop  + oH;

        // Center-to-center X
        if (Math.abs(cxObj - ocx) < threshold) {
          snapLeft = ocx - objW / 2; guides.push({ x: ocx });
        }
        // Center-to-center Y
        if (Math.abs(cyObj - ocy) < threshold) {
          snapTop = ocy - objH / 2; guides.push({ y: ocy });
        }
        // Left edge alignment
        if (Math.abs(objLeft - oLeft) < threshold) {
          snapLeft = oLeft; guides.push({ x: oLeft });
        } else if (Math.abs(objLeft - oRight) < threshold) {
          snapLeft = oRight; guides.push({ x: oRight });
        } else if (Math.abs(rObj - oLeft) < threshold) {
          snapLeft = oLeft - objW; guides.push({ x: oLeft });
        } else if (Math.abs(rObj - oRight) < threshold) {
          snapLeft = oRight - objW; guides.push({ x: oRight });
        }
        // Top edge alignment
        if (Math.abs(objTop - oTop) < threshold) {
          snapTop = oTop; guides.push({ y: oTop });
        } else if (Math.abs(objTop - oBot) < threshold) {
          snapTop = oBot; guides.push({ y: oBot });
        } else if (Math.abs(bObj - oTop) < threshold) {
          snapTop = oTop - objH; guides.push({ y: oTop });
        } else if (Math.abs(bObj - oBot) < threshold) {
          snapTop = oBot - objH; guides.push({ y: oBot });
        }
      }

      obj.set({ left: snapLeft, top: snapTop });
      activeGuides = guides;
      fc.renderAll();
    });

    fc.on("object:modified", () => { activeGuides = []; fc.renderAll(); });
    fc.on("mouse:up",        () => { activeGuides = []; fc.renderAll(); });

    fc.on("after:render", () => {
      if (!activeGuides.length) return;
      const ctx  = fc.getContext();
      const zoom = fc.getZoom();
      const cw   = fc.getWidth();
      const ch   = fc.getHeight();

      ctx.save();
      ctx.strokeStyle = "rgba(0,200,255,0.85)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);

      // deduplicate
      const seenX = new Set<number>();
      const seenY = new Set<number>();
      for (const g of activeGuides) {
        if (g.x !== undefined && !seenX.has(g.x)) {
          seenX.add(g.x);
          const px = g.x * zoom;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, ch);
          ctx.stroke();
        }
        if (g.y !== undefined && !seenY.has(g.y)) {
          seenY.add(g.y);
          const py = g.y * zoom;
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(cw, py);
          ctx.stroke();
        }
      }
      ctx.restore();
    });

    let dblTapTarget: fabric.Object | null = null;
    fc.on("mouse:down", (e: any) => {
      const now = Date.now();
      const target = e.target ?? null;
      if (target && target === dblTapTarget && now - dblTapTime < 350) {
        if (target instanceof fabric.Image && (target as any)._frameBounds && target.clipPath) {
          enterFramePanMode(target as fabric.Image);
        }
        dblTapTarget = null; dblTapTime = 0;
      } else {
        dblTapTarget = target; dblTapTime = now;
      }
    });

    if (initialCanvasJson) {
      const parsed = JSON.parse(initialCanvasJson) as {
        version: number; style: StylePreset; size: SizePreset;
        fields: Fields; activeLogo: LogoVariant | null; canvas: object;
      };
      const lSize  = parsed.size  ?? "square";
      const lStyle = parsed.style ?? "navy";
      const { w: lw, h: lh } = SIZES[lSize];
      const lZoom = DISPLAY_W / lw;
      fc.setWidth(lw); fc.setHeight(lh);
      fc.loadFromJSON(parsed.canvas, () => {
        fc.setZoom(lZoom);
        fc.setWidth(DISPLAY_W);
        fc.setHeight(Math.round(lh * lZoom));
        fc.renderAll();
        syncLayersFromRef();
        pushHistoryFromRef();
      });
      setStyle(lStyle);
      setSize(lSize);
      setFields(parsed.fields ?? DEFAULTS);
      setActiveLogo(parsed.activeLogo ?? null);
      setBgColor((parsed.canvas as any)?.background ?? STYLE_META[lStyle]?.bg ?? "#131354");
      activeLogoRef.current = parsed.activeLogo ?? null;
      sizeRef.current        = lSize;
      styleRef.current       = lStyle;
      prevTemplateRef.current = `${lStyle}|${lSize}`;
    } else {
      applyingTemplateRef.current = true;
      TEMPLATES[style](fc, fields, size);
      applyingTemplateRef.current = false;
      fc.setZoom(zoom);
      fc.setWidth(DISPLAY_W);
      fc.setHeight(Math.round(h * zoom));
      fc.renderAll();
      syncLayersFromRef();
      pushHistoryFromRef();
    }

    return () => { fc.dispose(); fabricRef.current = null; };
  }, [fontReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Template re-apply on style/size change ────────────────────────────────
  const prevTemplateRef = useRef("");
  useEffect(() => {
    const key = `${style}|${size}`;
    if (key === prevTemplateRef.current || !fabricRef.current || !fontReady) return;
    prevTemplateRef.current = key;

    const fc = fabricRef.current;
    const { w, h } = SIZES[size];
    const zoom = DISPLAY_W / w;

    applyingTemplateRef.current = true;
    TEMPLATES[style](fc, fields, size);
    applyingTemplateRef.current = false;
    setBgColor(STYLE_META[style].bg);
    fc.setZoom(zoom);
    fc.setWidth(DISPLAY_W);
    fc.setHeight(Math.round(h * zoom));
    fc.renderAll();
    setSelProps(null);
    setCropMode(false);
    cropTargetRef.current  = null;
    cropOverlayRef.current = null;

    syncLayersFromRef();
    pushHistoryFromRef();

    const styleMeta = STYLE_META[style];
    if (styleMeta.defaultLogo) {
      addLogoToCanvas(styleMeta.defaultLogo, size);
    } else if (activeLogoRef.current) {
      addLogoToCanvas(activeLogoRef.current, size);
    }
  }, [style, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync text fields → canvas ─────────────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || canvasEditingRef.current) return;
    let dirty = false;
    fc.getObjects().forEach(obj => {
      const tb  = obj as fabric.Textbox;
      const nm  = (obj as any).name as string;
      const val = nm === "headline" ? (fields.headline || DEFAULTS.headline)
                : nm === "subtext"  ? (fields.subtext  || DEFAULTS.subtext)
                : nm === "brand"    ? (fields.brand     || DEFAULTS.brand)
                : null;
      if (val !== null && tb.text !== val) { tb.set({ text: val }); dirty = true; }
    });
    if (dirty) fc.renderAll();
  }, [fields]);

  // ── Templates: load manifest on mount ─────────────────────────────────────
  useEffect(() => {
    invoke<string>("read_file", { path: `${assetsDir}/templates/manifest.json` })
      .then(json => { try { setSavedTemplates(JSON.parse(json) as SavedTemplate[]); } catch {} })
      .catch(() => {});
  }, [assetsDir]);

  // ── Templates: save current canvas as a named template ───────────────────
  const handleSaveTemplate = useCallback(async () => {
    const name = window.prompt("Template name:");
    if (!name?.trim()) return;
    const fc = fabricRef.current;
    if (!fc) return;
    setSavingTemplate(true);
    try {
      const id = `tpl-${Date.now()}`;
      const canvasData = fc.toJSON(["name", "_layerName", "clipPath", "_frameBounds", "_frameShape", "_isFrame", "_isFrameBorder", "_borderForImg", "_borderObjName"]);
      const entry = { version: 1, style, size, fields, activeLogo, canvas: canvasData };
      const tplPath = `${assetsDir}/templates/${id}.canvas.json`;
      await invoke("write_file", { path: tplPath, content: JSON.stringify(entry, null, 2) });
      const next: SavedTemplate[] = [...savedTemplates, { id, name: name.trim(), created: new Date().toISOString() }];
      await invoke("write_file", { path: `${assetsDir}/templates/manifest.json`, content: JSON.stringify(next, null, 2) });
      setSavedTemplates(next);
    } finally {
      setSavingTemplate(false);
    }
  }, [assetsDir, style, size, fields, activeLogo, savedTemplates]);

  // ── Templates: load a saved template into the canvas ─────────────────────
  const handleLoadTemplate = useCallback(async (tpl: SavedTemplate) => {
    const fc = fabricRef.current;
    if (!fc || !fontReady) return;
    try {
      const json = await invoke<string>("read_file", { path: `${assetsDir}/templates/${tpl.id}.canvas.json` });
      const parsed = JSON.parse(json) as { version: number; style: StylePreset; size: SizePreset; fields: Fields; activeLogo: LogoVariant | null; canvas: object };
      const lStyle = parsed.style ?? "navy";
      const lSize  = parsed.size  ?? "square";
      const { w: lw, h: lh } = SIZES[lSize];
      const lZoom = DISPLAY_W / lw;
      prevTemplateRef.current = `${lStyle}|${lSize}`;
      applyingTemplateRef.current = true;
      fc.loadFromJSON(parsed.canvas, () => {
        applyingTemplateRef.current = false;
        fc.setZoom(lZoom);
        fc.setWidth(DISPLAY_W);
        fc.setHeight(Math.round(lh * lZoom));
        fc.renderAll();
        syncLayersFromRef();
        pushHistoryFromRef();
      });
      setStyle(lStyle);
      setSize(lSize);
      setFields(parsed.fields ?? DEFAULTS);
      setActiveLogo(parsed.activeLogo ?? null);
      setBgColor((parsed.canvas as any)?.background ?? STYLE_META[lStyle]?.bg ?? B.navy);
      activeLogoRef.current = parsed.activeLogo ?? null;
      sizeRef.current = lSize;
      styleRef.current = lStyle;
      setSelProps(null);
      setCropMode(false);
      cropTargetRef.current  = null;
      cropOverlayRef.current = null;
    } catch (err) {
      setFeedback(`Failed to load template: ${err}`);
      setTimeout(() => setFeedback(null), 4000);
    }
  }, [assetsDir, fontReady]);

  // ── Templates: delete a saved template ───────────────────────────────────
  const handleDeleteTemplate = useCallback(async (tpl: SavedTemplate) => {
    const next = savedTemplates.filter(t => t.id !== tpl.id);
    await invoke("write_file", { path: `${assetsDir}/templates/manifest.json`, content: JSON.stringify(next, null, 2) });
    setSavedTemplates(next);
  }, [assetsDir, savedTemplates]);

  // ── History ───────────────────────────────────────────────────────────────
  function pushHistoryFromRef() {
    const fc = fabricRef.current;
    if (!fc) return;
    const snap = JSON.stringify(fc.toJSON(["name", "_layerName", "clipPath", "_frameBounds", "_frameShape", "_isFrame", "_isFrameBorder", "_borderForImg", "_borderObjName"]));
    const h = historyRef.current;
    const idx = historyIdxRef.current;
    // truncate redo branch
    h.splice(idx + 1);
    h.push(snap);
    if (h.length > HISTORY_MAX) h.shift();
    historyIdxRef.current = h.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  }

  function restoreSnapshot(snap: string) {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.loadFromJSON(snap, () => {
      const { w, h } = SIZES[sizeRef.current];
      const zoom = DISPLAY_W / w;
      fc.setZoom(zoom);
      fc.setWidth(DISPLAY_W);
      fc.setHeight(Math.round(h * zoom));
      fc.renderAll();
      syncLayersFromRef();
      setSelProps(null);
      setCropMode(false);
      cropTargetRef.current  = null;
      cropOverlayRef.current = null;
    });
  }

  function undo() {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    restoreSnapshot(historyRef.current[historyIdxRef.current]);
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
  }

  function redo() {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    restoreSnapshot(historyRef.current[historyIdxRef.current]);
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  }

  // ── Layer management ──────────────────────────────────────────────────────
  const syncLayersFromRef = useCallback(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    const objs = fc.getObjects().filter(o =>
      (o as any).name !== "_cropRect" && !(o as any)._isFrameBorder
    );
    setLayers(
      [...objs].reverse().map((obj, i) => ({
        idx:       i,
        name:      objDisplayName(obj),
        type:      guessObjType(obj),
        visible:   obj.visible !== false,
        fabricObj: obj,
      }))
    );
  }, []);

  function handleLayerSelect(layer: LayerItem) {
    const fc = fabricRef.current;
    if (!fc || cropMode) return;
    fc.setActiveObject(layer.fabricObj);
    fc.renderAll();
    syncSel(layer.fabricObj);
    setPanelTab("design");
  }

  function handleLayerVisibility(layer: LayerItem, visible: boolean) {
    layer.fabricObj.set({ visible });
    fabricRef.current?.renderAll();
    syncLayersFromRef();
  }

  function handleLayerRename(layer: LayerItem, name: string) {
    (layer.fabricObj as any)._layerName = name;
    syncLayersFromRef();
  }

  function handleLayerMove(layer: LayerItem, dir: "up" | "down") {
    const fc = fabricRef.current;
    if (!fc) return;
    if (dir === "up") layer.fabricObj.bringForward();
    else layer.fabricObj.sendBackwards();
    fc.renderAll();
    syncLayersFromRef();
    pushHistoryFromRef();
  }

  function handleLayerDelete(layer: LayerItem) {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.remove(layer.fabricObj);
    if ((layer.name === "logo" || (layer.fabricObj as any).name === "logo")) {
      activeLogoRef.current = null;
      setActiveLogo(null);
    }
    fc.renderAll();
    pushHistoryFromRef();
  }

  function handleLayerReorder(fromDisplayIdx: number, toDisplayIdx: number) {
    const fc = fabricRef.current;
    if (!fc || fromDisplayIdx === toDisplayIdx) return;
    const objs  = fc.getObjects().filter(o => (o as any).name !== "_cropRect");
    const total = objs.length;
    const toCanvasIdx = total - 1 - toDisplayIdx;
    fc.moveTo(layers[fromDisplayIdx].fabricObj, toCanvasIdx);
    fc.renderAll();
    syncLayersFromRef();
    pushHistoryFromRef();
  }

  // ── Background color ─────────────────────────────────────────────────────
  function applyBgColor(color: string) {
    const fc = fabricRef.current;
    if (!fc) return;
    setBgColor(color);
    fc.setBackgroundColor(color, () => { fc.renderAll(); pushHistoryFromRef(); });
  }

  // ── Add objects ───────────────────────────────────────────────────────────
  function addTextObject() {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const tb = new fabric.Textbox("New text", {
      name: `text_${Date.now()}`,
      left: w * 0.2, top: h * 0.4, width: w * 0.6,
      fontSize: 52, fontFamily: "Figtree", fontWeight: "400",
      fill: styleRef.current === "white" ? B.navy : B.cream,
      selectable: true, editable: true,
    });
    fc.add(tb);
    fc.setActiveObject(tb);
    fc.renderAll();
    syncSel(tb);
    pushHistoryFromRef();
  }

  function addRectObject() {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const r = new fabric.Rect({
      name: `rect_${Date.now()}`,
      left: w * 0.25, top: h * 0.35, width: w * 0.5, height: h * 0.15,
      fill: B.blue, opacity: 0.8, rx: 20, ry: 20, selectable: true,
    });
    fc.add(r);
    fc.setActiveObject(r);
    fc.renderAll();
    syncSel(r);
    pushHistoryFromRef();
  }

  function addCircleObject() {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const c = new fabric.Circle({
      name: `circle_${Date.now()}`,
      left: w * 0.35, top: h * 0.35, radius: w * 0.15,
      fill: B.blue, opacity: 0.85, selectable: true,
    });
    fc.add(c); fc.setActiveObject(c); fc.renderAll();
    syncSel(c); pushHistoryFromRef();
  }

  function addEllipseObject() {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const el = new fabric.Ellipse({
      name: `ellipse_${Date.now()}`,
      left: w * 0.25, top: h * 0.38, rx: w * 0.25, ry: h * 0.12,
      fill: B.blue, opacity: 0.85, selectable: true,
    });
    fc.add(el); fc.setActiveObject(el); fc.renderAll();
    syncSel(el); pushHistoryFromRef();
  }

  function addStarObject(pts: number) {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const cx = w / 2, cy = h / 2;
    const outerR = w * 0.2, innerR = outerR * 0.42;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < pts * 2; i++) {
      const angle = (i * Math.PI / pts) - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    const star = new fabric.Polygon(points, {
      name: `star_${Date.now()}`, fill: B.blue, opacity: 0.85, selectable: true,
    });
    fc.add(star); fc.setActiveObject(star); fc.renderAll();
    syncSel(star); pushHistoryFromRef();
  }

  function addPolygonObject(sides: number) {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const cx = w / 2, cy = h / 2;
    const r = w * 0.2;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    const poly = new fabric.Polygon(points, {
      name: `polygon_${Date.now()}`, fill: B.blue, opacity: 0.85, selectable: true,
    });
    fc.add(poly); fc.setActiveObject(poly); fc.renderAll();
    syncSel(poly); pushHistoryFromRef();
  }

  function addFrameObject(shape: "circle" | "rect") {
    const fc = fabricRef.current;
    if (!fc) return;
    const { w, h } = SIZES[sizeRef.current];
    const frameSz = w * 0.5;
    const fl = w * 0.25, ft = h * 0.28;
    let obj: fabric.Object;
    if (shape === "circle") {
      obj = new fabric.Circle({
        name: `frame_${Date.now()}`, left: fl, top: ft, radius: frameSz / 2,
        fill: "rgba(120,130,220,0.15)", stroke: "", strokeWidth: 0, selectable: true,
      });
    } else {
      const fh = h * 0.38;
      obj = new fabric.Rect({
        name: `frame_${Date.now()}`, left: fl, top: ft, width: frameSz, height: fh,
        rx: 60, ry: 60, fill: "rgba(120,130,220,0.15)",
        stroke: "", strokeWidth: 0, selectable: true,
      });
    }
    (obj as any)._isFrame = true;
    fc.add(obj); fc.setActiveObject(obj); fc.renderAll();
    syncSel(obj); pushHistoryFromRef();
  }

  // ── Frame fill helpers ────────────────────────────────────────────────────
  function addFrameBorderCompanion(fc: fabric.Canvas, img: fabric.Image, shape: "circle" | "rect") {
    const bounds = (img as any)._frameBounds as any;
    const borderName = `frame_border_${(img as any).name}`;
    // Remove any pre-existing companion for this image
    const existing = fc.getObjects().find(o => (o as any).name === borderName);
    if (existing) fc.remove(existing);
    let border: fabric.Object;
    if (shape === "circle") {
      border = new fabric.Circle({
        name: borderName, left: bounds.cx - bounds.r, top: bounds.cy - bounds.r,
        radius: bounds.r, fill: "transparent", stroke: "", strokeWidth: 0,
        selectable: false, evented: false,
      });
    } else {
      border = new fabric.Rect({
        name: borderName, left: bounds.left, top: bounds.top,
        width: bounds.width, height: bounds.height,
        rx: bounds.rx, ry: bounds.ry,
        fill: "transparent", stroke: "", strokeWidth: 0,
        selectable: false, evented: false,
      });
    }
    (border as any)._isFrameBorder = true;
    (border as any)._borderForImg  = (img as any).name;
    (img as any)._borderObjName    = borderName;
    fc.add(border);
    fc.bringToFront(border);
  }

  function fillCircleFrame(img: fabric.Image, cx: number, cy: number, r: number) {
    const imgW = img.width ?? 200, imgH = img.height ?? 200;
    const cov  = Math.max((r * 2) / imgW, (r * 2) / imgH);
    const newW = imgW * cov, newH = imgH * cov;
    img.set({ name: `framed_${Date.now()}`, scaleX: cov, scaleY: cov,
               left: cx - newW / 2, top: cy - newH / 2, selectable: true });
    const clipR = r / cov;
    img.set({ clipPath: new fabric.Circle({ left: -clipR, top: -clipR, radius: clipR }) });
    (img as any)._frameShape  = "circle";
    (img as any)._frameBounds = { cx, cy, r };
  }

  function fillRectFrame(img: fabric.Image, fl: number, ft: number, fw: number, fh: number, frx: number, fry: number) {
    const imgW = img.width ?? 200, imgH = img.height ?? 200;
    const cov  = Math.max(fw / imgW, fh / imgH);
    const newW = imgW * cov, newH = imgH * cov;
    img.set({ name: `framed_${Date.now()}`, scaleX: cov, scaleY: cov,
               left: fl + fw / 2 - newW / 2, top: ft + fh / 2 - newH / 2, selectable: true });
    const clip = new fabric.Rect({
      left:   (fl - (img.left ?? 0)) / cov - imgW / 2,
      top:    (ft - (img.top  ?? 0)) / cov - imgH / 2,
      width: fw / cov, height: fh / cov, rx: frx / cov, ry: fry / cov,
    });
    img.set({ clipPath: clip });
    (img as any)._frameShape  = "rect";
    (img as any)._frameBounds = { left: fl, top: ft, width: fw, height: fh, rx: frx, ry: fry };
  }

  function applyFrameFillCircle(fc: fabric.Canvas, img: fabric.Image, frame: fabric.Circle) {
    const b = frame.getBoundingRect(true);
    fillCircleFrame(img, b.left + b.width / 2, b.top + b.height / 2, b.width / 2);
    fc.remove(frame); fc.add(img);
    addFrameBorderCompanion(fc, img, "circle");
    fc.setActiveObject(img); fc.renderAll();
  }

  function applyFrameFillRect(fc: fabric.Canvas, img: fabric.Image, frame: fabric.Rect) {
    const b = frame.getBoundingRect(true);
    fillRectFrame(img, b.left, b.top, b.width, b.height,
      (frame.rx ?? 0) * (frame.scaleX ?? 1), (frame.ry ?? 0) * (frame.scaleY ?? 1));
    fc.remove(frame); fc.add(img);
    addFrameBorderCompanion(fc, img, "rect");
    fc.setActiveObject(img); fc.renderAll();
  }

  // ── Frame pan mode ────────────────────────────────────────────────────────
  // Uses absolutePositioned clip: frame window fixed in canvas space, image moves freely underneath.
  // User sees only what's inside the frame boundary as they reposition.
  function enterFramePanMode(img: fabric.Image) {
    const fc = fabricRef.current;
    if (!fc || !(img as any)._frameBounds) return;
    framePanTargetRef.current   = img;
    framePanOrigClipRef.current = img.clipPath ?? null;

    const bounds = (img as any)._frameBounds as any;
    const shape  = (img as any)._frameShape  as "circle" | "rect";
    const zoom   = fc.getZoom();
    const dW = 14 / zoom, dG = 7 / zoom;

    // absolutePositioned: true — clip stays fixed in canvas space; image drags under it
    let absClip: fabric.Object;
    let overlay: fabric.Object;
    if (shape === "circle") {
      absClip = new fabric.Circle({
        left: bounds.cx - bounds.r, top: bounds.cy - bounds.r, radius: bounds.r,
        absolutePositioned: true,
      });
      overlay = new fabric.Circle({
        name: "_framePanOverlay",
        left: bounds.cx - bounds.r, top: bounds.cy - bounds.r, radius: bounds.r,
        fill: "transparent", stroke: B.periwinkle,
        strokeWidth: 2 / zoom, strokeDashArray: [dW, dG],
        selectable: false, evented: false,
      });
    } else {
      absClip = new fabric.Rect({
        left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
        rx: bounds.rx, ry: bounds.ry, absolutePositioned: true,
      });
      overlay = new fabric.Rect({
        name: "_framePanOverlay",
        left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
        rx: bounds.rx, ry: bounds.ry,
        fill: "transparent", stroke: B.periwinkle,
        strokeWidth: 2 / zoom, strokeDashArray: [dW, dG],
        selectable: false, evented: false,
      });
    }

    img.set({ clipPath: absClip });
    framePanOverlayRef.current = overlay;
    fc.add(overlay);
    fc.setActiveObject(img);
    fc.renderAll();
    setFramePanMode(true);
  }

  function applyFramePan() {
    const fc  = fabricRef.current;
    const img = framePanTargetRef.current;
    if (!fc || !img) return;
    const bounds = (img as any)._frameBounds as any;
    const shape  = (img as any)._frameShape  as "circle" | "rect";
    const scaleX = img.scaleX ?? 1, scaleY = img.scaleY ?? 1;
    const imgW   = img.width ?? 200, imgH = img.height ?? 200;
    let newClip: fabric.Object;
    if (shape === "circle") {
      const clipR = bounds.r / scaleX;
      const clipCx = (bounds.cx - (img.left ?? 0)) / scaleX - imgW / 2;
      const clipCy = (bounds.cy - (img.top  ?? 0)) / scaleY - imgH / 2;
      newClip = new fabric.Circle({ left: clipCx - clipR, top: clipCy - clipR, radius: clipR });
    } else {
      newClip = new fabric.Rect({
        left:   (bounds.left - (img.left ?? 0)) / scaleX - imgW / 2,
        top:    (bounds.top  - (img.top  ?? 0)) / scaleY - imgH / 2,
        width:  bounds.width  / scaleX, height: bounds.height / scaleY,
        rx: bounds.rx / scaleX, ry: bounds.ry / scaleY,
      });
    }
    img.set({ clipPath: newClip });
    exitFramePanMode(true);
  }

  function cancelFramePan() {
    const img = framePanTargetRef.current;
    if (img) img.set({ clipPath: framePanOrigClipRef.current ?? (undefined as any) });
    exitFramePanMode(false);
  }

  function exitFramePanMode(applied: boolean) {
    const fc      = fabricRef.current;
    const overlay = framePanOverlayRef.current;
    if (!fc) return;
    if (overlay) fc.remove(overlay);
    if (applied && framePanTargetRef.current) {
      fc.setActiveObject(framePanTargetRef.current);
      syncSel(framePanTargetRef.current);
    } else {
      setSelProps(null);
    }
    framePanTargetRef.current   = null;
    framePanOrigClipRef.current = null;
    framePanOverlayRef.current  = null;
    setFramePanMode(false);
    fc.renderAll();
    syncLayersFromRef();
    pushHistoryFromRef();
  }

  // ── Logo insertion ────────────────────────────────────────────────────────
  function addLogoToCanvas(variant: LogoVariant, currentSize: SizePreset) {
    const fc = fabricRef.current;
    if (!fc) return;
    const DARK_STYLES: StylePreset[] = ["navy", "blue", "wm-dark", "cinema"];
    const isDark = DARK_STYLES.includes(styleRef.current);
    const url = isDark ? LOGO_WHITE : LOGO_DARK;
    const { w, h } = SIZES[currentSize];
    const meta = STYLE_META[styleRef.current];
    const logoTopFrac = meta.logoTop ?? 0.76;
    const logoWFrac   = variant === "wordmark" ? (meta.logoWidthFrac ?? 0.38) : 0.16;
    fabric.Image.fromURL(url, (img) => {
      if (!img || !img.width) return;
      const targetW  = w * logoWFrac;
      const scale    = targetW / img.width;
      const logoLeft = meta.logoLeft !== undefined ? meta.logoLeft : (w - targetW) / 2;
      img.set({
        name: "logo", scaleX: scale, scaleY: scale,
        left: logoLeft, top: h * logoTopFrac,
        selectable: true,
      });
      const prev = fc.getObjects().find(o => (o as any).name === "logo");
      if (prev) fc.remove(prev);
      fc.add(img);
      fc.renderAll();
      activeLogoRef.current = variant;
      setActiveLogo(variant);
      pushHistoryFromRef();
    }, { crossOrigin: "anonymous" });
  }

  // ── Photo drop onto canvas ────────────────────────────────────────────────
  const handleCanvasDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDroppingPhoto(true);
  };

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDroppingPhoto(false); }
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDroppingPhoto(false);

    const fc = fabricRef.current;
    if (!fc) return;

    const files = Array.from(e.dataTransfer.files)
      .filter(f => IMAGE_EXTS.has(f.name.split(".").pop()?.toLowerCase() ?? ""));
    if (!files.length) return;

    const canvasEl = canvasElRef.current;
    const rect     = canvasEl?.getBoundingClientRect();
    const zoom     = fc.getZoom();

    for (const file of files) {
      const dataUrl = await readFileAsDataURL(file);
      // viewport coords (CSS px from canvas edge) — required by containsPoint
      const vpX  = rect ? (e.clientX - rect.left) : 200;
      const vpY  = rect ? (e.clientY - rect.top)  : 200;
      // canvas coords (unscaled) — used for image positioning
      const dropX = vpX / zoom;
      const dropY = vpY / zoom;

      const frameObj = fc.getObjects().find(o =>
        (o as any)._isFrame && o.containsPoint(new fabric.Point(vpX, vpY))
      ) ?? null;
      const framedImg = !frameObj ? (fc.getObjects().find(o =>
        o instanceof fabric.Image && !!(o as any)._frameBounds &&
        o.containsPoint(new fabric.Point(vpX, vpY))
      ) as fabric.Image | undefined ?? null) : null;

      fabric.Image.fromURL(dataUrl, (img) => {
        if (!img) return;
        if (frameObj) {
          if (frameObj instanceof fabric.Circle) {
            applyFrameFillCircle(fc, img, frameObj as fabric.Circle);
          } else {
            applyFrameFillRect(fc, img, frameObj as fabric.Rect);
          }
          syncLayersFromRef(); syncSel(img); pushHistoryFromRef();
        } else if (framedImg) {
          // Replace existing framed image with same frame bounds
          const bounds = (framedImg as any)._frameBounds;
          const shape  = (framedImg as any)._frameShape as "circle" | "rect";
          // Preserve companion border if present
          const oldBorderName = (framedImg as any)._borderObjName;
          const oldBorder = oldBorderName ? fc.getObjects().find(o => (o as any).name === oldBorderName) : null;
          fc.remove(framedImg);
          if (oldBorder) fc.remove(oldBorder);
          if (shape === "circle") {
            fillCircleFrame(img, bounds.cx, bounds.cy, bounds.r);
          } else {
            fillRectFrame(img, bounds.left, bounds.top, bounds.width, bounds.height, bounds.rx, bounds.ry);
          }
          fc.add(img);
          addFrameBorderCompanion(fc, img, shape);
          fc.setActiveObject(img); fc.renderAll();
          syncLayersFromRef(); syncSel(img); pushHistoryFromRef();
        } else {
          const { w } = SIZES[sizeRef.current];
          const maxW  = w * 0.5;
          const scale = Math.min(1, maxW / (img.width ?? maxW));
          img.set({
            name: `photo_${Date.now()}`, scaleX: scale, scaleY: scale,
            left: dropX - ((img.width  ?? 0) * scale) / 2,
            top:  dropY - ((img.height ?? 0) * scale) / 2,
            selectable: true,
          });
          fc.add(img); fc.setActiveObject(img); fc.renderAll();
          syncSel(img); pushHistoryFromRef();
        }
      });
    }
  };

  // ── Crop mode ─────────────────────────────────────────────────────────────
  function enterCropMode() {
    const fc  = fabricRef.current;
    const img = fc?.getActiveObject();
    if (!fc || !(img instanceof fabric.Image)) return;

    cropTargetRef.current = img as fabric.Image;
    setCropMode(true);

    const b = img.getBoundingRect(true);
    const cr = new fabric.Rect({
      name:            "_cropRect",
      left:            b.left + b.width  * 0.1,
      top:             b.top  + b.height * 0.1,
      width:           b.width  * 0.8,
      height:          b.height * 0.8,
      fill:            "rgba(0,0,0,0.05)",
      stroke:          "#ffffff",
      strokeWidth:     2 / fc.getZoom(),
      strokeDashArray: [8 / fc.getZoom(), 4 / fc.getZoom()],
      selectable:      true,
      hasControls:     true,
      lockScalingFlip: true,
    });
    cropOverlayRef.current = cr;

    // dim everything else
    fc.getObjects().forEach(o => { if (o !== img) o.set({ selectable: false, opacity: (o.opacity ?? 1) * 0.25 }); });
    fc.add(cr);
    fc.setActiveObject(cr);
    fc.renderAll();
  }

  function applyCrop() {
    const fc  = fabricRef.current;
    const img = cropTargetRef.current;
    const cr  = cropOverlayRef.current;
    if (!fc || !img || !cr) return;

    const b = cr.getBoundingRect(true);
    const scaleX = img.scaleX || 1;
    const scaleY = img.scaleY || 1;
    // Convert canvas coords to image local space (Fabric center = 0,0)
    const clip = new fabric.Rect({
      left:   (b.left - (img.left ?? 0)) / scaleX - (img.width ?? 0) / 2,
      top:    (b.top  - (img.top  ?? 0)) / scaleY - (img.height ?? 0) / 2,
      width:  b.width  / scaleX,
      height: b.height / scaleY,
    });
    img.set({ clipPath: clip });

    exitCropMode(true);
    pushHistoryFromRef();
  }

  function cancelCrop() {
    exitCropMode(false);
  }

  function exitCropMode(applied: boolean) {
    const fc = fabricRef.current;
    const cr = cropOverlayRef.current;
    if (!fc) return;

    // restore objects
    fc.getObjects().forEach(o => {
      if (o !== cr) {
        o.set({ selectable: true });
        // restore opacity (was multiplied by 0.25)
        if (o !== cropTargetRef.current) {
          o.set({ opacity: Math.min(1, (o.opacity ?? 1) / 0.25) });
        }
      }
    });
    if (cr) fc.remove(cr);

    if (applied && cropTargetRef.current) {
      fc.setActiveObject(cropTargetRef.current);
      syncSel(cropTargetRef.current);
    } else {
      setSelProps(null);
    }

    cropOverlayRef.current = null;
    cropTargetRef.current  = null;
    setCropMode(false);
    fc.renderAll();
    syncLayersFromRef();
  }

  // ── Selection sync ────────────────────────────────────────────────────────
  function syncSel(obj?: fabric.Object) {
    if (!obj || (obj as any).name === "_cropRect" || (obj as any).name === "_framePanOverlay") {
      setSelProps(null); return;
    }
    const isFramedImage = obj instanceof fabric.Image && !!(obj as any)._frameBounds && !!(obj.clipPath);
    // For framed images, read stroke from companion border object
    let strokeSource: fabric.Object = obj;
    if (isFramedImage) {
      const borderName = (obj as any)._borderObjName;
      const companion = borderName
        ? fabricRef.current?.getObjects().find(o => (o as any).name === borderName)
        : undefined;
      if (companion) strokeSource = companion;
    }
    const strokeStr   = typeof strokeSource.stroke === "string" ? strokeSource.stroke : "";
    const dash        = strokeSource.strokeDashArray;
    const strokeDash: "solid" | "dash" | "dot" =
      !dash || dash.length === 0 ? "solid" :
      (dash[0] ?? 12) <= (dash[1] ?? 6) * 0.6 ? "dot" : "dash";
    // rx: from rect objects, or from _frameBounds for framed rect images
    let rx: number | undefined = undefined;
    if (obj instanceof fabric.Rect) {
      rx = (obj as fabric.Rect).rx ?? 0;
    } else if (isFramedImage && (obj as any)._frameShape === "rect") {
      rx = (obj as any)._frameBounds?.rx ?? 0;
    }
    setSelProps({
      fill:        typeof obj.fill === "string" ? obj.fill : "",
      opacity:     obj.opacity ?? 1,
      fontSize:    (obj as any).fontSize,
      fontWeight:  (obj as any).fontWeight,
      textAlign:   (obj as any).textAlign,
      isImage:     obj instanceof fabric.Image,
      rx,
      stroke:      strokeStr || undefined,
      strokeWidth: typeof strokeSource.strokeWidth === "number" ? strokeSource.strokeWidth : undefined,
      strokeDash:  strokeStr ? strokeDash : undefined,
      isFrame:     !!(obj as any)._isFrame,
      hasClip:     isFramedImage,
    });
  }

  function patchSel(patch: Partial<SelProps & { fontWeight: string; textAlign: string }>) {
    const fc     = fabricRef.current;
    const active = fc?.getActiveObject();
    if (!active) return;
    const { strokeDash, ...rest } = patch as any;
    if (strokeDash !== undefined) {
      if (strokeDash === "solid") rest.strokeDashArray = [];
      else if (strokeDash === "dash") rest.strokeDashArray = [14, 7];
      else rest.strokeDashArray = [3, 7];
    }
    const isFramedImage = active instanceof fabric.Image && !!(active as any)._frameBounds && !!(active.clipPath);
    if (isFramedImage) {
      const borderName = (active as any)._borderObjName;
      const companion  = borderName ? fc?.getObjects().find(o => (o as any).name === borderName) : null;
      // Stroke props → companion border object
      const strokeKeys = ["stroke", "strokeWidth", "strokeDashArray"] as const;
      const strokePatch: any = {};
      const nonStrokePatch: any = {};
      for (const k of Object.keys(rest)) {
        if (strokeKeys.includes(k as any)) strokePatch[k] = rest[k];
        else nonStrokePatch[k] = rest[k];
      }
      if (companion && Object.keys(strokePatch).length > 0) companion.set(strokePatch);
      // rx on framed rect image → update both companion and clipPath
      if ("rx" in rest && (active as any)._frameShape === "rect") {
        const rxVal = rest.rx as number;
        const ryVal = rxVal;
        if (companion) (companion as any).set({ rx: rxVal, ry: ryVal });
        // Update clipPath rx/ry (local space)
        const clipPath = (active as fabric.Image).clipPath as fabric.Rect | undefined;
        const bounds   = (active as any)._frameBounds;
        const cov      = (active.scaleX ?? 1);
        if (clipPath && clipPath instanceof fabric.Rect) {
          clipPath.set({ rx: rxVal / cov, ry: ryVal / cov });
        }
        if (bounds) { bounds.rx = rxVal; bounds.ry = ryVal; }
        delete nonStrokePatch.rx;
        delete nonStrokePatch.ry;
      }
      if (Object.keys(nonStrokePatch).length > 0) active.set(nonStrokePatch);
    } else {
      active.set(rest as any);
    }
    fc?.renderAll();
    syncSel(active);
    pushHistoryFromRef();
  }

  // ── Keyboard: undo/redo / Escape ─────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if (e.key === "Escape" && framePanMode) { cancelFramePan(); return; }
    if (e.key === "Escape" && cropMode) { cancelCrop(); return; }
    if (inField) return;
    if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    if ((e.key === "Delete" || e.key === "Backspace") && !cropMode) {
      const fc = fabricRef.current;
      const obj = fc?.getActiveObject();
      if (obj) {
        fc!.remove(obj);
        if ((obj as any).name === "logo") { activeLogoRef.current = null; setActiveLogo(null); }
        const borderName = (obj as any)._borderObjName;
        if (borderName) { const b = fc!.getObjects().find(o => (o as any).name === borderName); if (b) fc!.remove(b); }
        fc!.renderAll();
        setSelProps(null);
        pushHistoryFromRef();
      }
    }
  }

  // ── Generate 5 AI drafts ─────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const fc = fabricRef.current;
    if (!fc || !fontReady) return;
    setGenerating(true);
    setFeedback("Generating with Claude…");
    try {
      const rawJson = await invoke<string>("generate_ad_ideas", {
        brand: fields.brand || DEFAULTS.brand, style, size,
      });
      const match = rawJson.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array in Claude response");
      const ideas = JSON.parse(match[0]) as Array<{
        headline: string; subtext: string; brand: string; rationale?: string;
      }>;

      const { w: fw, h: fh } = SIZES[size];
      const curZoom = fc.getZoom();
      const ts = new Date().toISOString().slice(11, 16).replace(":", "");
      const destDir = `${assetsDir}/${platform}`;
      const indexPath = `${assetsDir}/index.md`;
      const HEADER = "| Filename | Ad Name | Campaign | Ad Set | Format | Status | Spend | CPL | Notes |";
      const SEP    = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";

      for (let i = 0; i < ideas.length; i++) {
        const idea = ideas[i];
        const draftFields: Fields = {
          headline: idea.headline ?? "",
          subtext:  idea.subtext  ?? "",
          brand:    idea.brand    || DEFAULTS.brand,
        };
        applyingTemplateRef.current = true;
        TEMPLATES[style](fc, draftFields, size);
        applyingTemplateRef.current = false;
        fc.setZoom(1); fc.setWidth(fw); fc.setHeight(fh); fc.renderAll();
        const dataUrl   = fc.toDataURL({ format: "png", multiplier: 1 });
        const canvasSnap = fc.toJSON(["name", "_layerName", "clipPath", "_frameBounds", "_frameShape", "_isFrame", "_isFrameBorder", "_borderForImg", "_borderObjName"]);

        const name = `ai-${ts}-${i + 1}.png`;
        await invoke("write_file_bytes", { path: `${destDir}/${name}`, b64: dataUrl.split(",")[1] });
        await invoke("write_file", {
          path: `${destDir}/${name}.canvas.json`,
          content: JSON.stringify({ version: 1, style, size, fields: draftFields, activeLogo, canvas: canvasSnap }, null, 2),
        });

        let existing = "";
        try { existing = await invoke<string>("read_file", { path: indexPath }); } catch { /* */ }
        const adName = idea.headline.replace(/\n/g, " ").slice(0, 50);
        const notes  = idea.rationale ? idea.rationale.slice(0, 80) : "";
        const row    = `| ${name} | ${adName} | | | identity-card | draft | | | ${notes} |`;
        const ls     = existing.split("\n");
        let hIdx = -1, sIdx = -1;
        for (let j = 0; j < ls.length; j++) {
          const t = ls[j].trim();
          if (t.startsWith("|") && t.toLowerCase().includes("filename")) hIdx = j;
          if (hIdx >= 0 && sIdx < 0 && t.match(/^\|[-| :]+\|$/)) sIdx = j;
        }
        const updated = hIdx >= 0 && sIdx >= 0
          ? (ls.splice(sIdx + 1, 0, row), ls.join("\n"))
          : existing.trimEnd() + `\n\n${HEADER}\n${SEP}\n${row}\n`;
        await invoke("write_file", { path: indexPath, content: updated });

        setFeedback(`Saved draft ${i + 1}/${ideas.length}…`);
      }

      // Restore canvas to original state
      applyingTemplateRef.current = true;
      TEMPLATES[style](fc, fields, size);
      applyingTemplateRef.current = false;
      fc.setZoom(curZoom); fc.setWidth(DISPLAY_W); fc.setHeight(Math.round(fh * curZoom));
      if (activeLogo) addLogoToCanvas(activeLogo, size);
      fc.renderAll();

      setFeedback(`${ideas.length} drafts saved to assets`);
      setTimeout(() => setFeedback(null), 4000);
      onSaved();
    } catch (err) {
      setFeedback(`Generate failed: ${err}`);
      setTimeout(() => setFeedback(null), 6000);
    } finally {
      setGenerating(false);
    }
  }, [assetsDir, platform, fields, style, size, activeLogo, fontReady, onSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const fc = fabricRef.current;
    if (!fc) return;
    setSaving(true);
    try {
      const { w: fw, h: fh } = SIZES[size];
      const curZoom = fc.getZoom();
      fc.setZoom(1);
      fc.setWidth(fw);
      fc.setHeight(fh);
      fc.renderAll();
      const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
      fc.setZoom(curZoom);
      fc.setWidth(DISPLAY_W);
      fc.setHeight(Math.round(fh * curZoom));
      fc.renderAll();

      const name    = filename.endsWith(".png") ? filename : filename + ".png";
      const destDir = `${assetsDir}/${platform}`;
      await invoke("write_file_bytes", { path: `${destDir}/${name}`, b64: dataUrl.split(",")[1] });

      const sidecar = {
        version: 1, style, size, fields, activeLogo,
        canvas: fc.toJSON(["name", "_layerName", "clipPath", "_frameBounds", "_frameShape", "_isFrame", "_isFrameBorder", "_borderForImg", "_borderObjName"]),
      };
      await invoke("write_file", {
        path: `${destDir}/${name}.canvas.json`,
        content: JSON.stringify(sidecar, null, 2),
      });

      const indexPath = `${assetsDir}/index.md`;
      let existing = "";
      try { existing = await invoke<string>("read_file", { path: indexPath }); } catch {}
      const adName = fields.headline.replace(/\n/g, " ").slice(0, 50);
      const row    = `| ${name} | ${adName} | | | identity-card | draft | | | |`;
      const HEADER = "| Filename | Ad Name | Campaign | Ad Set | Format | Status | Spend | CPL | Notes |";
      const SEP    = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
      const ls = existing.split("\n");
      let hIdx = -1, sIdx = -1, eIdx = -1;
      for (let i = 0; i < ls.length; i++) {
        const t = ls[i].trim();
        if (t.startsWith("|") && t.toLowerCase().includes("filename")) hIdx = i;
        if (hIdx >= 0 && sIdx < 0 && t.match(/^\|[-| :]+\|$/)) sIdx = i;
        if (sIdx >= 0 && t.startsWith("|")) {
          const cells = t.split("|").map(c => c.trim()).filter((_, ii, a) => ii > 0 && ii < a.length - 1);
          if (cells[0] === name) { eIdx = i; break; }
        }
      }
      let updated: string;
      if (eIdx >= 0) { ls[eIdx] = row; updated = ls.join("\n"); }
      else if (hIdx >= 0 && sIdx >= 0) { ls.splice(sIdx + 1, 0, row); updated = ls.join("\n"); }
      else updated = existing.trimEnd() + `\n\n${HEADER}\n${SEP}\n${row}\n`;
      await invoke("write_file", { path: indexPath, content: updated });

      onSaved();
      onClose();
    } catch (err) {
      setFeedback(`Save failed: ${err}`);
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [filename, platform, fields, size, assetsDir, onClose, onSaved]);

  // ── Style helpers ─────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    background: theme.bgTertiary, color: theme.text,
    border: `1px solid ${theme.border}`, borderRadius: 4,
    padding: "3px 8px", fontSize: 12, fontFamily: "inherit", width: "100%",
  };
  const btn = (active?: boolean): React.CSSProperties => ({
    background: active ? theme.accentMuted : theme.bgTertiary,
    color:      active ? theme.accent      : theme.textMuted,
    border:     `1px solid ${active ? theme.accent + "44" : theme.border}`,
    borderRadius: 4, fontSize: 11, cursor: "pointer",
  });

  const displayH = Math.round(SIZES[size].h * (DISPLAY_W / SIZES[size].w));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 100, background: theme.bg, display: "flex", flexDirection: "column" }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: theme.border, background: theme.bgSecondary }}>
        <button onClick={onClose} className="text-xs px-2 py-1 rounded"
          style={{ color: theme.textMuted, border: `1px solid ${theme.border}` }}>
          ← Back
        </button>
        <span className="text-sm font-medium" style={{ color: theme.text }}>
          Identity Card Builder
        </span>
        {!fontReady && <span className="text-xs" style={{ color: theme.textDim }}>loading…</span>}

        {/* Undo / Redo */}
        <div className="flex gap-1 ml-2">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="text-xs px-2 py-1 rounded"
            style={{ ...btn(), opacity: canUndo ? 1 : 0.35, fontFamily: "monospace" }}>
            ↩
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className="text-xs px-2 py-1 rounded"
            style={{ ...btn(), opacity: canRedo ? 1 : 0.35, fontFamily: "monospace" }}>
            ↪
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={handleGenerate} disabled={generating || saving || !fontReady}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}`, opacity: generating || saving || !fontReady ? 0.6 : 1 }}>
            {generating ? feedback ?? "Generating…" : "✨ Generate 5 ideas"}
          </button>
          <button onClick={handleSaveTemplate} disabled={savingTemplate || saving || !fontReady}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}`, opacity: savingTemplate || saving || !fontReady ? 0.6 : 1 }}>
            {savingTemplate ? "Saving…" : "📌 Save Template"}
          </button>
          <button onClick={handleSave} disabled={saving || generating || !fontReady}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: theme.accent, color: theme.bg, opacity: saving || generating || !fontReady ? 0.6 : 1 }}>
            {saving ? "Saving…" : "💾 Save to Assets"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas drop zone */}
        <div
          className="flex-1 overflow-auto flex items-start justify-center relative"
          style={{
            background: theme.bgTertiary,
            padding: 24,
            outline: isDroppingPhoto ? `2px dashed ${theme.accent}` : "none",
            outlineOffset: -4,
          }}
          onDragEnter={handleCanvasDragEnter}
          onDragLeave={handleCanvasDragLeave}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {isDroppingPhoto && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.4)", zIndex: 10, pointerEvents: "none",
            }}>
              <span style={{ color: theme.accent, fontSize: 18, fontWeight: 700 }}>Drop photo onto canvas</span>
            </div>
          )}
          <div style={{ boxShadow: "0 6px 32px rgba(0,0,0,0.5)", lineHeight: 0, width: DISPLAY_W, height: displayH, flexShrink: 0 }}>
            <canvas ref={canvasElRef} />
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col flex-shrink-0"
          style={{ width: 280, borderLeft: `1px solid ${theme.border}`, background: theme.bgSecondary }}>

          {/* Tab bar */}
          <div className="flex flex-shrink-0" style={{ borderBottom: `1px solid ${theme.border}` }}>
            {(["design","layers"] as PanelTab[]).map(tab => (
              <button key={tab} onClick={() => setPanelTab(tab)}
                className="flex-1 py-2 text-xs font-medium tracking-wider"
                style={{
                  background:   panelTab === tab ? theme.bgTertiary : "transparent",
                  color:        panelTab === tab ? theme.text        : theme.textMuted,
                  borderBottom: panelTab === tab ? `2px solid ${theme.accent}` : "2px solid transparent",
                }}>
                {tab.toUpperCase()}{tab === "layers" ? ` (${layers.length})` : ""}
              </button>
            ))}
          </div>

          {/* ── DESIGN tab ── */}
          {panelTab === "design" && (
            <div className="flex flex-col gap-3 p-3 overflow-y-auto flex-1">

              {/* Style */}
              <div>
                <div className="text-xs mb-1.5 font-medium tracking-wider" style={{ color: theme.textDim }}>STYLE</div>
                <div className="grid grid-cols-4 gap-1">
                  {(["navy","white","blue","wm-dark","wm-light","minimal","cinema","green","warm","dusk"] as StylePreset[]).map(s => (
                    <button key={s} onClick={() => setStyle(s)}
                      className="py-1.5 text-xs rounded font-semibold truncate"
                      style={{
                        background: style === s ? STYLE_META[s].bg : theme.bgTertiary,
                        color:      style === s ? STYLE_META[s].fg : theme.textMuted,
                        border: `1px solid ${style === s ? "transparent" : theme.border}`,
                        letterSpacing: 0.5,
                      }}>
                      {STYLE_META[s].label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Saved Templates */}
              {savedTemplates.length > 0 && (
                <div>
                  <div className="text-xs mb-1.5 font-medium tracking-wider" style={{ color: theme.textDim }}>MY TEMPLATES</div>
                  <div className="flex flex-col gap-1">
                    {savedTemplates.map(tpl => (
                      <div key={tpl.id} className="flex gap-1 items-center">
                        <button
                          onClick={() => handleLoadTemplate(tpl)}
                          className="flex-1 py-1.5 text-xs rounded text-left px-2 truncate"
                          style={{ background: theme.bgTertiary, color: theme.text, border: `1px solid ${theme.border}` }}
                          title={`Load: ${tpl.name}`}>
                          {tpl.name}
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="py-1.5 px-2 text-xs rounded"
                          style={{ background: theme.bgTertiary, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                          title="Delete template">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Size */}
              <div>
                <div className="text-xs mb-1.5 font-medium tracking-wider" style={{ color: theme.textDim }}>SIZE</div>
                <div className="flex gap-1">
                  {(["square","portrait","story"] as SizePreset[]).map(s => (
                    <button key={s} onClick={() => setSize(s)}
                      className="flex-1 py-1 text-xs rounded"
                      style={{
                        background: size === s ? theme.accentMuted : theme.bgTertiary,
                        color:      size === s ? theme.accent      : theme.textMuted,
                        border: `1px solid ${size === s ? theme.accent + "44" : theme.border}`,
                      }}>
                      {SIZES[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background color */}
              <div>
                <div className="text-xs mb-1.5 font-medium tracking-wider" style={{ color: theme.textDim }}>BACKGROUND</div>
                <div className="flex items-center gap-2">
                  <input type="color" value={bgColor}
                    onChange={e => applyBgColor(e.target.value)}
                    style={{ width: 36, height: 28, padding: 0, cursor: "pointer",
                      border: `1px solid ${theme.border}`, borderRadius: 3, flexShrink: 0 }} />
                  <input type="text" value={bgColor}
                    onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) applyBgColor(e.target.value); }}
                    style={{ ...inp, flex: 1, width: "auto", fontFamily: "monospace" }} />
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium tracking-wider" style={{ color: theme.textDim }}>CONTENT</div>
                {([
                  ["headline", "Headline", true],
                  ["subtext",  "Subtext",  false],
                  ["brand",    "Brand line", false],
                ] as [keyof Fields, string, boolean][]).map(([key, label, multi]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <label style={{ color: theme.textDim, fontSize: 10 }}>{label}</label>
                    {multi ? (
                      <textarea rows={2} value={fields[key]}
                        onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                        style={{ ...inp, resize: "vertical" }} />
                    ) : (
                      <input type="text" value={fields[key]}
                        onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                        style={inp} />
                    )}
                  </div>
                ))}
              </div>

              {/* Add objects */}
              <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="text-xs font-medium tracking-wider" style={{ color: theme.textDim }}>ADD SHAPE</div>
                <div className="grid grid-cols-4 gap-1">
                  <button onClick={addTextObject}  className="py-1.5 text-xs rounded" style={btn()}>+ Text</button>
                  <button onClick={addRectObject}  className="py-1.5 text-xs rounded" style={btn()}>+ Rect</button>
                  <button onClick={addCircleObject} className="py-1.5 text-xs rounded" style={btn()}>+ Circle</button>
                  <button onClick={addEllipseObject} className="py-1.5 text-xs rounded" style={btn()}>+ Ellipse</button>
                </div>
                <div className="flex gap-1 items-center">
                  <button onClick={() => addStarObject(starPoints)} className="flex-1 py-1.5 text-xs rounded" style={btn()}>
                    ★ Star
                  </button>
                  <select value={starPoints} onChange={e => setStarPoints(parseInt(e.target.value))}
                    style={{ ...inp, width: 52, padding: "3px 4px", flexShrink: 0 }}>
                    {[3,4,5,6,7,8,10,12].map(n => <option key={n} value={n}>{n}pt</option>)}
                  </select>
                  <button onClick={() => addPolygonObject(6)} className="flex-1 py-1.5 text-xs rounded" style={btn()}>
                    ⬡ Hex
                  </button>
                </div>
                <div className="text-xs" style={{ color: theme.textDim }}>Or drop a photo onto canvas</div>
              </div>

              {/* Frames */}
              <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="text-xs font-medium tracking-wider" style={{ color: theme.textDim }}>ADD FRAME</div>
                <div className="flex gap-1">
                  <button onClick={() => addFrameObject("circle")} className="flex-1 py-1.5 text-xs rounded" style={btn()}>
                    ○ Circle
                  </button>
                  <button onClick={() => addFrameObject("rect")} className="flex-1 py-1.5 text-xs rounded" style={btn()}>
                    ▭ Rounded Rect
                  </button>
                </div>
                <div className="text-xs" style={{ color: theme.textDim }}>Drop a photo onto a frame to fill it. Double-click a filled frame to reposition.</div>
              </div>

              {/* Logo */}
              <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="text-xs font-medium tracking-wider" style={{ color: theme.textDim }}>LOGO</div>
                <div className="flex gap-1">
                  {(["wordmark","icon"] as LogoVariant[]).map(v => (
                    <button key={v} onClick={() => {
                      if (activeLogo === v) {
                        const prev = fabricRef.current?.getObjects().find(o => (o as any).name === "logo");
                        if (prev) { fabricRef.current?.remove(prev); fabricRef.current?.renderAll(); }
                        activeLogoRef.current = null;
                        setActiveLogo(null);
                        pushHistoryFromRef();
                      } else {
                        addLogoToCanvas(v, size);
                      }
                    }}
                      className="flex-1 py-1.5 text-xs rounded"
                      style={btn(activeLogo === v)}>
                      {v === "wordmark" ? "Wordmark" : "Icon"}
                    </button>
                  ))}
                </div>
                {activeLogo && (
                  <div className="text-xs" style={{ color: theme.textDim }}>
                    Active — drag to reposition. Click to remove.
                  </div>
                )}
              </div>

              {/* Selected object */}
              {selProps && !cropMode && !framePanMode && (
                <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <div className="text-xs font-medium tracking-wider" style={{ color: theme.textDim }}>
                    SELECTED OBJECT
                  </div>

                  {selProps.isFrame && (
                    <div className="text-xs px-2 py-1.5 rounded" style={{ background: theme.bgTertiary, color: theme.textMuted }}>
                      Frame placeholder — drop a photo onto it to fill.
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span style={{ color: theme.textDim, fontSize: 10, width: 46 }}>fill</span>
                    <input type="color" value={selProps.fill || "#ffffff"}
                      onChange={e => patchSel({ fill: e.target.value })}
                      style={{ width: 28, height: 22, padding: 0, cursor: "pointer",
                        border: `1px solid ${theme.border}`, borderRadius: 3 }} />
                    <span style={{ color: theme.textDim, fontSize: 10 }}>{selProps.fill}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span style={{ color: theme.textDim, fontSize: 10, width: 46 }}>opacity</span>
                    <input type="range" min={0} max={1} step={0.05}
                      value={selProps.opacity}
                      onChange={e => patchSel({ opacity: parseFloat(e.target.value) })}
                      style={{ flex: 1 }} />
                    <span style={{ color: theme.textDim, fontSize: 10, width: 28, textAlign: "right" }}>
                      {Math.round(selProps.opacity * 100)}%
                    </span>
                  </div>

                  {/* Corner radius — rects only */}
                  {selProps.rx !== undefined && (
                    <div className="flex items-center gap-2">
                      <span style={{ color: theme.textDim, fontSize: 10, width: 46 }}>corners</span>
                      <input type="range" min={0} max={300} step={1}
                        value={selProps.rx}
                        onChange={e => patchSel({ rx: parseInt(e.target.value), ry: parseInt(e.target.value) } as any)}
                        style={{ flex: 1 }} />
                      <span style={{ color: theme.textDim, fontSize: 10, width: 28, textAlign: "right" }}>
                        {selProps.rx}
                      </span>
                    </div>
                  )}

                  {/* Stroke controls — non-text objects */}
                  {selProps.fontSize == null && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span style={{ color: theme.textDim, fontSize: 10, width: 46 }}>stroke</span>
                        <input type="color" value={selProps.stroke || "#ffffff"}
                          onChange={e => patchSel({ stroke: e.target.value, strokeWidth: selProps.strokeWidth ?? 4 })}
                          style={{ width: 28, height: 22, padding: 0, cursor: "pointer",
                            border: `1px solid ${theme.border}`, borderRadius: 3 }} />
                        <input type="number" min={0} max={60}
                          value={selProps.strokeWidth ?? 0}
                          onChange={e => patchSel({ strokeWidth: parseInt(e.target.value) || 0 })}
                          style={{ ...inp, width: 48, padding: "2px 6px" }} />
                        <span style={{ color: theme.textDim, fontSize: 9 }}>px</span>
                      </div>
                      {(selProps.strokeWidth ?? 0) > 0 && (
                        <div className="flex gap-1">
                          {(["solid","dash","dot"] as const).map(d => (
                            <button key={d} onClick={() => patchSel({ strokeDash: d })}
                              className="flex-1 py-0.5 text-xs rounded"
                              style={btn(selProps.strokeDash === d)}>
                              {d === "solid" ? "——" : d === "dash" ? "- -" : "···"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selProps.fontSize != null && (
                    <div className="flex items-center gap-2">
                      <span style={{ color: theme.textDim, fontSize: 10, width: 46 }}>size</span>
                      <input type="number" value={selProps.fontSize}
                        onChange={e => patchSel({ fontSize: parseInt(e.target.value) || 12 })}
                        style={{ ...inp, width: 60, padding: "2px 6px" }} />
                      <button onClick={() => patchSel({ fontWeight: selProps.fontWeight === "800" ? "400" : "800" })}
                        className="px-2 py-0.5 text-xs rounded"
                        style={{
                          background: selProps.fontWeight === "800" ? theme.accent : theme.bgTertiary,
                          color:      selProps.fontWeight === "800" ? theme.bg     : theme.textMuted,
                          border: `1px solid ${theme.border}`, fontWeight: 700,
                        }}>B</button>
                      <button onClick={() => patchSel({ textAlign: selProps.textAlign === "center" ? "left" : "center" })}
                        className="px-2 py-0.5 text-xs rounded"
                        style={btn()}>
                        {selProps.textAlign === "center" ? "⊞" : "☰"}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-1">
                    <button onClick={() => { fabricRef.current?.getActiveObject()?.bringForward(); fabricRef.current?.renderAll(); pushHistoryFromRef(); }}
                      className="flex-1 py-1 text-xs rounded" style={btn()}>↑ fwd</button>
                    <button onClick={() => { fabricRef.current?.getActiveObject()?.sendBackwards(); fabricRef.current?.renderAll(); pushHistoryFromRef(); }}
                      className="flex-1 py-1 text-xs rounded" style={btn()}>↓ back</button>
                    <button onClick={() => {
                      const fc = fabricRef.current; const obj = fc?.getActiveObject();
                      if (obj) {
                        fc!.remove(obj);
                        const bn = (obj as any)._borderObjName;
                        if (bn) { const b = fc!.getObjects().find(o => (o as any).name === bn); if (b) fc!.remove(b); }
                        fc!.renderAll(); setSelProps(null); pushHistoryFromRef();
                      }
                    }}
                      className="flex-1 py-1 text-xs rounded"
                      style={{ ...btn(), color: "#ef4444" }}>✕ del</button>
                  </div>

                  {selProps.isImage && !selProps.hasClip && (
                    <button onClick={enterCropMode}
                      className="w-full py-1.5 text-xs rounded"
                      style={btn()}>
                      ✂ Crop image…
                    </button>
                  )}
                  {selProps.hasClip && (
                    <button onClick={() => { const img = fabricRef.current?.getActiveObject(); if (img instanceof fabric.Image) enterFramePanMode(img); }}
                      className="w-full py-1.5 text-xs rounded"
                      style={{ ...btn(), borderColor: theme.accent + "55" }}>
                      ↕ Reposition in frame…
                    </button>
                  )}
                </div>
              )}

              {/* Frame pan mode controls */}
              {framePanMode && (
                <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <div className="text-xs font-medium tracking-wider" style={{ color: theme.accent }}>REPOSITION MODE</div>
                  <div className="text-xs" style={{ color: theme.textDim }}>
                    Drag or scale the image within the frame guide. Press Escape to cancel.
                  </div>
                  <div className="flex gap-1">
                    <button onClick={applyFramePan} className="flex-1 py-1.5 text-xs rounded font-semibold"
                      style={{ background: theme.accent, color: theme.bg }}>
                      Apply
                    </button>
                    <button onClick={cancelFramePan} className="flex-1 py-1.5 text-xs rounded" style={btn()}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Crop mode controls */}
              {cropMode && (
                <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <div className="text-xs font-medium tracking-wider" style={{ color: theme.accent }}>CROP MODE</div>
                  <div className="text-xs" style={{ color: theme.textDim }}>
                    Drag the dashed rectangle to define the crop area. Press Escape to cancel.
                  </div>
                  <div className="flex gap-1">
                    <button onClick={applyCrop} className="flex-1 py-1.5 text-xs rounded font-semibold"
                      style={{ background: theme.accent, color: theme.bg }}>
                      Apply Crop
                    </button>
                    <button onClick={cancelCrop} className="flex-1 py-1.5 text-xs rounded" style={btn()}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Save */}
              <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="text-xs font-medium tracking-wider" style={{ color: theme.textDim }}>SAVE</div>
                <div className="flex flex-col gap-0.5">
                  <label style={{ color: theme.textDim, fontSize: 10 }}>platform</label>
                  <select value={platform} onChange={e => setPlatform(e.target.value)} style={inp}>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="google">Google</option>
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label style={{ color: theme.textDim, fontSize: 10 }}>filename (.png)</label>
                  <input type="text" value={filename} onChange={e => setFilename(e.target.value)} style={inp} />
                </div>
                <div className="text-xs" style={{ color: theme.textDim }}>
                  → {assetsDir.split("/").slice(-3).join("/")}/{platform}/
                </div>
              </div>

            </div>
          )}

          {/* ── LAYERS tab ── */}
          {panelTab === "layers" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-3 py-2 text-xs flex-shrink-0" style={{ color: theme.textDim, borderBottom: `1px solid ${theme.border}` }}>
                {layers.length} objects — drag to reorder, Del to delete
              </div>
              <div className="flex-1 overflow-y-auto" style={{ padding: "4px 0" }}>
                {layers.length === 0 && (
                  <div className="text-xs p-3" style={{ color: theme.textDim }}>No objects yet.</div>
                )}
                {layers.map((layer, displayIdx) => {
                  const isActive = layer.fabricObj === fabricRef.current?.getActiveObject();
                  const isDragOver = dragOverIdx === displayIdx;
                  return (
                    <div
                      key={displayIdx}
                      draggable
                      onDragStart={() => { dragLayerIdxRef.current = displayIdx; }}
                      onDragOver={e => { e.preventDefault(); setDragOverIdx(displayIdx); }}
                      onDragLeave={() => setDragOverIdx(-1)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverIdx(-1);
                        handleLayerReorder(dragLayerIdxRef.current, displayIdx);
                      }}
                      onDragEnd={() => { setDragOverIdx(-1); dragLayerIdxRef.current = -1; }}
                      onClick={() => handleLayerSelect(layer)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "5px 8px",
                        background:  isActive ? theme.accentMuted : isDragOver ? theme.bgTertiary : "transparent",
                        borderLeft:  isActive ? `2px solid ${theme.accent}` : "2px solid transparent",
                        borderTop:   isDragOver ? `1px solid ${theme.accent}` : "1px solid transparent",
                        cursor: "pointer",
                      }}
                    >
                      {/* drag handle */}
                      <span style={{ color: theme.textDim, fontSize: 10, cursor: "grab", userSelect: "none" }}>⠿</span>

                      {/* visibility */}
                      <button
                        onClick={e => { e.stopPropagation(); handleLayerVisibility(layer, !layer.visible); }}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: layer.visible ? theme.textMuted : theme.textDim, fontSize: 11, padding: 0, flexShrink: 0 }}
                        title={layer.visible ? "Hide" : "Show"}>
                        {layer.visible ? "●" : "○"}
                      </button>

                      {/* type icon */}
                      <span style={{ color: theme.textDim, fontSize: 10, width: 14, textAlign: "center", flexShrink: 0 }}>
                        {typeIcon(layer.type)}
                      </span>

                      {/* name */}
                      <input
                        value={layer.name}
                        onChange={e => handleLayerRename(layer, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex: 1, background: "transparent", border: "none", outline: "none",
                          color: theme.text, fontSize: 11, fontFamily: "inherit",
                          minWidth: 0,
                        }}
                      />

                      {/* up/down */}
                      <button
                        onClick={e => { e.stopPropagation(); handleLayerMove(layer, "up"); }}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: theme.textDim, fontSize: 10, padding: "0 1px", flexShrink: 0 }}>↑</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleLayerMove(layer, "down"); }}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: theme.textDim, fontSize: 10, padding: "0 1px", flexShrink: 0 }}>↓</button>

                      {/* delete */}
                      <button
                        onClick={e => { e.stopPropagation(); handleLayerDelete(layer); }}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: "#ef4444", fontSize: 11, padding: "0 2px", flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: theme.bgSecondary, border: `1px solid ${theme.border}`,
          borderRadius: 6, padding: "6px 14px", fontSize: 12, color: theme.text,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)", zIndex: 200,
        }}>{feedback}</div>
      )}
    </div>
  );
}
