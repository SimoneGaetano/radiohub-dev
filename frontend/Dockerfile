# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runtime

# X2 — controllo delle variabili del proxy (BACKEND_SCHEME/HOST/PORT): l'entrypoint
# di `nginx:alpine` esegue i file di /docker-entrypoint.d/ prima di `envsubst`,
# quindi un valore scritto male produce un messaggio comprensibile invece di
# `[emerg] invalid port in upstream`.
COPY docker-entrypoint.d/ /docker-entrypoint.d/

# X2 — il file è un **template**: l'entrypoint di `nginx:alpine` esegue
# `envsubst` su `/etc/nginx/templates/*.template` e scrive il risultato in
# `/etc/nginx/conf.d/default.conf` (sovrascrivendo quello dell'immagine). Così
# l'hostname del backend arriva dall'ambiente e la stessa immagine funziona in
# locale (`backend:4000`) e su un cloud (l'host interno del servizio backend).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]