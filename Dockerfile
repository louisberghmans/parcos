FROM node:24.17.0-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6

LABEL org.opencontainers.image.title="ParcOS" \
      org.opencontainers.image.description="Self-hosted operating app for community parks and gardens" \
      org.opencontainers.image.source="https://github.com/louisberghmans/parcos" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.version="1.0.2"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PARCOS_DATA_DIR=/data

COPY package.json server.mjs icon.svg ./
COPY public ./public
COPY assets ./assets

# npm is not needed at runtime (the app has no third-party packages). Removing
# it also removes node-gyp's vulnerable undici 6.25.0 dependency.
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /data \
    && chown -R node:node /app /data
USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
