# Stage 1: Build React Web Frontend
FROM node:20-alpine AS web-builder
WORKDIR /workspace/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# Stage 2: Build Go API Server
FROM golang:1.22-alpine AS api-builder
WORKDIR /workspace/backend
COPY backend/go.mod ./
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /garment-api ./cmd/api

# Stage 3: Minimal Production Runtime
FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates wget
COPY --from=api-builder /garment-api /app/garment-api
COPY --from=web-builder /workspace/apps/web/dist /app/web
ENV ADDR=:8080 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/web
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/v1/health || exit 1
ENTRYPOINT ["/app/garment-api"]
