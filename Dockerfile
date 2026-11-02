# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/bitesbro.sqlite \
    CAFE_TIMEZONE=Asia/Kolkata

COPY --chown=node:node package.json package-lock.json ./
# Optional CA mount is for managed environments with a trusted HTTPS proxy.
# Normal hosting builds use the image's system trust without this mount.
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --omit=dev --ignore-scripts --no-audit --no-fund; \
    else \
      npm ci --omit=dev --ignore-scripts --no-audit --no-fund; \
    fi

COPY --chown=node:node server/ ./server/
COPY --chown=node:node public/ ./public/
RUN mkdir -p /app/data && chown node:node /app/data

USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(d=>{if(d.database!=='connected')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
