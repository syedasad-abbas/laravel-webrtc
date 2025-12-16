#!/bin/sh
set -e

CERT_DIR=/etc/nginx/certs
CERT_FILE=${CERT_PATH:-$CERT_DIR/server.crt}
KEY_FILE=${KEY_PATH:-$CERT_DIR/server.key}
LE_LIVE_DIR=/etc/letsencrypt/live/${LETSENCRYPT_DOMAIN}

mkdir -p "$CERT_DIR"

generate_self_signed() {
    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        echo "TLS: generating self-signed development certificate"
        openssl req -x509 -nodes -newkey rsa:2048 \
            -subj "/CN=${APP_DOMAIN:-localhost}" \
            -keyout "$KEY_FILE" \
            -out "$CERT_FILE" \
            -days 365 \
            >/dev/null 2>&1
    fi
}

link_lets_encrypt() {
    ln -sf "$LE_LIVE_DIR/fullchain.pem" "$CERT_FILE"
    ln -sf "$LE_LIVE_DIR/privkey.pem" "$KEY_FILE"
}

if [ "${ENABLE_LETSENCRYPT:-0}" = "1" ] && [ -n "${LETSENCRYPT_DOMAIN:-}" ]; then
    if [ -f "$LE_LIVE_DIR/fullchain.pem" ] && [ -f "$LE_LIVE_DIR/privkey.pem" ]; then
        echo "TLS: using existing Let's Encrypt certificate for ${LETSENCRYPT_DOMAIN}"
        link_lets_encrypt
    else
        echo "TLS: Let's Encrypt enabled, waiting for certificate while serving self-signed cert"
        generate_self_signed
        (
            while :; do
                if [ -f "$LE_LIVE_DIR/fullchain.pem" ] && [ -f "$LE_LIVE_DIR/privkey.pem" ]; then
                    echo "TLS: certificate acquired, switching to Let's Encrypt"
                    link_lets_encrypt
                    nginx -s reload || true
                    break
                fi
                sleep 10
            done
        ) &
    fi
else
    generate_self_signed
fi

envsubst '$$APP_DOMAIN $$APP_PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"
