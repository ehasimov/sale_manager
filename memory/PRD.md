# SHELF CTRL · Merchandising & Shelf Photo Control

## Overview
Field-ops mobile suite (Expo / React Native) with a FastAPI + MongoDB backend. Sales reps capture shelf photos at customer stores under strict GPS rules (30m Haversine gate). Customer GPS is set ONCE and locked. Mock-GPS attempts are blocked & logged. Photos are watermarked, queued offline and auto-synced. Admin operates a Command Center with weekly analytics and a per-customer visit schedule editor.

## Tech Stack
- Mobile: Expo SDK 54 (React Native) + Expo Router
- Backend: FastAPI (Python) + Motor + MongoDB
- Auth: JWT (bearer) + bcrypt
- Camera: expo-camera + react-native-view-shot (burns watermark)
- GPS: expo-location with `mocked` flag detection
- Photos: base64 in MongoDB (Cloudinary/S3 swap planned)
- Offline: AsyncStorage queue with auto-sync

## Roles
- `admin` — full Command Center + Reports + Schedule editor
- `sales_rep` — own route only + own Reports (read-only)

## Key Business Rules
- 30m Haversine gate (server re-validates on upload)
- Customer location editable from mobile only when unlocked; admin reset only after lock
- Mock-GPS / out-of-range attempts logged into `fake_gps_logs`
- Watermark burned into image: date · coords · user · customer code
- Offline queue auto-syncs on reconnect
- **Visit schedule** — admin sets `visits_per_week` per customer (0-7). 0 = no schedule. Reports track this/week vs target.

## Status Logic
- `uploaded` — `visits_this_week ≥ visits_per_week` OR last upload within 7 days
- `delayed` — last upload more than 7 days ago
- `not_visited` — no upload ever

## API
**Auth**
- `POST /api/auth/login`, `GET /api/auth/me`

**Customers**
- `GET /api/customers/by-user/{userId}` (returns visits_per_week + visits_this_week)
- `GET /api/customers/{code}`
- `POST /api/customer/confirm-location` (locks)

**Photos**
- `POST /api/photo/upload` (JSON: customer_code, lat/lon, device_id, photo_base64, is_mocked)
- `GET /api/photo/by-customer/{code}`

**Reports**
- `GET /api/reports/weekly` — rep sees own customers; admin sees all. Returns summary + per-customer rows.

**Admin**
- `GET /api/admin/analytics` — 7-day upload buckets + per-rep totals + KPIs
- `GET /api/admin/photos | /fake-gps-logs | /visit-history | /users`
- `POST /api/admin/customer/{code}/reset-location`
- `POST /api/admin/customer/{code}/schedule` — body `{visits_per_week: 0..7}`

**ERP (mock)**
- `GET /api/erp/customer/{code}`

## Data Models
- `users` (id, username, name, role, sales_rep_code, password_hash)
- `customers` (id, customer_code, customer_name, latitude, longitude, location_locked, route_code, sales_rep_code, **visits_per_week**, location_set_at/by)
- `photo_uploads` (id, customer_code, user_code, latitude, longitude, distance, photo_base64, upload_date, device_id, username)
- `fake_gps_logs` (id, user_code, customer_code, latitude, longitude, reason, created_at)

## Frontend Screens
- `login` — branded auth with autofill chips
- `(tabs)/customers` — daily route, hero progress, KPI tiles, filter chips, animated cards
- `(tabs)/reports` — weekly completion ring, 7-day bar chart, by-rep ranking, per-customer schedule progress + admin Edit modal (0..7 / week)
- `(tabs)/admin` — segmented Command Center (Photos / Alerts / Stores / Team)
- `(tabs)/profile` — operator card, security policy, build pills
- `customer/[code]` — hero, distance gauge with pulsing ring, mini map, sticky bottom CTA
- `camera` — corner brackets + scan line + watermark overlay (burned-in)

## Test Accounts
- `admin` / `Admin@2026` (admin)
- `rep01` / `Rep@2026` (SR001 → C001..C004)
- `rep02` / `Rep@2026` (SR002 → C005)

## Test Coverage
- 39/39 backend tests passing (auth, customers, photos, reports, analytics, schedule, status logic, regressions).

## Future Enhancements
- Cloudinary / S3 photo storage migration (production volume)
- Push reminders for late visits (geofenced)
- Photo-quality / shelf-share AI scoring
- Real ERP webhook ingestion
