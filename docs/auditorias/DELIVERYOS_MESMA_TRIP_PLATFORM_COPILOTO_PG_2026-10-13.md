# DeliveryOS — Mesma viagem simulada em Entregas e Copiloto (13/10/2026)

**Prova: PASS PARCIAL COM LIMITES DECLARADOS.** Cinco superfícies de prova: outbox original, ingestão canônica, PostgreSQL temporário, `/api/entregas`, `/api/copiloto`; telas renderizadas em Chromium mobile. **Não é publicação, piloto físico, nem ativação de integração contínua.**

## Identidades de origem e isolamento

- Código executado: `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3`, candidate PR #108. Código original **intocado** e checkout limpo. PR #106/#108/#109 permanecem sujeitos aos próprios gates.
- Fonte: o `store.json` em arquivo do piloto persistente isolado, produzido em bancada na mesma sessão, com os **sete eventos** da Trip `LAB-PERSISTENT-T01`, unidade `LAB-DELIVERYOS-20261013`, entrega `LAB-DELIVERY-D01` e `source_mode=simulated`. Não reescrever, reemitir ou fabricar IDs.
- Banco: **PostgreSQL 18 local totalmente separado**, cluster novo sob `/tmp/deliveryos-pg-isolated-20261013` no WSL Ubuntu, porta **55439**, bind local `127.0.0.1`; o PostgreSQL preexistente em **5432 não foi usado**. Os scripts `bancoIsolado` criam/migram/apagam bancos exclusivos por execução.
- Execução Windows: o runner Node herdado lança `npx` sem `.cmd`; a primeira tentativa falhou com `spawn npx ENOENT` antes da prova. Corrigido **somente no processo de teste**, por um preload temporário redirecionando o executável. Nenhuma fonte, produção ou gate foi alterado.

## Testes executados

| Prova | Resultado |
|---|---|
| `tests/product/run-entregas-servidor-pg-tests.ts` | **7/7 PASS** — Entregas/Copiloto leem a mesma projeção PostgreSQL; filtro de unidade e leitura sem escrita |
| `src/platform/run-source-ingest-pilot-wiring-pg-tests.ts` | **6/6 PASS** — FileUnitOfWork → feed durável → kill switch → consumer → PG, incluindo checkpoint/replay e isolamento deliberado |
| Mesmo `store.json` de sete eventos → `EntregasLiveConsumer` → PG → HTTP de ambas telas | **PASS** com invariantes detalhadas abaixo |
| Chromium/Playwright em 390×844, reduced-motion | **2/2 telas renderizadas, erro JS zero, sem overflow horizontal**, rótulo de simulado presente |

### Caminho exato dos sete eventos

A entrada foi feita em três lotes (3, 3 e 1 eventos). Sem tradução forçada nem alteração de `event_id`:

- **4 eventos aceitos no PostgreSQL, com os mesmos IDs, modo `simulated` e unidade:** `trip_created`, `trip_started`, `trip_return_started`, `trip_closed_manual` (representado no contrato da plataforma como `trip_closed`).
- **3 eventos mantidos no feed de origem e isolados pela regra `tipo_sem_equivalencia_segura`:** `delivery_added`, `arrival_reported`, `delivery_confirmed`. Eles não são equivalentes a eventos do estado global da Trip; **não** são “perdidos”, nem devem ser promovidos automaticamente ao estado da operação.
- Enquanto a viagem estava ativa, `GET /api/entregas?unidade=LAB-DELIVERYOS-20261013` e `GET /api/copiloto?unit_id=LAB-DELIVERYOS-20261013` confirmaram a **mesma viagem, na mesma unidade e no mesmo modo simulado**, lendo `platform.event_log`. A contagem foi **1 nas duas telas** e o ID da Trip permaneceu na projeção da primeira.
- Duas leituras HTTP não mudaram o conjunto de IDs nem os horários gravados no PostgreSQL. O tick final sem novos eventos ficou `idle`, sem reinserção.
- A conexão de leitura no Product System usou apenas `DELIVERYOS_DATABASE_URL` apontando ao banco descartável. Não houve GPS, rede Android cortada, sessão nativa de motoboy, iFood, Neemo, Teknisa, alteração em produção ou custo.
- O consumer simulado do PR #109 ainda é **outro leitor**, limitado ao contrato público; o teste aqui prova a **porta canônica de apresentação**, não que as sete ocorrências sejam representadas integralmente no Copiloto produtivo.

## Evidências

- [Recibo de IDs, lotes, correlação e exclusões](evidencias/mesma-trip-platform-pg-2026-10-13/same-seven-pg-visual-results.json)
- [Captura mobile Entregas — uma Trip de laboratório](evidencias/mesma-trip-platform-pg-2026-10-13/entregas-same-trip-390.png)
- [Captura mobile Copiloto — shell e cartão superior](evidencias/mesma-trip-platform-pg-2026-10-13/copiloto-same-trip-390.png)

## Pendências não mascaradas

1. **Apresentação do Copiloto:** na primeira dobra, a moldura ainda diz `SOMENTE DEMONSTRAÇÃO` e `DEMO-UNIT`, embora a API e a seção interna recebam leitura do PostgreSQL `simulated`. Entregas mostra a unidade da leitura corretamente. Corrigir em patch visual próprio com regressão, **sem descaracterizar referências aprovadas**.
2. **Eventos de parada:** o adaptador canônico isola três tipos. Exigir contrato próprio, somente leitura e com provas de causalidade para que a UI represente eventos de parada — não alterar o estado global da Trip por inferência.
3. **Android desconectado de verdade e fila durável:** não testados aqui; os testes de demonstração anteriores simulavam o estado offline em memória, não a perda de rede.
4. **CI remoto/merge/deploy/homologação humana:** sem prova nova. A aprovação dos testes de bancada não abre esses portões.

## Fechamento

A integração de **quatro eventos de ciclo de vida** entre outbox durável, plataforma PostgreSQL e leitura compartilhada foi comprovada até o navegador. A transição de estado de entrega e a fila nativa permanecem fora dessa prova. Banco/credenciais/produtos preexistentes não precisam de alteração.
