---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [rust, egui, gotcha, #gotcha]
---

## Apple Dark Palette for egui (Neutral, High Contrast)

Drop-in palette for any dark egui app. Accent color pops cleanly on neutral — no green-on-green or low-contrast tinting.

```rust
const BG: Color32 = Color32::from_rgb(26, 26, 28);       // #1a1a1c near-black
const SURFACE: Color32 = Color32::from_rgb(34, 34, 36);   // card / panel
const SURFACE2: Color32 = Color32::from_rgb(44, 44, 46);  // filter bar, status bar
const BORDER: Color32 = Color32::from_rgb(60, 60, 64);    // subtle dividers
const ACCENT: Color32 = Color32::from_rgb(74, 222, 128);  // lime — pops on neutral
const ACCENT_DIM: Color32 = Color32::from_rgb(22, 56, 34);// accent bg (selected row)
const TEXT: Color32 = Color32::from_rgb(242, 242, 247);   // #f2f2f7 Apple near-white
const MUTED: Color32 = Color32::from_rgb(142, 142, 147);  // #8e8e93 Apple secondary
const HOVER: Color32 = Color32::from_rgb(50, 50, 54);     // hover row fill
const SELECTED: Color32 = Color32::from_rgb(28, 62, 38);  // selected row (accent-tinted)
```

**Typography scale that works:**
- Search input: `FontId::proportional(18.0)`
- Result filename: `FontId::proportional(15.0)`
- Path / secondary label: `12.5`
- Pills, status bar, meta rows: `12.0`
- Row padding: `Margin { left: 12.0, right: 8.0, top: 10.0, bottom: 10.0 }`

**Why not green-tinted dark?** When `TEXT` and `BG` both carry the accent hue, contrast ratio collapses and muted labels become unreadable at small sizes. Neutral backgrounds let the accent color do all the work.

## LayoutJob: Highlighted Text Segments

To render a string with parts in different colors (e.g., search match highlighting):

```rust
use egui::{FontId, TextFormat, text::LayoutJob};

fn make_highlight(filename: &str, query: &str) -> LayoutJob {
    let mut job = LayoutJob::default();
    let plain = TextFormat { font_id: FontId::proportional(13.5), color: TEXT, ..Default::default() };
    let accent = TextFormat { font_id: FontId::proportional(13.5), color: ACCENT, ..Default::default() };

    let q_lower = query.to_lowercase();
    let name_lower = filename.to_lowercase();

    if let Some(byte_pos) = name_lower.find(&q_lower) {
        let byte_end = byte_pos + q_lower.len();
        // Always validate char boundaries before slicing (lowercasing can shift bytes)
        if filename.is_char_boundary(byte_pos) && filename.is_char_boundary(byte_end) {
            if byte_pos > 0 { job.append(&filename[..byte_pos], 0.0, plain.clone()); }
            job.append(&filename[byte_pos..byte_end], 0.0, accent);
            if byte_end < filename.len() { job.append(&filename[byte_end..], 0.0, plain); }
            return job;
        }
    }
    job.append(filename, 0.0, plain);
    job
}

// Use with ui.label():
ui.label(make_highlight(&result.filename, &query));  // LayoutJob implements Into<WidgetText>
```

## Async Preview Loading Pattern

For loading heavy resources (images, file content) without blocking the UI thread:

```rust
pub struct PreviewLoader {
    cache: HashMap<PathBuf, CachedPreview>,
    tx: Sender<(PathBuf, PreviewKind)>,
    rx: Receiver<(PathBuf, PreviewKind)>,
}

impl PreviewLoader {
    pub fn request(&mut self, path: PathBuf) {
        if self.cache.contains_key(&path) { return; }
        self.cache.insert(path.clone(), CachedPreview::Loading);
        let tx = self.tx.clone();
        thread::spawn(move || {
            let result = load(&path);   // slow work here, not on UI thread
            let _ = tx.send((path, result));
        });
    }

    // Call every frame — drains completed loads and converts to egui textures
    pub fn poll(&mut self, ctx: &Context) {
        while let Ok((path, kind)) = self.rx.try_recv() {
            let cached = match kind {
                PreviewKind::Image { pixels, width, height } => {
                    let ci = ColorImage::from_rgba_unmultiplied([width, height], &pixels);
                    let tex = ctx.load_texture(path.to_string_lossy(), ci, TextureOptions::LINEAR);
                    CachedPreview::Image(tex, width, height)
                }
                // ...
            };
            self.cache.insert(path, cached);
        }
    }
}
```

Key: send raw `Vec<u8>` pixels across the channel (not `TextureHandle` — those are not Send). Convert to texture in `poll()` on the main thread. Call `ctx.request_repaint()` or rely on the repaint loop to pick up results.

## Image Display in egui 0.29

```rust
// Scale image to fit a max bounding box while maintaining aspect ratio:
let max_w = avail.x - 8.0;
let max_h = avail.y - 70.0;
let scale = (max_w / iw as f32).min(max_h / ih as f32).min(1.0);
let disp = Vec2::new(iw as f32 * scale, ih as f32 * scale);

ui.add(egui::Image::new(&tex).max_size(disp).maintain_aspect_ratio(true));
// Note: do NOT use egui::load::SizedTexture::new() — use Image::new() builder API
```

# egui: Frame + Clickable Row Pattern

## The Gotcha

`ui.add()` requires a `Widget` implementor. `egui::Frame::show()` returns `InnerResponse<R>` — **not a Widget** — so this fails:

```rust
// WRONG — compiler error E0277
ui.add(
    egui::Frame::none()
        .fill(color)
        .show(ui, |ui| { ... })
        .response
        .interact(Sense::click())
);
```

## Correct Pattern

Call `Frame::show()` directly, then interact on the returned rect:

```rust
let inner = egui::Frame::none()
    .fill(bg_color)
    .inner_margin(Vec2::new(6.0, 3.0))
    .show(ui, |ui| {
        ui.set_min_width(ui.available_width()); // fill full width
        ui.vertical(|ui| {
            // row content
        });
    });

let row_resp = ui.interact(
    inner.response.rect,
    ui.id().with(("row", idx)),  // unique id per row
    Sense::click(),
);
```

The `ui.id().with(("row", idx))` ensures each row has a unique interaction id — critical in loops.

## WalkParallel Cancellation Pattern

Background search with cooperative cancellation via `AtomicBool`:

```rust
pub struct SearchWorker {
    pub cancel: Arc<AtomicBool>,
}

impl SearchWorker {
    pub fn start(query: String, opts: SearchOptions, tx: Sender<SearchResult>) -> Self {
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel2 = cancel.clone();

        thread::spawn(move || {
            let walker = WalkBuilder::new(&opts.root)
                .hidden(false).ignore(false).git_ignore(false)
                .git_global(false).git_exclude(false)
                .threads(num_cpus)
                .build_parallel();

            walker.run(|| {
                let cancel = cancel2.clone();
                Box::new(move |entry| {
                    if cancel.load(Ordering::Relaxed) {
                        return WalkState::Quit; // stops all threads
                    }
                    // process entry...
                    WalkState::Continue
                })
            });
        });

        SearchWorker { cancel }
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }
}
```

On query change: call `worker.cancel()`, drain the channel, start a new worker.

## Debounce Pattern (no async needed)

```rust
struct SearchApp {
    last_query_change: Option<Instant>,
    pending_query: Option<String>,
}

// in update():
if resp.changed() {
    self.pending_query = Some(self.query.clone());
    self.last_query_change = Some(Instant::now());
}

// in handle_debounce():
if let Some(pending) = self.pending_query.take() {
    if self.last_query_change.unwrap().elapsed() >= Duration::from_millis(150) {
        self.start_search(pending);
    } else {
        self.pending_query = Some(pending); // put back, not ready yet
    }
}
```

Call `ctx.request_repaint_after(Duration::from_millis(16))` while searching to keep streaming results flowing.

## WalkBuilder: Disable All Ignore Files

For raw filesystem walking (no .gitignore filtering):

```rust
WalkBuilder::new(root)
    .hidden(false)      // include dotfiles
    .ignore(false)      // disable .ignore files
    .git_ignore(false)  // disable .gitignore
    .git_global(false)  // disable global gitignore
    .git_exclude(false) // disable .git/info/exclude
    .threads(num_cpus)
    .build_parallel()
```
