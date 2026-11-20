# TempleOS-Web — build the site and run its static server (node Misc/Server.mjs).
# The build clones the pinned sibling repos exactly like Misc/NetlifyBuild.sh,
# then runs `npm run build` (tests are not run).
FROM node:22-slim

# git + CA certificates are needed to clone the sibling repos over https.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies. There are no production deps; dev/test-only deps are
# skipped (tests are not run here).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the site source (build outputs and sibling dirs are excluded via
# .dockerignore and recreated below / by the build).
COPY . .

# Assemble the sibling repos at the commits pinned in Siblings.txt, then the
# HEMU siblings from hemu/Siblings.txt. Mirrors Misc/NetlifyBuild.sh.
RUN set -eux; \
    while read dir url sha; do \
      git init -q "$dir"; \
      git -C "$dir" fetch -q --depth 1 "$url" "$sha"; \
      git -C "$dir" checkout -q FETCH_HEAD; \
    done < Siblings.txt; \
    while read dir url sha; do \
      git init -q "hemu/$dir"; \
      git -C "hemu/$dir" fetch -q --depth 1 "$url" "$sha"; \
      git -C "hemu/$dir" checkout -q FETCH_HEAD; \
    done < hemu/Siblings.txt

# Build the site: HEMU engine, app WASMs and page preloads. No tests.
RUN npm run build

ENV PORT=8080
EXPOSE 8080
CMD ["node", "Misc/Server.mjs"]
