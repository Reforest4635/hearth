ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM $BUILD_FROM

RUN apk add --no-cache nodejs

WORKDIR /app
COPY server.js ./
COPY run.sh ./
COPY public ./public
RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
