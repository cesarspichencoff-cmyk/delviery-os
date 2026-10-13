# DeliveryOS — piloto persistente e correlação pública de eventos (13/10/2026)

**Resultado: PROVA DE BANCADA DO PRODUTOR DURÁVEL + CONSUMIDOR SIMULADO, SEM INTEGRAÇÃO LIVE.**

## Fonte e isolamento

- Repositório: `cesarspichencoff-cmyk/delviery-os`.
- Ponto de partida preservado: `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3`, PR #108 (Q-019). PR #106 preservado.
- Servidor existente **`tools/entregas_pilot_server.ts`**, não novo backend. Executado no Foxxy sobre o mesmo commit, com configuração e dados gerados **fora do repositório**, em armazenamento temporário separado.
- Config explícita: `mode=test`, `source_mode=simulated`, `unit_id=LAB-DELIVERYOS-20261013`, `gps_production=false`, `copiloto=false`, `ENTREGAS_LABORATORIO=1`, `ENTREGAS_HTTPS=1`, `ENTREGAS_BIND=127.0.0.1`, backend `file`, apenas loopback. Certificado e chave não versionados; usuários e tokens fictícios aleatórios não publicados. Nenhuma URL de banco, iFood, Neemo ou Teknisa.
- TLS local validado com CA explícita; `/api/health` confirmou `storage_backend=file`, `https=true`, `gps_production=false`, `copiloto=false`. Requisição sem token para `/api/snapshot`: HTTP 401; com token de teste: HTTP 200.
- Atenção: mesmo sob `mode=test`, o health deste servidor usa `mode=operational` de forma fixa; o banner está configurado como laboratório não operacional e **isso não homologa semântica da UI de produção**.

## Prova real no servidor persistente

Uma Trip fictícia `LAB-PERSISTENT-T01`, pedido `LAB-ORDER-P001` e parada `LAB-DELIVERY-D01`, foi criada via HTTPS com autenticação por requisição.

1. `CreateTrip`: `preparando_saida`, outbox com dois eventos públicos `trip_created` e `delivery_added`.
2. O processo que escutava a porta 5193 foi **encerrado à força**, após conferir seu comando. O SHA-256 de `store.json` permaneceu idêntico antes e depois da interrupção.
3. Outro processo do servidor subiu no mesmo loopback e mesmo diretório de dados; a mesma Trip reapareceu `preparando_saida`, com IDs dos dois eventos preservados.
4. Com atores fictícios autorizados: `ConfirmTripDeparture` → `em_rota`; `RecordArrivalReported` → `chegada_detectada`; `ConfirmDelivery` → `entregue_confirmado`; `StartTripReturn` → `retornando`; `CloseTripManually` → `encerrada`.
5. **Segundo encerramento forçado e reinicialização**: `/api/snapshot` confirmou `encerrada` e a mesma parada `entregue_confirmado`, sem reset de Trip nem perda dos sete eventos públicos.
6. O feed durável `createFileEntregasEventFeed` retornou **7 eventos**, todos com `source_mode=simulated`. O consumidor estritamente simulado `SimulatedCopilotoConsumer` aplicou **7/7, zero isolados**, mantendo os mesmos sete `event_id`.
7. IDs e tipos dos sete eventos preservados no [recibo reduzido](evidencias/piloto-persistente-2026-10-13/eventos-publicos-sinteticos.json). Nenhum dado operacional de clientes/motoboys neste arquivo.

**Limite do vínculo:** `arrival_reported` e `delivery_confirmed` carregam `delivery_id`, não `trip_id`. A consulta de Trip do consumer simulado originalmente listava **5/7** desses fatos; o feed recebia todos. A relação foi corrigida por aresta pública `delivery_added` e separação de unidade, modo e identidade; ausência de aresta, ambiguidade e vínculo retrospectivo são recusados.

## Proposta de código, separada da regularização Q-019

**PR #109:** https://github.com/cesarspichencoff-cmyk/delviery-os/pull/109

- Branch `fix/deliveryos-copiloto-trip-delivery-correlation-20261013`.
- HEAD `a434515f8f55c458a2848d8ffc48401765303959`; base PR #108 na branch `fix/deliveryos-q019-pinned-exceptions-20261013`.
- Diff exclusivamente de `src/entregas/contracts/consumers/SimulatedCopilotoConsumer.ts` e `src/entregas/integration/run-gate-close-tests.ts`.
- Testes **14/14 PASS** (incluindo adversarial por unidade, modo, Trip ambígua e chegada anterior ao vínculo); guarda **M1/C6 40/40 PASS**; TypeScript `tsc -p tsconfig.json --noEmit` **exit 0**; replay dos sete eventos persistentes no código corrigido **7/7 PASS**.
- **PR DRAFT/HOLD; sem merge, deploy, publicação, alteração no visual, catálogo de eventos, roteamento real, permissão de GPS ou custo.** CI remoto **não confirmado** na última inspeção (nenhuma execução associada ao SHA retornada).

## O que NÃO foi provado

- A **tela do Copiloto operacional** não recebeu esses mesmos sete eventos. Ela lê a projeção `platform.event_log` via PostgreSQL somente leitura configurado em `DELIVERYOS_DATABASE_URL`. O piloto de laboratório grava `FileUnitOfWork`; um leitor simulado de `EntregasEventFeed` **não é** a mesma porta de realidade PostgreSQL. Não fabricar integração cruzando esses contratos silenciosamente.
- **Offline do Android físico ou emulado com rede cortada e fila de dispositivo persistida:** não executado nesta etapa. O teste anterior de UI DEMO com flag offline em memória continua sendo apenas simulação.
- Sessão de aparelho nativa depende da plataforma; não foi alterada nem contornada. GPS e consentimento produtivo permaneceram desligados.
- Q-020, design original, aceite humano, pedidos Neemo/Teknisa, produção, CI remoto e os gates térmicos/Windows dependentes continuam separados.

## Próximo portão técnico recomendado

**Prova observável no mesmo mundo:** em ambiente PostgreSQL temporário isolado, com `source_mode=simulated`, publicar/ingerir eventos pela **porta canônica autorizada** da plataforma e fazer `GET /api/entregas` e `GET /api/copiloto` lerem a mesma projeção por `unit_id` e `event_id`, sem escrever com credencial de leitura. Até provar esse caminho, nenhuma claim de Copiloto operacional vendo a Trip é permitida. Depois, testar rede realmente cortada no emulador e retomar fila nativa sob credenciais exclusivamente de laboratório.

**Fronteira:** servidor durável e consumer simulado PROVADOS; integração com Copiloto visual da plataforma, offline Android real e piloto em campo ABERTOS.
