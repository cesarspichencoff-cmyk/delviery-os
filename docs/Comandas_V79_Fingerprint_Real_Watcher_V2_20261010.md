# Comandas V7.9 — paridade do consumidor Windows e fingerprint das observações

**Checkpoint:** 10/10/2026, PR #38 DRAFT/HOLD. Todas as inspeções do computador CAIXA_MOOCA foram **read-only**, sem SQL, sem estado, sem impressão e sem divulgar textos ou identificadores de pedidos.

## 1. A incompatibilidade real identificada

Os arquivos `live_shadow_consumer_v1.cjs` do dispositivo e do GitHub têm **o mesmo nome mas contratos de bytes diferentes**:
- instalado: Git blob `22e3bdcbbed1cf245088f32679dd29ffb50766c9`, **16.480 bytes**, 444 linhas; inclui `observation_rows`, `observation_scan_complete`, `order_observations`, `items[].observations`, tratamento de alérgenos, catálogos de aliases e overrides humanos. O core SHA-256 da decisão inclui também as observações gerais e flag de varredura;
- versionado no PR: Git blob `bba3212cba43d0a7803e9025f4826ded0459c63c`, **10.795 caracteres**, 322 linhas; inclui `rule_lineage` com seis digests de regras, **mas não** contém a mesma captura V2 de observações, nem os caminhos de aliases e overrides do consumidor instalado.

**Perigo comprovado por diferença de código:** instalar diretamente a versão GitHub atual eliminaria comportamentos presentes na instalação, inclusive a inclusão de notas no fingerprint da decisão. Instalar simplesmente o arquivo real no PR perderia a linhagem exigida pela V7.8. **Não fazer nenhuma das duas substituições.** As fontes de configuração adicionais são locais e não podem ser fabricadas nem copiadas para o GitHub sem revisão específica.

O motor de embalagens `packaging-current.js` **já coincide** com o Git blob pinado `3167c309f02a0ad5a84fb43043b8866e3bee873c`; não reconstruí-lo.

## 2. Adaptação V7.9 feita em código, sem atualizar o Windows

O reconciliador `src/production/stableReaderShadowPairV68.ts` assumia apenas o fingerprint da decisão V1. Em sua mesma interface `decision.v1`, o consumidor real V2 adiciona:
- `order_observations` e `observation_scan_complete` **entre** `items` e `packaging` no core SHA-256;
- `items[].observations`, cada observação com `source_field` e `value`.

A função interna `inspectDecisionNotesFingerprintV79` agora:
- seleciona o contrato V2 somente quando o evento realmente traz o contrato `order.observation_scan_complete/observation_rows` já verificado com hash pela V7.6;
- exige `order_observations` e `items[].observations` integralmente presentes e idênticas em campo, texto e posição às linhas do evento V2, sem inferir que campo ausente é observação vazia;
- reproduz a **ordem real** dos campos no SHA-256 de decisão V2, sem quebrar a fórmula legada V1;
- recusa downgrade V2→V1, troca de textos com ou sem recomputar fingerprint, omissão de nota por item e flag `observation_scan_complete=false`;
- reusa a mesma validação na preparação da revisão humana V7.7, sem conceder autorização para prévia/impressão;
- **mantém a exigência V7.8 de seis referências de linhagem, incluindo o SHA-256 do motor pinado**, mesmo para um fingerprint V2 correto.

**A compatibilidade é apenas CODE_READY.** O consumidor instalado **não passa automaticamente**, pois continua sem `rule_lineage` e com turno vencido. Nenhum texto de observação real foi inserido nos testes.

## 3. Provas executadas

[CI completa #38089472124](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38089472124) = **SUCCESS** no commit `ce5d8a8ed691b463363ca83d6b1cd1dd5383a7da`.

- `STABLE_READER_SHADOW_PAIR_V68=57/57`: inclui 8 novos casos V7.9, 8 V7.8, 14 V7.7, 10 V7.6 e verificações legadas;
- `PASSIVE_READER_AUDIT_V69=21/21`;
- `READER_SHIFT_HUMAN_REVIEW_V70=29/29`;
- **`THERMAL_DESIGN_LOCK_V72=12/12; SVG_GOLDENS_MATCH`** — Cozinha/Sushi/Conferência continuam idênticos aos SVGs congelados;
- `THERMAL_DIRECT_RENDERER_SEMANTIC_V71=12/12`.

Nenhum motor, layout, Figma, SVG, renderer Epson, estado Windows, consumidor instalado, banco, spooler ou impressora foi modificado.

## 4. Próximos portões úteis

1. Preparar **um candidato único de consumidor**, preservando **ambos**: tudo o que o V2 instalado faz com notas, alergias, aliases, overrides e bloqueios **mais** os seis digests de `rule_lineage`. Não é seguro copiar um arquivo inteiro sobre o outro. Esse candidato precisa de replay adversarial de decisão/fingerprint, além de revisão de caminhos e ativos locais;
2. Plano de instalação reversível, pré-condições, backup e comparação SHA dos seis ativos em ambiente autorizado; **sem deploy sem autorização humana específica**;
3. Confirmação atual de turno e janela prospectiva com `valid_from_local`, sem retroatividade, antes de tentar destravar; resolver também `KITS_NOT_FACT`, `BAG_SIZE_NOT_FACT`, `BAG_COUNT_NOT_FACT`, `PACKAGING_UNKNOWN` e notas de alergia de maneira baseada em fatos, nunca por dedução;
4. Somente quando a cadeia real estiver provada, gerar três vias com motores e desenhos existentes em SHADOW e solicitar teste físico **CAIXA Itaim** com autorização específica.

**Fronteira:** `CODE_READY+CI_PASS` em DRAFT, **não** `WORLD_PROVEN`, `DEPLOYED`, `THREE_TICKETS_LIVE_READY` ou `HUMAN_ACCEPTED`.
