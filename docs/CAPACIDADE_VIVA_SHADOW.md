# Capacidade Viva human-v2 — Modo Sombra (Fase 2E.1)

> Integração da calibração human-v2 ao Copiloto V3.3, exclusivamente em modo sombra.
> Referência visual congelada: commit `6f04177`. Referência documental congelada: `266d74d`.
> Origem da calibração: worktree `deliveryos-capacidade-viva-calibration`, commit `076a1cb`.

## O que é modo sombra

O motor human-v2 roda em paralelo ao Copiloto, lê o mesmo snapshot que a interface já usa e registra
sua leitura para auditoria. Ele **não** altera o estado oficial, **não** substitui nenhuma lógica atual,
**não** executa ações, **não** pausa pedidos, **não** muda prioridades, **não** envia alertas
operacionais e **não** toma decisão automática. Nenhuma saída do human-v2 chega ao operador nesta fase.

## Configuração integrada

| Campo | Valor |
|---|---|
| Nome | `cv-cal-tata-human-v2` |
| Versão | 2 |
| Hash SHA-256 | `f248a17328ca71fc8608e0897d24ee3966bf0b7bcd55afbebb6feaa4cc7534dc` |
| Origem | `deliveryos-capacidade-viva-calibration` (branch `research/capacidade-viva-calibration`) |
| Commit de validação | `076a1cb` (fechamento formal do blind-v2: 26/26 concordância exata) |
| Commit do motor | `b620aef` (Fase 2D.8 — correção de faixas baixas e precedência da fonte) |
| Status | `shadow_only` |
| `automatic_decisions_allowed` | `false` (sempre, hardcoded — ver `src/capacidade-viva/shadow/flags.js`) |
| Caminho | `data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json` |

O hash é recalculado a cada `loadShadowConfig()` (`src/capacidade-viva/shadow/config.js`). Se não bater
EXATAMENTE com o valor acima, o motor human-v2 não inicia — o Copiloto continua funcionando
normalmente e a falha é registrada só no canal técnico (`falhas.runtime.jsonl`).

## Arquitetura

```
tools/servir_v1.js  →  rodarLeituraSombra(payload)   [depois de json(payload) já enviado — nunca antes]
                              │
                              ├─ ShadowFlags.isShadowEnabled()          → se false, não executa
                              ├─ ShadowConfig.loadShadowConfig()        → se not ready, só registra falha
                              ├─ ShadowAdapter.observeSnapshot(...)     → nunca lança, nunca devolve comando
                              └─ observationLog.register(observation)  → dedup + heartbeat, grava .jsonl
```

- **`src/capacidade-viva/shadow/human-rules.js` / `labels.js`** — porte byte-exato do motor human-v2
  validado (`deliveryos-capacidade-viva-calibration@076a1cb`). Único trecho de lógica de classificação
  trazido da calibração — nada de `review/`, `blind-v1/`, `blind-v2/`, gabaritos, casos humanos ou
  scripts de geração de holdout foi copiado.
- **`src/capacidade-viva/shadow/config.js`** — carregamento imutável com validação de hash.
- **`src/capacidade-viva/shadow/adapter.js`** (`CapacidadeVivaShadowAdapter`) — normaliza a janela
  NIGHT/rows do adaptador D4A (`src/live/interface/adaptador.js`) para o formato que o motor human-v2
  espera, resolve praça via `src/perfil-delivery/motor.js` (mesmo caminho que `app-v1/app.js` já usa
  client-side) e devolve sempre um `shadow_observation` — nunca um `operational_decision`.
- **`src/capacidade-viva/shadow/observation-log.js`** — registra com controle de ruído (§5) e canal de
  falha técnica separado (§9).
- **`src/capacidade-viva/shadow/flags.js`** — duas flags deliberadamente separadas; a de decisão
  automática não lê variável de ambiente nenhuma, está sempre `false`.

## Ausência de impacto na interface

Nada em `app-v1/app.js`, `app-v1/style.css` ou `app-v1/index.html` foi alterado nesta fase, e nenhum
desses arquivos referencia `src/capacidade-viva/shadow/*` (verificado por teste estático). O payload de
`/api/fonte` é idêntico byte a byte com o modo sombra ligado ou desligado (verificado por teste de
fumaça com dois servidores reais, um com cada configuração). `body[data-mode]`, o painel de intervenção,
a prioridade exibida e os modos visuais (Calmo/Ambiente/Foco, âmbar localizado, progressão cromática)
continuam controlados exclusivamente pelo motor V0.1/V3.3 já existente.

## Limitação conhecida (documentada, não contornada)

O adaptador D4A (`montarJanela()`) nunca observa `s` (saída) nem `e` (entrega) — ambos ficam sempre
`null`, por não haver fonte real que os observe (ver
`docs/preloja/Investigacao_Cenarios_Volume_Ambiente_Foco_V0.md`). Por isso `courier_wait_store_min`
também é sempre `null` nesta integração, e o braço "motoboy esperando na loja" de `classifyOrderHuman`
é estruturalmente inalcançável via snapshot ao vivo — só os braços "pronto sem saída" e "idade
operacional" são exercitados em produção nesta fase. O braço motoboy continua coberto por teste direto
sobre a regra (`tests/capacidade-viva/run.js`), só não é alcançado pelo adapter. Não foi contornado com
dado inventado — carimbo ausente continua `null`, como manda `CLAUDE.md`.

Pela mesma razão, o gate `context.volume_only` / `only_active_orders` de `classifyOrderHuman` (evidência
insuficiente a partir de contagem bruta) também não é alcançável pelo adapter — a janela NIGHT sempre
traz carimbo real por pedido, nunca uma contagem agregada sem timing. Coberto por teste direto sobre a
regra, pela mesma razão.

## Critérios para observação futura em operação real

Este motor **não é verdade universal** — é uma calibração feita sobre 4 anos de conversas e episódios
sintéticos revisados por César, validada às cegas (blind-v1: 24 casos; blind-v2: 26/26 concordância
exata). Antes de considerar qualquer ativação além de modo sombra, a operação real precisa produzir:

1. Um volume mínimo de observações reais em `observacoes.runtime.jsonl` (semanas, não horas) cobrindo
   os dois braços alcançáveis (pronto sem saída, idade operacional) em turnos de pico e de calmaria.
2. Confronto explícito, feito por César, entre o que o human-v2 teria sinalizado e o que a equipe viveu
   naquele turno — nos mesmos moldes do blind-v2, mas com dado real em vez de sintético.
3. Nenhuma divergência sistemática não explicada entre a leitura sombra e a leitura humana.
4. Aprovação humana explícita, registrada, antes de qualquer fase que exponha a leitura ao operador —
   mesmo exposição visual passiva, sem decisão automática, é uma fase própria e nova.
5. Decisão automática (`automatic_decisions_allowed: true`) exige sua própria fase, sua própria flag
   (nunca a de sombra) e sua própria aprovação — nunca decorre automaticamente do sucesso do modo sombra.

## Rollback

O modo sombra é aditivo e desligável sem tocar no motor V0.1/V3.3:

1. **Desligar sem remover código:** não definir `CAPACIDADE_VIVA_HUMAN_V2_SHADOW` (ou defini-la como
   `0`/`false`) no ambiente de execução. Em produção sem configuração explícita já vem desligado por
   padrão.
2. **Remover completamente:** reverter o commit desta fase. Como nenhuma outra parte do Copiloto lê
   `src/capacidade-viva/shadow/*` nem qualquer campo produzido por ele, a reversão não tem efeito
   colateral em nenhum outro motor, endpoint ou tela.
3. **Descartar observações coletadas:** apagar `data/capacidade-viva/shadow/*.runtime.jsonl` (já fora
   do Git via `.gitignore`, padrão `*.runtime.jsonl`) — não há persistência fora desses arquivos locais.
