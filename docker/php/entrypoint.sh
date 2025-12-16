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

exec "$@"
