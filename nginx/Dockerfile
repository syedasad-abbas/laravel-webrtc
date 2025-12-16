FROM nginx:1.25-alpine

RUN apk add --no-cache openssl bash gettext

COPY default.conf /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENV CERT_PATH=/etc/nginx/certs/server.crt \
    KEY_PATH=/etc/nginx/certs/server.key

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
