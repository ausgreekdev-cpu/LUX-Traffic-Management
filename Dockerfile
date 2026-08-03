# syntax=docker/dockerfile:1

# ---- Stage 1: build frontend ----
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend runtime ----
FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && \
    npm rebuild better-sqlite3 && \
    npm cache clean --force && \
    apk del python3 make g++

COPY backend/src ./src
COPY backend/data/wa-lga-directory.json ./data/wa-lga-directory.json

COPY --from=frontend /build/dist /app/frontend/dist

RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/data /app/uploads && \
    chown -R app:app /app

USER app
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/tmpcms.db
ENV UPLOADS_DIR=/app/uploads
ENV CORS_ORIGIN=http://localhost:3001

VOLUME ["/app/data", "/app/uploads"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]