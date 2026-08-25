# Stand-in for the joedwards32/cs2 image used by docker-compose.dev.yml.
# Speaks Source RCON and pushes synthetic gameplay logs, so the panel can be
# exercised end to end without the ~40 GB CS2 game-file download.
FROM node:24-alpine

WORKDIR /app
COPY server.mjs ./

EXPOSE 27015
CMD ["node", "server.mjs"]
