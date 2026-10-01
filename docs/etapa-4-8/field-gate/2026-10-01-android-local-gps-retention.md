# Retenção local de GPS no Android — fail-preserve

Data: 2026-10-01
Host: Foxxy
Base Git: `3218f1b2b1f9a4ffe76cfe2973e7e70f34968a5a`
Resultado: **CODE_READY + TEST_PASS no AVD; prazo operacional NÃO DECIDIDO**

## Gap

O DAO já possuía `purgeSyncedBefore`, mas nenhum fluxo de runtime o chamava.
Ao mesmo tempo, `/api/policies` devolvia `gps_policy.retention_days` usando o
default técnico de 30 dias mesmo quando o termo real ainda não era publicável.

Usar esse default para apagar dados seria uma promoção indevida de um valor de
modelo para política operacional, contrariando o checklist humano.

## Regra implementada

O servidor só expõe retenção autorizável quando o termo inteiro é publicável.
Quando não é, `term.retention` e `gps_policy.retention_days` são `null`.

No Android, a política local só fica válida quando:
- existe hash de termo publicável;
- o prazo veio junto daquele mesmo hash;
- o prazo é inteiro positivo dentro do limite técnico;
- existe `rider_id` e `device_id` locais;
- existe aceite do mesmo hash pelo mesmo motoboy no mesmo aparelho.

A identidade humana não vem da tela. `DeviceSession` agora persiste
`actor_id` devolvido pela sessão canônica da plataforma como `KEY_RIDER_ID`.
Se a resposta não traz ator, o valor local é limpo: falha fechando.

Quando a política está válida, `SyncWorker` calcula o corte e remove apenas
pontos `syncState='sent'` vencidos. Se existir viagem ativa, todos os pontos
daquela viagem são preservados, mesmo já sincronizados.

Sem política válida, sem aceite, com termo pendente ou com valor absurdo:
**nenhum expurgo acontece**.

## Provas

- Android structural/project: **42/42 PASS**;
- device API real sintética: **43/43 PASS**;
- `:app:testDebugUnitTest`: **BUILD SUCCESSFUL**;
- `:app:connectedDebugAndroidTest`: **13/13 PASS** no AVD Android 14;
- teste de SQLite real provou:
  - termo publicado sem aceite não autoriza retenção;
  - aceite correto no mesmo aparelho libera exatamente o prazo do termo;
  - termo não publicável revoga a autorização local;
  - expurgo não remove `pending`;
  - expurgo preserva viagem ativa;
  - sessão da plataforma persiste `actor_id` como identidade do motoboy.

Controle contra default silencioso: o termo sintético de prova usou **17 dias**,
e a API/Android preservaram 17 — não 30.

## Fronteira

O checklist real continua com `retention.operational_event_days`,
`retention.detailed_point_days` e `approved: true` em aberto. Esta mudança
não decide nenhum desses campos.

Nenhum dado operacional foi apagado, nenhuma configuração real foi preenchida,
nenhum aparelho físico foi usado e nenhum deploy foi feito.
