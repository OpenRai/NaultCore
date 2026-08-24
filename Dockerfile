# Build the Angular app with the repository's supported toolchain.
FROM node:22-bookworm-slim AS build
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y \
  ca-certificates \
  g++ \
  git \
  libudev-dev \
  libusb-1.0-0-dev \
  make \
  python3 \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack install --global pnpm@11.1.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run wallet:build

# Serve the generated static app with a maintained nginx Alpine image.
FROM nginx:1.27-alpine
COPY .docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
