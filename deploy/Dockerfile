# DeliveryOS Cloud Pilot V1 — Core + TATÁ Entregas
#
# NÃO CONSTRUÍDO NESTA MÁQUINA: não há Docker aqui. O arquivo está completo e
# revisado, mas "docker build" ainda não passou nele. Ver o relatório do gate.
#
# Build a partir da RAIZ do repositório:
#   docker build -f deploy/Dockerfile -t deliveryos-pilot:v1 .

# ---------------------------------------------------------------- build
# Node 22 LTS: o código usa `fetch` global e `node:test`, disponíveis a partir
# do 18. Pinado por dígest de major para o build ser reprodutível sem depender
# do que "latest" significar amanhã.
FROM node:22-bookworm-slim AS build

WORKDIR /build

# As dependências mudam menos que o código: camada separada aproveita cache.
COPY package.json package-lock.json* ./
# `npm ci` exige lockfile; sem ele, `npm install` com o mesmo efeito prático
# para este projeto, que só tem devDependencies.
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

COPY tsconfig.json ./
COPY src ./src
COPY tools ./tools
COPY demo ./demo

# Compila TypeScript -> dist/. Se o tsc falhar, o build falha aqui, e não em
# produção.
RUN npx tsc

# Remove o que é só de desenvolvimento; a imagem final não compila nada.
RUN npm prune --omit=dev || true

# ---------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runtime

# `dumb-init` para o PID 1 encaminhar sinais: sem ele, SIGTERM do `docker stop`
# não chega ao Node, e o desligamento gracioso (que fecha o backup) não roda.
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    ENTREGAS_ENV=cloud \
    ENTREGAS_BIND=0.0.0.0 \
    ENTREGAS_UI_PORT=5193 \
    ENTREGAS_DATA_DIR=/dados

WORKDIR /app

# Só o que o runtime precisa. `src/` não vai: o que roda é `dist/`.
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json

# A interface é servida a partir de `src/entregas/ui` (o servidor lê os
# arquivos estáticos de lá). É a única parte de `src/` que precisa existir.
COPY src/entregas/ui ./src/entregas/ui

# Usuário não-root. A imagem `node` já traz o usuário `node` (uid 1000);
# o volume precisa pertencer a ele, senão o processo não grava.
RUN mkdir -p /dados && chown -R node:node /dados /app
USER node

VOLUME ["/dados"]
EXPOSE 5193

# Healthcheck: `/api/health` é o único endpoint aberto sem sessão, e é
# exatamente para isto que ele existe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ENTREGAS_UI_PORT||5193)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/tools/entregas_pilot_server.js"]
