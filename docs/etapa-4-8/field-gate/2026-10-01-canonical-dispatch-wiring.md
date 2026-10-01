# Despacho ligado ao GPS canônico da plataforma

Data: 2026-10-01
Host: Foxxy
Base Git: `c6852b3014558f073f91d880368b01f43a401680`
Resultado: **CODE_READY + TEST_PASS; ativação operacional NOT_RUN**

## Problema fechado no código

O Android já envia GPS para a plataforma e `platform.event_log` é a verdade
durável. A central, porém, ainda consultava `pointsByTrip` no piloto.

Persistir ou replicar essa memória criaria uma segunda verdade. A solução foi
manter a leitura junto da autoridade canônica e levar ao piloto apenas uma
leitura autenticada, curta e explicitamente autorizada.

## Fronteira implementada

O runtime crítico expõe leitura de localização e rota sobre
`platform.event_log` usando a porta `READ ONLY`.
O piloto autentica a consulta com uma assertion HMAC de curta duração,
vinculada a:

- unidade;
- ator humano;
- papel;
- viagem;
- escopo `location` ou `route`;
- emissão/expiração;
- versão do contrato.

O segredo desta assertion é separado do segredo dos tokens dos celulares.
O mapa `DELIVERYOS_PILOT_READ_SECRETS` permite segredo distinto por unidade;
o piloto recebe apenas `ENTREGAS_PLATFORM_READ_SECRET` da própria unidade.

Segredos curtos ou placeholders como CHANGE_ME, GERE ou SUBSTITUA são
recusados. Nenhum segredo real foi gerado ou versionado.

## Sem segunda verdade

Quando `ENTREGAS_PLATFORM_URL` está configurada:

- `/api/trip/location` usa `platform.event_log`;
- `/api/trip/route` usa `platform.event_log`;
- falha/ausência do segredo responde indisponibilidade explícita;
- não existe fallback silencioso para `pointsByTrip`;
- `/api/gps/batch` legado vira tombstone 503 retentável, para APK antigo
  preservar a fila local em vez de gravar uma segunda cópia.

A memória `pointsByTrip` permanece apenas como compatibilidade de laboratório
quando a plataforma não está configurada.

## Autorização

A política de visualização de rota foi centralizada em
`foundation/route-access.ts`.

Papéis sem acesso à rota não conseguem emitir assertion de escopo `route`.
A leitura de `location` pode devolver metadados/frescor sem coordenadas para
papel não autorizado.

O piloto continua auditando consultas de rota sem escrever coordenadas no log.

## Provas executadas

- assertion + rota de plataforma: **6/6 PASS**;
- integração HTTP piloto ↔ plataforma: **5/5 PASS**;
- device API: **43/43 PASS**;
- capture-control HTTP: **6/6 PASS**;
- deploy-audit do piloto: **39/39 PASS**;
- platform deploy-audit: **30/30 PASS**;
- governança: **14/14 / GOVERNANCE_GATE_GREEN**;
- TypeScript: PASS;
- `git diff --check`: PASS.

Controles negativos medidos:

- assertion adulterada é recusada;
- assertion expirada é recusada;
- token de uma viagem não serve para outra;
- motoboy não consegue assertion de rota;
- plataforma configurada sem segredo não cai para RAM: responde 503;
- ingest GPS legado responde 503 retentável quando a plataforma é autoridade.

## Fronteira de prova

Não foi executado nesta sessão:

- PostgreSQL real para as novas rotas, pois `DELIVERYOS_PG_URL` está ausente;
- render/subida real do Compose, pois Docker está ausente no Foxxy;
- geração/configuração dos segredos operacionais;
- deploy;
- uso em aparelho físico.

Portanto esta frente está **CODE_READY + TEST_PASS**, não DEPLOYED nem
WORLD_PROVEN. Nenhum privilégio amplo foi concedido ao papel
`deliveryos_entregas_pilot`; a leitura continua no runtime crítico, cujo papel
já possui o SELECT necessário para sua própria operação.
