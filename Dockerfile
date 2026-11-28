FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

ARG PARCOS_VERSION=1.5.0
LABEL org.opencontainers.image.title="ParcOS" \
      org.opencontainers.image.description="Self-hosted operating app for community parks and gardens" \
      org.opencontainers.image.source="https://github.com/louisberghmans/parcos" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.version="${PARCOS_VERSION}"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PARCOS_DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY server.mjs backup.mjs restore.mjs icon.svg ./
COPY src ./src
COPY public ./public
COPY assets ./assets

# npm is not needed at runtime; only the locked production modules remain.
RUN mkdir -p /data /restore-target /restore-staging \
    && chown -R node:node /app /data /restore-target /restore-staging
USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
