FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node database/schema.sql ./database/schema.sql
COPY --chown=node:node assets/logo.png ./assets/logo.png
COPY --chown=node:node server.js index.html gestor.html styles.css manager.css script.js gestor.js message-ui.js ./
COPY --chown=node:node ["Captura de tela de 2026-06-07 23-06-40.png", "./"]
USER node
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=5 CMD ["node", "scripts/docker-healthcheck.js"]
CMD ["node", "scripts/docker-entrypoint.js"]
