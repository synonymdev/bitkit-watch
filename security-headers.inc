add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://mempool.space https://blockstream.info https://api.exchange.coinbase.com https://api.coinbase.com; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()" always;
# Enable once HTTPS on the load balancer is confirmed (docs/deployment.md).
# add_header Strict-Transport-Security "max-age=31536000" always;
