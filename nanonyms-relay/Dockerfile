FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY nanonyms-relay/package.json ./nanonyms-relay/package.json
RUN pnpm install --frozen-lockfile --filter nanonyms-relay

COPY nanonyms-relay ./nanonyms-relay
RUN pnpm --filter nanonyms-relay build
RUN pnpm deploy --filter nanonyms-relay --prod /relay

FROM node:22-alpine

WORKDIR /relay

COPY --from=builder /relay ./

RUN mkdir -p /data && chown -R node:node /data

USER node

ENV NODE_ENV=production

EXPOSE 4001 8081 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
