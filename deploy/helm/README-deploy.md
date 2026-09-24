# Deploying worldmonitor to Kubernetes

Redis runs in-cluster as its own pod (same `redis:7-alpine` image
docker-compose.yml uses), with a PVC for its data - same shape as Compose,
just on Kubernetes. `redis-rest` (the Upstash REST shim) runs alongside it.

## One-time setup

1. Build and push the three images to ECR:
   ```bash
   docker build -t <registry>/worldmonitor:latest -f Dockerfile .
   docker build -t <registry>/worldmonitor-ais-relay:latest -f Dockerfile.relay .
   docker build -t <registry>/worldmonitor-redis-rest:latest -f docker/Dockerfile.redis-rest docker
   docker push <registry>/worldmonitor:latest
   docker push <registry>/worldmonitor-ais-relay:latest
   docker push <registry>/worldmonitor-redis-rest:latest
   ```
   The app image reads `VITE_*` build-time variables (e.g.
   `VITE_SELF_HOSTED_UNLOCK_PREMIUM`) from `.env` during `vite build` - make
   sure whatever CI builds this image has that `.env` (or equivalent) present
   in the build context.

2. Create the Secret out-of-band (never through Helm values):
   ```bash
   kubectl create namespace worldmonitor

   kubectl -n worldmonitor create secret generic worldmonitor-secrets \
     --from-literal=REDIS_PASSWORD="$(openssl rand -hex 32)" \
     --from-literal=REDIS_TOKEN="$(openssl rand -hex 32)" \
     --from-literal=RELAY_SHARED_SECRET="$(openssl rand -hex 32)" \
     --from-literal=LOCAL_API_TOKEN="$(openssl rand -hex 32)" \
     --from-literal=GROQ_API_KEY=... \
     --from-literal=AISSTREAM_API_KEY=...
     # ...and any other optional API keys from docker-compose.yml you use.
   ```
   `REDIS_PASSWORD` is what the in-cluster redis pod is started with
   (`--requirepass`) - you're choosing this value, not fetching it from
   anywhere. `REDIS_TOKEN` is a separate, unrelated value: the redis-rest
   shim's own bearer token that the app and ais-relay present to it.

3. Copy `values-prod.yaml.example` to `values-prod.yaml` (gitignored) and fill
   in the image repos/tags and the Secret name from step 2.

4. If you want the app reachable from outside the cluster (replacing the
   manual nginx on the EC2 host that forwards `:3443` today), install the
   **AWS Load Balancer Controller** first - see mosaic_common_service's
   `deploy/PLATFORM.md` ("Cluster addons") for that; it's a one-time,
   cluster-wide install shared by every service's Ingress, not something
   this chart does for you, and the Ingress resource here does nothing
   without it. Then set `app.ingress.enabled: true` in `values-prod.yaml` -
   the chart's defaults already point it at plain HTTP with no host (no
   domain needed yet; see the comment on `app.ingress` in `values.yaml`).
   Once deployed, find the ALB's address with:
   ```bash
   kubectl -n worldmonitor get ingress
   ```
   and point whatever currently hits `:3443` at that address instead -
   then the EC2-host nginx can be decommissioned.

## Install / upgrade

```bash
helm upgrade --install worldmonitor ./worldmonitor \
  -n worldmonitor --create-namespace \
  -f worldmonitor/values-prod.yaml
```

## Verify

```bash
kubectl -n worldmonitor get pods
kubectl -n worldmonitor port-forward svc/worldmonitor-worldmonitor-app 8080:8080
curl localhost:8080/api/sidecar-health
```

## Rollback

```bash
helm -n worldmonitor history worldmonitor
helm -n worldmonitor rollback worldmonitor <revision>
```
