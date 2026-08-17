FROM node:22-alpine

WORKDIR /app

# The "new version of npm available" notice is advisory and prints on every
# build. Silenced rather than acted on: a major npm bump changes dependency
# resolution, and these builds run unattended on other people's machines.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
