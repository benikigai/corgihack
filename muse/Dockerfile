FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.js access.js bundle.js agent-tools.js agent-bootstrap.py agent-bundle.json ./
COPY public ./public
ENV NODE_ENV=production PORT=3104 DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /app /data
EXPOSE 3104
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3104/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
