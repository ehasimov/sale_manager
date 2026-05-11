# SHELF CTRL · Merchandising & Shelf Photo Control (v1.2)

## Overview
Field-ops mobile suite with FastAPI + MongoDB backend. Sales reps capture shelf photos at customer stores under strict GPS rules. Customer GPS is set ONCE and locked. Mock-GPS blocked + logged. Photos watermarked, queued offline, auto-synced. **AI photo scoring** evaluates shelf share / quality / product visibility. Admin sets weekly visit schedules and sees a live dashboard.

## Tech Stack
- Mobile: Expo SDK 54 (React Native) + Expo Router
- Backend: FastAPI + Motor + MongoDB
- Auth: JWT + bcrypt
- Camera: expo-camera + react-native-view-shot (burned watermark)
- GPS: expo-location with mock-flag detection
- **AI**: Gemini 2.5 Flash via Emergent LLM key (vision)
- **Local notifications**: expo-notifications (throttled visit reminders)
- Offline: AsyncStorage queue with auto-sync
- Photos: base64 in MongoDB (Cloudinary/S3 swap planned)

## Roles
- `admin` — Command Center, Reports (all), Schedule editor, Rescore action
- `sales_rep` — own route, own Reports, photo rescore on own uploads

## Business Rules
- 30m Haversine gate (server re-validates)
- Customer location settable once; admin reset to clear
- Mock-GPS / out-of-range attempts logged → admin alerts
- Watermark burned into image: date · coords · user · code
- Offline queue auto-syncs on reconnect
- Visit schedule: 0..7 / week per customer (admin sets)
- AI score auto-fires on upload (background); rescore endpoint available

## API
**Auth** — `POST /api/auth/login`, `GET /api/auth/me`

**Customers** — `GET /api/customers/by-user/{userId}`, `GET /api/customers/{code}`, `POST /api/customer/confirm-location`

**Photos** — `POST /api/photo/upload`, `GET /api/photo/by-customer/{code}`, **`POST /api/photo/{photo_id}/rescore`** (new)

**Reports** — `GET /api/reports/weekly`

**Admin** — `GET /api/admin/analytics | /photos | /fake-gps-logs | /visit-history | /users`, `POST /api/admin/customer/{code}/reset-location`, `POST /api/admin/customer/{code}/schedule`

**ERP** — `GET /api/erp/customer/{code}`

## Data
- `users`, `customers` (+ visits_per_week), `photo_uploads` (+ `ai_score: {shelf_share_pct, quality, product_visibility, notes, scored_at, model}`), `fake_gps_logs`

## Frontend Screens
- `login` — hero, autofill chips, eye-toggle
- `(tabs)/customers` — Routes hero, KPI tiles, animated cards, **local notifications** for late visits
- `(tabs)/reports` — completion ring, 7-day bar chart, by-rep ranking, schedule editor modal
- `(tabs)/admin` — Photos / Alerts / Stores / Team with **AI ✨ score badge** on each photo
- `(tabs)/profile` — operator card, security policy, build pills
- `customer/[code]` — distance gauge, mini map, sticky bottom CTA, photo grid with AI badges
- `camera` — corner brackets + scan line + watermark overlay

## Test Coverage
- **Backend: 46/46 passing** (25 base + 14 weekly/schedule + 7 AI scoring)
- Includes Gemini 2.5 Flash live AI scoring with EMERGENT_LLM_KEY

## Test Accounts
- `admin / Admin@2026`
- `rep01 / Rep@2026` (SR001 → C001..C004)
- `rep02 / Rep@2026` (SR002 → C005)

## Future Enhancements
- Cloudinary / S3 photo storage migration (production volume — needs keys)
- Background geofencing for proximity-triggered notifications (needs dev client)
- AI score history & per-rep average shelf-share trend chart
- Real ERP webhook ingestion
