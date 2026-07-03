# Vite + React frontend. `vite preview` serves the production build and
# proxies /api to the backend (see vite.config.ts); swap for nginx when a
# real production deploy materializes (see SCALING_PLAN.md).
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
