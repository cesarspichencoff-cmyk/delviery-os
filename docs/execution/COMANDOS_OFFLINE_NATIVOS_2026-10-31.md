# Comandos offline nativos do motoboy (C5) — 31/10/2026

Branch isolada `claude/deliveryos-v1-trip-identity-20261031`. Continuação autorizada pelo César
("Ok pode continuar", 31/10) depois do relatório da viagem real pela interface. Sem merge, deploy,
instalação, aparelho, banco operacional ou dado real.

## O que estava aberto

`BLOCKERS.md` C5, desde 01/10: `outbox_event` do Room existia, o `SyncWorker` o drenava, o piloto
o recebia em `/api/events/batch` com recibo por evento — e **nada o preenchia**. Saída, chegada,
entrega, cliente não encontrado e ocorrência iam só por `/api/command`, online. Sem rede na porta
do cliente, a confirmação falhava e se perdia, enquanto a tela prometia "suas confirmações ficam
guardadas e sobem sozinhas".

Reproduzido antes de corrigir (`test:entregas:rider-offline`, commit `46c59375`, sobre `67995e8a`):
**3/9**. Sem rede, a saída tocada não entrava na fila do aparelho; a sequência chegada → entrega
não avançava; nada era enviado quando a rede voltava; e o servidor anunciava
`offline_queue_enabled` mesmo sem chave de delegação — o aparelho não conseguiria enviar.

## O que mudou (`ee36566b`)

| Camada | Mudança |
|---|---|
| Kotlin | `OperationalEventRecorder`: aceita só as cinco ações do motoboy; `event_id`, `idempotency_key` e `command_id` no contrato do lote; viagem/parada; horário ISO; corpo ≤ 4 KB. Grava com sequência na mesma transação (`insertOutboxSequenced`); mesmo `event_id` não duplica |
| Ponte | `recordOperationalEvent` e `operationalEvents` (lista sem o corpo do comando) |
| Servidor | `/api/policies` só anuncia `offline_queue_enabled` com a flag **e** recibos duráveis **e** chave de delegação. Em PostgreSQL sem recibo por unidade, ou sem delegação, a fila não é anunciada e a página segue online |
| rider-mobile | Com a fila anunciada e a ponte nova, toda ação vai primeiro ao aparelho. Intenção pendente não duplica. A tela segue a sequência offline marcando "guardada no aparelho, aguardando envio" e nunca afirma confirmação do domínio. O GPS continua lendo só a viagem do servidor. Recusa do domínio fica visível |

Por que só com anúncio do servidor: o `SyncWorker` envia com credencial delegada pela plataforma;
o piloto precisa da chave pública para verificá-la e de recibo durável para confirmar sem duplicar.
Anunciar a fila sem isso seria guardar no celular uma ação que nunca chegaria.

## Medido

| Prova | Antes | Depois |
|---|---|---|
| `test:entregas:rider-offline` (nova) | **3/9** | **10/10** `RIDER_OFFLINE_COMMANDS_GREEN` |
| `test:entregas:rider-offline:mutacoes` (nova) | — | **9/9, cegas: 0** (controle + MC1–MC7 + restauração) |
| JUnit Android no CI (`OperationalEventRecorderTest`, 8 testes) | classe ausente (17 classes) | 18 classes, `suites=18, tests=211, failures=0, errors=0` |
| `test:entregas` (cadeia) | 242 linhas OK | 242 linhas OK |
| ui · rider-capture · rider-bridge · android estrutural | 24 · 38 · 31 · verde | 24 · 38 · 31 · verde |
| session · dispatch · device-api · pilot-gate · acceptance | 20 · 33 · 50 · 15 · 45 | 20 · 33 · 50 · 15 · 45 |
| real-trip-ui | 10/10 | 10/10 |

CI no HEAD `ee36566b`: produto
[41218396348](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41218396348) e Android
[41218396357](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41218396357), ambos
`success`; o Kotlin novo compilou (`compileDebugKotlin`, `compileDebugUnitTestKotlin`) e o APK de
bancada foi montado e verificado (não instalar em campo).

Mutações (cada uma acusada pela prova certa): ação só online com a fila anunciada → O1; toque
repetido vira segunda intenção → O3; sem a camada de intenções a sequência para → O2; ação
guardada aparece como erro → O1; tela não diz que está guardado → O1; recusa some da tela → O9;
fila anunciada sem delegação/recibo → O7.

## O que isto NÃO prova

- **Nada rodou em aparelho.** A ponte da prova é falsa e o envio usa a sessão do motoboy no lugar
  da credencial delegada; o caminho real (Room → `SyncWorker` → troca na plataforma → piloto) tem
  provas separadas (JUnit, device-api), não esta ponta a ponta.
- O Kotlin não compila neste contêiner (`dl.google.com` negado); a prova dele é o CI. Mutação do
  Kotlin não foi rodada (exigiria commits quebrados na branch compartilhada).
- **Mooca em PostgreSQL:** sem recibo por unidade (0011 + papel por unidade), a fila não é
  anunciada e o motoboy segue online. Ligar o offline lá depende de decisão e migração aprovadas.
- A flag `offline_queue_enabled` continua `false` por padrão. Ligar é decisão do César, por
  ambiente.
- `SyncScheduler.requestNow` depende do WorkManager e da rede: a ação sobe quando o aparelho volta
  a ter conexão, sem promessa de instantâneo. Com o app fechado, a intenção já gravada fica no
  Room e sobe pelo periódico de 15 minutos ou pela próxima abertura.

## Próximo passo seguro

No laboratório, com aprovação: modo arquivo, chave de delegação de laboratório e a flag ligada;
Xiaomi em modo avião na porta, saída → chegada → entrega guardadas, rede de volta, conferir que o
servidor aplicou uma vez e que a linha "guardada" some.
