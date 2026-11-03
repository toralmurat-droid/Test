# Builds and runs the whole game (client + server) as one app on one port.
# Used by the host (e.g. Railway) to deploy. See DEPLOY.md.
FROM node:22-slim

WORKDIR /app

# Install packages first so they are cached between deploys
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the code and build the browser client into dist/
COPY . .
RUN npm run build

# Player saves and the idea log live here. Mount a persistent volume at /app/data
# or every redeploy wipes all accounts.
ENV NODE_ENV=production \
    SAVE_FILE=/app/data/saves.json \
    IDEAS_FILE=/app/data/ideas.json \
    TRUST_PROXY=1
RUN mkdir -p /app/data

# The host sets PORT; 2567 is the fallback
EXPOSE 2567
CMD ["npx", "tsx", "server/index.ts"]
