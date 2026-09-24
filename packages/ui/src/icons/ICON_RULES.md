# EDS Icon Drawing Rules (D05, CANDIDATE)

Instruments, not artefacts. Ethen icons read as measuring tools. Hand-drawn,
woodcut and engraved illustration are out of bounds — too close to another
company's analogue territory.

## The rules

| # | Rule | Value |
|---|---|---|
| 1 | Grid | 24 units, `viewBox="0 0 24 24"` |
| 2 | Stroke | 1.5px uniform, every mark |
| 3 | Caps | butt, never rounded |
| 4 | Joins | miter, never rounded |
| 5 | Geometry radius | <= 2px (corners are crisp, not sharp enough to cut) |
| 6 | Fill | stroke-only; solid fill reserved for the selected state |
| 7 | Colour | `currentColor` throughout; no icon names a colour token |
| 8 | Alignment | symbols sit on the pixel baseline; legible at 16px |
| 9 | Meaning | decorative icons are `aria-hidden`; meaningful icons carry labels; never colour-only meaning |
| 10 | Forced colors | stroke-only + `currentColor` is what survives forced-colors; a fill-based icon disappears |

## The seven originals

| Icon | What the mark depicts | Why |
|---|---|---|
| Authority | a sceptre bar set inside a signet ring | authority is granted, not taken |
| Receipt | a torn slip with a serrated return edge | every action leaves a receipt |
| Evidence | a lens over a ground baseline | claims are checked against the ground |
| Verification | a check struck against a plumb line | verification is measurement, not opinion |
| Judgement | a balance with two pans | judgement weighs, it does not point |
| Ground truth | a survey benchmark over hatch marks | the fixed point everything else is measured from |
| Thread | a needle and its trailing line | a thread holds separate moments together |

## The ordinary set

File, search and settings arrived with the moved twenty. Chevron (down/left/right),
close and check complete the set. Deliberately unremarkable — these should be
invisible. No character was invented here on purpose.

## Normalisation findings (moved twenty)

- **V1 — grid.** Source art was 14-unit. Each mark is centred in the 24-unit grid
  with `translate(5 5)` (5 + 14 + 5 = 24), stroke untouched at 1.5px. No redraw,
  no meaning change.
- **C1 — caps and joins.** Converted to butt/miter throughout: clock hands,
  settings rays, project/files/search/git/tasks/chats rules, terminal prompt,
  shield check, plus arms, permissions shackle, star and sparkle points,
  terminal frame joins. Visual change is negligible at 16px; meaning unchanged.
- **F1 — fills kept, flagged.** Three marks are fill-based and cannot go
  stroke-only without changing what they are: `compose` (solid pencil
  silhouette), `grid` (four solid app tiles), `models` (solid centre node).
  They are kept verbatim and reported here. Redrawing them is a D06-or-later
  art decision, not a silent normalisation.
- Geometry radii in the moved set are all <= 2px (0.5–1.5). No violations.

## Known divergence

`components/shell/NavItem.tsx` still carries its inline 20-entry map. This job
was scoped to build the module without touching production files, so the
extraction (NavItem imports from `components/icons/`) is left to a follow-up
job. Until then the two sets are duplicated by intent, and the Lab — not
NavItem — is the authority on the icon language.
