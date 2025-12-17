#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/html
STUB_DIR=/opt/laravel-stubs
FLAG_FILE="$APP_DIR/.webrtc_stubs_applied"

cd "$APP_DIR"

if [ ! -f "$APP_DIR/artisan" ]; then
    echo "Cleaning application directory..."
    find "$APP_DIR" -mindepth 1 -delete
    echo "Installing Laravel skeleton..."
    composer create-project --prefer-dist laravel/laravel . >/dev/null
    php artisan key:generate --force >/dev/null
fi

if [ ! -f "$FLAG_FILE" ]; then
    echo "Applying WebRTC scaffolding..."
    cp -R "$STUB_DIR"/. "$APP_DIR"
    php artisan key:generate --force >/dev/null
    chown -R www-data:www-data "$APP_DIR"
    touch "$FLAG_FILE"
fi

if [ -f "$APP_DIR/.env" ]; then
    target_url=${APP_URL:-https://localhost:8443}
    if grep -q '^APP_URL=' "$APP_DIR/.env"; then
        sed -i "s|^APP_URL=.*|APP_URL=${target_url}|" "$APP_DIR/.env"
    else
        printf '\nAPP_URL=%s\n' "$target_url" >>"$APP_DIR/.env"
    fi

    if grep -q '^SESSION_DRIVER=' "$APP_DIR/.env"; then
        sed -i 's/^SESSION_DRIVER=.*/SESSION_DRIVER=file/' "$APP_DIR/.env"
    else
        printf '\nSESSION_DRIVER=file\n' >>"$APP_DIR/.env"
    fi
fi

if [ -f "$APP_DIR/artisan" ]; then
    echo "Running database migrations..."
    for attempt in $(seq 1 5); do
        if php artisan migrate --force --seed; then
            break
        fi

        if [ "$attempt" -eq 5 ]; then
            echo "Database migrations failed after ${attempt} attempts."
            exit 1
        fi

        echo "Migration attempt ${attempt} failed; waiting for database..."
        sleep 5
    done
fi

exec "$@"
