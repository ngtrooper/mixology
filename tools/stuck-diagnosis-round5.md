# Round-5 stuck-pot diagnosis — NUMBERS ONLY (implementation on HOLD)

Measured 2026-10-18 against the current round-4 engine, before any fix.
Reproduce: `node tools/diagnose-stuck.js` (engine-level; recovery measured
as pouring against the pot at the shipped 30 drops/sec; "moved" = the mix
has traveled ΔE00 ≥ 10 from its starting color).

**Producer decision pending:** Jon is reconsidering the core model
(drops-accumulation vs an "always out of 100" percentage pot). Pour Out
is NOT built. These numbers quantify the current model's failure either
way — they are the "before" column for whichever model ships.

## (a) Mud pot — 130 R + 130 Y + 130 B into base 30 (total 420 drops)

- Start: `#48382E`, Lab 25.0 / 5.4 / 9.0
- Pouring WHITE to recover: **231 drops = 7.7 s of continuous holding**
  to move ΔE ≥ 10 (achieved 10.1; L* 25.0 → 37.6).
- Verdict: recoverable in theory, stuck in practice — nobody holds a
  pour for 8 s to see the first real lightening.

## (b) Black pot — 200 K into base 30 (total 230 drops)

- Start: `#1A1A1C`, Lab 9.3 / 0.5 / −1.4
- Pouring RED to recover: **119 drops = 4.0 s of continuous holding**
  to move ΔE ≥ 10.
- Verdict: same disease, milder dose — the round-4 share damper helps
  black, but the first ~4 s of pouring is effectively invisible.

## (c) Other stuck states found in the sweep

1. **Cap lock-in (hard stuck).** Pot {60, 60, 60, 0, base = 1200}
   (total 1,380): white is at MAX_DROPS, so every further white dose is
   refused — lightening by pouring white is *impossible*, not just slow.
   Reset is the only escape.
2. **Volume ceiling (hard stuck).** After long mess-around pours the pot
   reaches {1200, 1200, 1200, 0, base 30} (total 3,630). Pouring white
   from there hits the white cap (1,200) before the color ever moves
   ΔE 10 — **recovery by pouring never arrives at all**.
3. **Undo granularity (practical stuck).** `dose()` pushes one undo
   entry per drop and Undo pops one per click. A single 3 s pour =
   90 drops = 90 undo entries → up to **90 Undo clicks** to take back
   one pour. Undo is not a viable recovery path for a messed pot.
4. **Reviewed and clean (code review, no defect found):** pour-stop
   paths (pointerup / pointercancel / lostpointercapture all stop the
   interval; the interval also stops itself at the cap), and the seal
   flow (`seal()` / `finish()` / `undo()` / `resetPot()` all call
   `stopPour()` first; sealing a huge pot records normally).

## Root-cause summary

Volume lock-in, as suspected: past a few hundred total drops, each new
drop is a tiny share of the pot, so counter-pouring moves the color at a
glacial pace (7.7 s / 4.0 s to the first ΔE 10), and at the per-pigment
cap it stops moving entirely. The pot is a one-way ratchet — paint only
ever goes in.
