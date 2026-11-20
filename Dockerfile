FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/src/guard.mjs ./src/guard.mjs
COPY --from=build --chown=node:node /app/src/demo-data.mjs ./src/demo-data.mjs
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 4173
CMD ["node", "server.mjs"]
