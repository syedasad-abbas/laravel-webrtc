# Kubernetes Deployment Guide

This folder mirrors the Docker Compose stack with Kubernetes manifests so you can run Laravel WebRTC in a cluster without removing `docker-compose.yml`. The manifests assume a namespace called `laravel-webrtc` and keep the same components:

- **webrtc-web**: single Pod with the PHP-FPM app container, the custom Nginx TLS proxy, and an embedded certbot sidecar sharing the same volumes.
- **mariadb**: standalone deployment with a persistent volume.
- **signaling**: Socket.IO signaling service (Node.js).
- **pstn-mock**: optional PSTN provider mock for local dialer testing.

> **Images:** build and push the custom images (`laravel-webrtc-app`, `laravel-webrtc-nginx`, `laravel-webrtc-signaling`, `laravel-webrtc-pstn-mock`) to a registry you control, then update the `image:` fields inside `k8s/*deployment*.yaml`. Example build commands:
> ```bash
> docker build -t ghcr.io/you/laravel-webrtc-app:latest -f docker/php/Dockerfile .
> docker build -t ghcr.io/you/laravel-webrtc-nginx:latest nginx
> docker build -t ghcr.io/you/laravel-webrtc-signaling:latest signaling
> docker build -t ghcr.io/you/laravel-webrtc-pstn-mock:latest mock-pstn-provider
> docker push ghcr.io/you/laravel-webrtc-*
> ```

## Files

| File | Purpose |
| --- | --- |
| `namespace.yaml` | Creates the `laravel-webrtc` namespace. |
| `configmap-app.yaml` | Shared non-secret environment values (URLs, feature flags). |
| `secret-app.yaml` | Credentials (database, PSTN token, Laravel app key). Fill in `APP_KEY` with `php artisan key:generate --show`. |
| `storage.yaml` | PersistentVolumeClaims for app code, certbot data, and MariaDB. Adjust `storageClassName` to your cluster defaults. |
| `deployment-web.yaml` | Multi-container pod (PHP, Nginx, certbot) mounting the shared volumes. |
| `web-service.yaml` | Type `LoadBalancer` service that exposes ports 80/8443. Switch to `NodePort`/Ingress if required. |
| `mariadb-deployment.yaml` | MariaDB deployment + ClusterIP service. |
| `signaling-deployment.yaml` | Socket.IO deployment + ClusterIP service at `signaling:3000`. |
| `pstn-mock-deployment.yaml` | Optional mock provider deployment + service. Disable if using a real carrier. |

## Deploy Steps

1. **Adjust configuration**
   - Update `configmap-app.yaml` with your domain, callback URLs, and PSTN settings.
   - Update `secret-app.yaml` with real passwords / API tokens. The `APP_KEY` must be non-empty in production.
   - If you plan to disable the PSTN mock, set `PSTN_DIALER_ENABLED=false` and remove the `pstn-mock` deployment.

2. **Apply manifests**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/configmap-app.yaml
   kubectl apply -f k8s/secret-app.yaml
   kubectl apply -f k8s/storage.yaml
   kubectl apply -f k8s/mariadb-deployment.yaml
   kubectl apply -f k8s/signaling-deployment.yaml
   kubectl apply -f k8s/pstn-mock-deployment.yaml   # optional
   kubectl apply -f k8s/deployment-web.yaml
   kubectl apply -f k8s/web-service.yaml
   ```

3. **Verify**
   - Wait for pods to become ready: `kubectl get pods -n laravel-webrtc`.
   - Once `webrtc-web` is running, run `kubectl logs -n laravel-webrtc deploy/webrtc-web -c app` to confirm Laravel installed and migrations ran.
   - The external IP on `Service/webrtc-web` exposes HTTPS (8443) and HTTP (80 redirect). Update DNS to point to the load balancer IP.

4. **TLS**
   - Set `ENABLE_LETSENCRYPT=1`, `LETSENCRYPT_DOMAIN`, and `LETSENCRYPT_EMAIL` in the ConfigMap once the DNS record points to your load balancer. The certbot sidecar will request/renew certificates and the Nginx container automatically switches from the self-signed cert to `/etc/letsencrypt`.
   - If you prefer cert-manager/Ingress, disable the certbot container by setting `ENABLE_LETSENCRYPT=0` and manage TLS via your ingress resources instead.

5. **PSTN dialer**
   - For the built-in mock, leave `PSTN_PROVIDER_URL=http://pstn-mock:4000/dial` and `PSTN_PROVIDER_TOKEN=mock-token` in the ConfigMap/Secret. The mock logs each request (`kubectl logs deploy/pstn-mock`) and exposes history via `kubectl port-forward svc/pstn-mock 9400:4000`.
   - To switch to a real carrier, update `PSTN_PROVIDER_URL`, `PSTN_PROVIDER_TOKEN`, and `PSTN_FROM_NUMBER` in the ConfigMap/Secret, then restart the `webrtc-web` deployment.

## Notes

- The shared `app-code` volume stores the Laravel installation, vendor cache, and user uploads so the PHP and Nginx containers remain in sync. It must support `ReadWriteOnce`, which is sufficient because both containers live in the same pod.
- If your storage class doesn’t allow `ReadWriteOnce` on multiple mounts per pod, change `app-code` to `ReadWriteMany` and use an RWX-capable class (e.g., NFS, EFS).
- Database backups and migrations remain your responsibility. Use `kubectl exec` into the `mariadb` pod for ad-hoc SQL or hook in your existing backup tooling.
- Keep `docker-compose.yml` for local development—the Kubernetes manifests are additive and live under `k8s/`.
