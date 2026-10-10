# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runtime

# X2 — controllo e normalizzazione delle variabili del proxy
# (BACKEND_SCHEME/HOST/PORT): l'entrypoint di nginx esegue i file di
# /docker-entrypoint.d/ **prima** di `envsubst`.
#
# `chmod +x` è necessario, non cosmetico: l'entrypoint **ignora con un warning** i
# file non eseguibili, e un clone su Windows non conserva il bit di esecuzione
# (nel primo deploy reale il file è arrivato in 0644 ed è stato saltato: nginx
# è partito con il valore grezzo). Farlo qui rende il comportamento indipendente
# da chi costruisce l'immagine.
COPY docker-entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*

# X2 — il file è un **template**: l'entrypoint di `nginx:alpine` esegue
# `envsubst` su `/etc/nginx/templates/*.template` e scrive il risultato in
# `/etc/nginx/conf.d/default.conf` (sovrascrivendo quello dell'immagine). Così
# l'hostname del backend arriva dall'ambiente e la stessa immagine funziona in
# locale (`backend:4000`) e su un cloud (l'host interno del servizio backend).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]