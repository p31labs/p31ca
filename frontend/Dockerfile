FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=builder /app/dist /srv
COPY <<-'CADDYFILE' /etc/caddy/Caddyfile
:3031 {
    root * /srv
    file_server
    try_files {path} /index.html
}
CADDYFILE

EXPOSE 3031
