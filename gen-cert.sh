#!/bin/sh
#Generate a self-signed certificate for the site, once, before first start.
#Usage: ./gen-cert.sh [hostname]     (default hostname: templeos)
#The validity is ~100 years, i.e. it effectively never expires.
set -e
cd "$(dirname "$0")"

HOST="${1:-templeos}"
mkdir -p certs

openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout certs/key.pem -out certs/cert.pem \
  -days 36500 \
  -subj "/CN=$HOST" \
  -addext "subjectAltName=DNS:$HOST,DNS:localhost,IP:127.0.0.1"

echo "Wrote certs/cert.pem and certs/key.pem (CN=$HOST, valid ~100 years)."
echo "After 'docker compose up -d --build', open https://<this-server>:49311/"
