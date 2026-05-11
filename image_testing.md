# Image-Integration Testing Playbook (saved per integration playbook)

Image handling rules for tests of the AI photo-scoring endpoint:
- Use base64-encoded images for all tests (JPEG/PNG/WEBP only).
- Do not use SVG, BMP, HEIC, animated GIFs, blank/solid-color images.
- Each image must contain real visual features (objects, edges, textures).
- Resize large images to reasonable bounds.
- For SHELF CTRL tests: real supermarket shelf photo expected; AI returns shelf_share_pct (0..100), quality (good/fair/poor), product_visibility (good/fair/poor), notes (≤240 chars).

Endpoints in scope:
- `POST /api/photo/upload` — triggers AI scoring in background. Response returns immediately with `ai_score: null`.
- `POST /api/photo/{photo_id}/rescore` — re-runs AI scoring synchronously; response contains populated `ai_score`.
- `GET /api/photo/by-customer/{code}` and `GET /api/admin/photos` — return `ai_score` if populated.

Failure modes:
- If Emergent LLM key is missing or rate-limited, `ai_score` may contain `{"error": "...", "scored_at": ISO}`. This must not break upload flow.
