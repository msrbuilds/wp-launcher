FROM node:22-alpine AS build

WORKDIR /app
# The "new version of npm available" notice is advisory and prints on every
# build. Silenced rather than acted on: a major npm bump changes dependency
# resolution, and these builds run unattended on other people's machines.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
