# Single deployable: the Express API also serves the built React app.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/data/carepath.db TRUST_PROXY=1
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/src/index.ts"]
