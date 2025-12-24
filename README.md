# Laravel WebRTC Stack

This folder contains a fully containerized Laravel application that serves a minimalist WebRTC meeting experience—no Jitsi branding, just a clean UI to create or join rooms, share a link, and talk. Signaling is handled by a lightweight Socket.IO service, while Laravel renders the UI and routes.

## Contents

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | Spins up PHP-FPM (Laravel), Nginx, and the Node-based signaling service. |
| `mariadb` service | Stores user credentials, session data, and meeting metadata in MariaDB. |
| `docker/php/` | Custom PHP-FPM image that installs Laravel and applies the WebRTC scaffolding from `stubs/`. |
| `signaling/` | Socket.IO signaling server so browsers can exchange SDP offers/answers and ICE candidates. |
| `stubs/` | Blade templates, controller, routes, JS, and CSS copied into the Laravel project on first run. |
| `src/` | The working Laravel directory (populated automatically via `composer create-project`). |

## Prerequisites

- Docker + Docker Compose v2
- Internet access for the first build (to pull PHP/Node images and install Laravel via Composer)

## Usage

1. Copy the sample environment file and adjust ports if needed:
   ```bash
   cd laravel-webrtc
   cp .env.example .env
   ```

2. Start the stack:
   ```bash
   docker compose up -d --build
   ```
   The PHP container installs Laravel inside `src/` if it’s empty, applies the WebRTC stubs, and boots PHP-FPM. Nginx fronts the app on `APP_PORT` (default `8443`) with TLS and proxies `/socket.io` to the signaling service. Port `HTTP_PORT` (default `8080`) only serves ACME challenges and redirects to HTTPS—set it to `80` when obtaining real certificates.

3. Initialize the database (MariaDB is part of the compose stack) the first time you run the project:
   ```bash
   docker compose exec app php artisan migrate --seed
   ```
   This command creates the users, sessions, queue, and cache tables and seeds two accounts: `admin@example.com` / `password` (administrator) and `member@example.com` / `password` (standard user).

4. Visit `https://192.168.1.74:8443` (or your configured host/port). Sign in with one of the seeded accounts, create a room, share the link, and click “Start call.” When another user opens the same link, both peers will connect directly via WebRTC using the built-in STUN servers. Your browser will warn about the self-signed certificate until you provide a trusted one.

5. Stop everything with:
   ```bash
   docker compose down
   ```

### Architecture Notes

- **Peer-to-peer mesh:** This example uses a direct peer connection with a simple signaling server. It works best for 2–4 participants. For large meetings you’d need an SFU like Jitsi’s Videobridge, but that’s intentionally out of scope here.
- **No branding:** Blade templates (`stubs/resources/views/...`) define the clean UI. Update them anytime under `src/resources/views`.
- **Custom styling:** Edit `src/public/css/app.css` for colors, fonts, or layout tweaks.
- **Extending signaling:** The Node service lives in `signaling/`. Modify `server.js` if you want authentication, room limits, or persistence.
- **TLS & certificates:** By default, the Nginx container issues a self-signed cert. To enable Let’s Encrypt, set `ENABLE_LETSENCRYPT=1`, provide `LETSENCRYPT_DOMAIN`/`LETSENCRYPT_EMAIL`, and ensure `HTTP_PORT=80` is reachable from the public internet. (Let’s Encrypt cannot issue certificates for bare IP addresses, so you’ll need a DNS name if you want a trusted cert.) The companion `certbot` service will request and renew certificates, which are then mounted automatically by Nginx.
- **Authentication & roles:** A dedicated login page now protects the meeting dashboard. Only registered users stored in MariaDB can create rooms. Administrators can add more users (and choose whether they are standard users or admins) from the dashboard, while the page also shows the currently active users with green presence indicators. Anyone with a room link can still join without signing in.
- **Browser-to-phone dialer:** Hosts can now bridge a PSTN caller into the meeting directly from the room UI. Configure the provider credentials (`PSTN_DIALER_ENABLED`, `PSTN_PROVIDER_URL`, `PSTN_PROVIDER_TOKEN`, etc.) and the host will see a dial pad that sends the phone number to your telephony provider, who is responsible for ringing the destination and connecting the audio back into this room.

### Local PSTN Mock Provider

To test the browser dialer without a real carrier, the compose stack now includes `pstn-mock`, a tiny Express server that accepts dial requests and optionally pings your callback URL.

1. Ensure the service is running (`docker compose up -d --build` will start it automatically). It exposes `http://localhost:9400` on the host so you can inspect `/health` or `/calls`.
2. In `src/.env`, set:
   ```
   PSTN_DIALER_ENABLED=true
   PSTN_PROVIDER_URL=http://pstn-mock:4000/dial
   PSTN_PROVIDER_TOKEN=mock-token   # matches the default in .env/.env.example
   PSTN_FROM_NUMBER=+15551234567
   ```
   Restart `docker compose` (or at least the `app` container) so Laravel picks up the new settings. (Optional) Provide `PSTN_CALLBACK_URL` if you want the mock to fire a fake `call-connected` webhook.
3. Sign in as the host, start a call, and dial any number. The request will hit the mock provider, which logs it and returns a fake call ID. Visit `http://localhost:9400/calls` to see captured payloads. If you supplied `PSTN_CALLBACK_URL`, the mock will POST a `call-connected` event to that URL after a short delay (default 1.5s).

By default the mock enforces a bearer token. Set both `PSTN_MOCK_TOKEN` and `PSTN_PROVIDER_TOKEN` to the same value (or leave them blank if you want to disable authentication).

Swap the URL/token values when you are ready to talk to a real PSTN vendor—the application flow stays the same.

### Development Loop

All Laravel sources live in `src/`. After the first run you can edit controllers, views, or public assets directly and just reload the browser—no rebuild required. If you want to reapply the default WebRTC scaffolding, delete `src/.webrtc_stubs_applied` and restart the PHP container.
