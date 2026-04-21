---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [#tools, #suno, #ai-music, #prompting]
---

# Suno AI Prompting Patterns

Use `/suno` skill to generate ready-to-paste Suno Custom Mode prompts. This article captures the underlying patterns.

## Custom Mode vs Simple Mode

Always use **Custom Mode**. Two separate fields — Style of Music + Lyrics — give Suno clear signal vs. ambiguity.

- **Style of Music**: 200 chars (v4) / 1,000 chars (v4.5+) — front-load essentials, truncation is silent
- **Lyrics**: \~3,000 chars / 40–60 lines — section tags required
- **Title**: 80 chars — optional

## Style Prompt Formula

**Order**: Genre → Mood → Vocals → Instrumentation → Production/BPM

**Sweet spot**: 4–7 descriptors. Under 4 = generic. Over 8 = diminishing returns. Over 20 = incoherent.

**Front-load within 100 chars** — that's your truncation-safe zone.

### Genre

Use subgenres, not just "rock" or "pop". Dominant first:

- `indie rock, lo-fi alternative`
- `synth-pop, 80s-inspired`
- `dark pop, synthwave`
- `lo-fi hip-hop, jazz-influenced`

Never name artists — deconstruct them (see below).

### Mood

One primary direction. No contradictions:

- melancholic, euphoric, brooding, triumphant, dreamy, aggressive, nostalgic, serene, playful, bittersweet

### Vocals (be specific)

- Bad: `male vocals`
- Good: `raspy male tenor, emotional delivery, dry close-mic recording`
- Options: whispered, falsetto, growling, belting, breathy, theatrical, crooning, layered harmonies

### Instrumentation (2–4 with character)

- Bad: `guitar, bass, drums`
- Good: `jangly Telecaster with overdrive crunch, deep analog bass, punchy drum machine`

### BPM — always include

- `85 BPM` (lo-fi, slow), `92 BPM` (indie), `118 BPM` (synth-pop), `140 BPM` (fast/trap)

## Lyric Structure Tags

Reliable section tags (use these freely):

```
[Intro] / [Instrumental Intro]
[Verse 1] / [Verse 2] / [Verse 3]
[Pre-Chorus]
[Chorus]
[Bridge]
[Final Chorus]
[Outro]
[Instrumental Interlude]
```

Less reliable but worth testing:

```
[Build] / [Build-Up]
[Breakdown]
[Drop]
```

## Section Sizing Rules

- Verse: 4–8 lines (longer = rushed delivery)
- Chorus: 2–4 lines (punchy, memorable)
- Bridge: 4–6 lines (contrast)
- Total: 30–55 lines ≈ 3–4 minutes

## Inline Vocal Cues

Place in parentheses within lyrics:

```
(whispered) soft secret line
(belted) CLIMACTIC MOMENT
(building intensity) escalating through here
(fading) trailing off at the end
(falsetto) high emotional peak
(harmonized) layered backing moment
```

## #gotcha What Breaks Suno

- **Sound effects in lyrics**: `*guitar solo*`, `*bass drop*` → unpredictable output. Move to style prompt or omit.
- **Silent truncation**: Style prompt text beyond limit is dropped without warning. Front-load.
- **Contradictions**: `calm aggressive metal` → incoherent. Pick one direction.
- **Mood mismatch**: cheerful lyrics + dark style prompt = unpredictable blending.
- **Oversized verses**: 20+ lines → delivery gets rushed. Stay under 8.
- **Artist names**: unreliable. Deconstruct instead.
- **Asterisks / stage directions**: confuses the model.
- **Production notes in lyric sections**: reduces quality. Style prompt only.

## Artist Deconstruction (Instead of Name-Dropping)

**The Killers** — theatrical male vocals, shimmering synth pads, anthemic drums, stadium rock, 125 BPM

**Lana Del Rey** — breathy female vocals, cinematic orchestration, trip-hop drums, dark pop, vintage 60s Hollywood

**Nirvana** — grunge, distorted guitars, dynamic soft-loud contrast, raspy male vocals, raw garage production

**Billie Eilish** — dark pop, whispered breathy vocals, minimal trap beat, bass-forward mix, intimate close-mic

**Tame Impala** — psychedelic pop, dreamy falsetto, analog synths, lush reverb, 98 BPM

**Frank Ocean** — neo-soul R&B, introspective falsetto, sparse minimalist production, ambient textures

## Generation Strategy

Generate 3–5 versions per prompt — Suno is non-deterministic. When iterating:

- Change one dimension at a time (BPM, vocal character, mood)
- Don't wholesale rewrite; isolate the variable that's off &lt;!-- orphan: 0 inbound links as of 2026-04-20 --&gt;