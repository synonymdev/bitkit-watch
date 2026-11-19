# Static site, no build step. The first stage collects only the files that
# are served, so repo tooling (scripts/, docs/, .git) never reaches the image.

# --- Collect site files ---
FROM alpine:3.22 AS site
WORKDIR /site

COPY index.html privacy-policy.html terms-of-use.html ./
COPY app.js styles.css site.webmanifest ./
COPY favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png ./
COPY android-chrome-192x192.png android-chrome-512x512.png ./
COPY LICENSE.txt ./
COPY assets ./assets

# --- Production ---
FROM nginxinc/nginx-unprivileged:stable-alpine-slim AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=site /site /app

EXPOSE 3000
