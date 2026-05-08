# SHELF CTRL · Merchandising & Shelf Photo Control

## Overview
A field-ops mobile suite (Expo / React Native) with a FastAPI + MongoDB backend that lets sales reps capture shelf photos at customer stores under strict GPS rules. Customer locations come from an ERP, can be set ONCE on-site, and become locked. Photo capture is gated by a 30-meter Haversine distance check, with mock-GPS detection, offline queueing, and an admin command center.

## Tech Stack
- Mobile: Expo SDK 54 (React Native) + Expo Router
- Backend: FastAPI (Python), Motor + MongoDB
- Auth: JWT (bearer) + bcrypt
- Camera: expo-camera + react-native-view-shot (burns watermark into image)
- GPS: expo-location with `mocked` flag detection
- Storage: photos as base64 in MongoDB
- Offline: AsyncStorage queue with auto-sync

## Roles
- `admin` — full Command Center: photos, fake-GPS logs, customer reset, users
- `sales_rep` — own customer route only, with status-aware UI

## Key Rules
- **30m gate** (Haversine) — server re-checks on every upload
- **Location-locked** customer cannot be edited from mobile after first save
- **Mock-GPS / out-of-range** attempts are logged into `fake_gps_logs`
- **Offline mode** — failed uploads queue & auto-sync when reconnected
- **Watermark** — date/time, coordinates, username + customer code burned into the image

## API
- `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/customers/by-user/{userId}`, `GET /api/customers/{code}`
- `POST /api/customer/confirm-location`
- `POST /api/photo/upload`, `GET /api/photo/by-customer/{code}`
- Admin: `GET /api/admin/photos|fake-gps-logs|visit-history|users`, `POST /api/admin/customer/{code}/reset-location`
- Mock ERP: `GET /api/erp/customer/{code}` (camelCase ERP shape)

## Data Models
- `users` (id, username, name, role, sales_rep_code, password_hash)
- `customers` (id, customer_code, customer_name, latitude, longitude, location_locked, route_code, sales_rep_code, location_set_at/by)
- `photo_uploads` (id, customer_code, user_code, latitude, longitude, distance, photo_base64, upload_date, device_id, username)
- `fake_gps_logs` (id, user_code, customer_code, latitude, longitude, reason, created_at)

## Test Accounts
- `admin` / `Admin@2026` (admin)
- `rep01` / `Rep@2026` (SR001 → C001..C004)
- `rep02` / `Rep@2026` (SR002 → C005)

## Status Logic
- No upload → `not_visited`
- Upload within 7 days → `uploaded`
- Last upload > 7 days → `delayed`

## Future Enhancements
- Real ERP webhook ingestion
- Geofenced push reminders
- Photo quality / shelf-share AI scoring (revenue lever for SaaS)
- Cloud blob storage migration (S3/Azure) for large photo volumes
