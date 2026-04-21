---
type: knowledge
created: 2026-04-16
updated: 2026-04-17
tags: [google-ads, paid-media, learning-phase, research]
---

# Google Ads: Learning Phase Rules

See also: [[domains/paid-media-incrementality]] — what learning phase optimizes toward may not be what's actually incremental (platform ROAS ≠ causal lift).

## What resets the learning phase
- Adding/removing ad groups
- Significant budget changes
- Significant bid changes
- Launching a new campaign (starts fresh at 0)

## What does NOT reset (or minimally impacts)
- Adding **negative keywords** — safe to do mid-learning
- Pausing individual keywords — lower impact, but significant volume changes may still trigger reset
- Minor ad copy edits

## Mid-learning-phase decision framework

With N days left in learning, the options are:

**Let it finish:** Add negatives only, wait for learning to exit, then restructure on full data.

**Intentional reset:** Make structural changes now (pause broad match, etc.), accept the reset, commit to a full new learning window (~30 days). Only worthwhile if you're genuinely willing to run another full cycle.

## Campaign splits during learning

**Don't split a new campaign mid-learning-phase.** A new campaign starts at zero conversions/data with its own fresh learning window. If discovery-intent keywords need testing, add them as a **new ad group within the existing campaign** — this is lower disruption than a new campaign and shares the campaign-level learning signal.

## Smart Bidding conversion volume floor

Smart Bidding needs ~10-15 conversions/month minimum to function well. Below that, the algorithm lacks signal and CPA becomes erratic.

**When cutting keywords near this floor:** Removing low-volume bad keywords can actually *improve* signal quality even if total conversions drop slightly — the algorithm learns on better examples. But if cutting drops you below ~10-15/month total, performance may destabilize regardless of signal quality.

**Implication:** At ~17 conversions total (as with outgoing.world NYC campaign), you're near the floor. Cutting 4 conversions from expensive outliers is probably net positive on signal. Cutting further would be risky.

## Broad match during learning

Broad match generates volume fast but can pollute signal with irrelevant traffic. If broad match is serving junk (competitor brand terms, out-of-market geo, wrong audience), the campaign learns on junk. Negatives are the minimum fix; pausing broad entirely resets but produces cleaner learning.
