# Vercel AI Gateway model extraction notes

## Source index
- Archive path: `md/Archive.zip`
- Extracted screenshot directory: `md/Archive/`
- Screenshot count: 23 PNG files
- CSV output: `data/gateway-model-catalog/vercel-ai-gateway-models.csv`

## Method
- Read the required repo docs: `README.md` and `outputs/software_catalog/agents/product_specs/ai-model-gateway-agent.md`.
- Inspected the allowed naming-alignment files under `lib/providers/`, `lib/gateway/`, `data/`, `outputs/`, and `scripts/`.
- Used screenshot inspection plus local OCR as a helper, then normalized obvious OCR character substitutions conservatively.
- Preserved visibly ellipsized model ids with `...` in the CSV instead of inventing hidden characters.

## Confidence and limitations
- Rows marked `low` usually involve table-ellipsis ids or OCR-only normalization.
- When numeric cells were too ambiguous to verify confidently, fields were left blank instead of guessed.
- The archive was present as both `md/Archive.zip` and an extracted `md/Archive/` folder, so extraction proceeded from the local screenshots without any web lookups.

## Repo/docs drift
- No blocking drift found in the two required markdown files.
- The job prompt expected `Archive.zip`; the repo contains that file and an already-extracted screenshot folder.
