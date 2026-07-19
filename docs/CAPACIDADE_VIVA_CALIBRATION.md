# Capacidade Viva — Calibração e Modo Sombra

**Rótulos:** CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL

Branch: `research/capacidade-viva-calibration`  
Base: `54b5c59` (não altera worktree de origem)

## Dados encontrados

| Fonte | Caminho | Formato | Período | Registros | Tipo |
|---|---|---|---|---|---|
| Transições iFood | `delviery-os/data/ifood_real.jsonl` | jsonl | 2026-05-27 → 2026-06-26 | 41 206 eventos / ~8 305 pedidos | **Real** |
| Itens por pedido | `delviery-os/data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl` | jsonl | 20–30/06/2026 | 10 565 linhas / 3 215 pedidos | **Real** (parser) |
| Itens 01/07 | `.../itens_pedido_reais_2026-07-01.jsonl` | jsonl | 2026-07-01 | ~itens | Real |
| Cardápio seed | `data/cardapio_knowledge_seed.json` | json | n/a | 199 itens | Real (conhecimento) |
| Janela V1 | `delviery-os/data/generated/v1_janela_real.json` | json | janela demo | 1 janela | Real |
| XLSX bruto | `delviery-os/data/raw/relatorio_pedidos_ifood.xlsx` | xlsx | export | 1 arquivo | Real bruto |
| Fixtures CV / Copiloto | `data/capacidade-viva/fixtures`, `mocks/copiloto` | json | n/a | fixtures | **Sintético** rotulado |

### Dados ausentes (sem fabricação)

- **Seis meses completos** de histórico contínuo **não** estão locais.
- Escala real de equipe por turno.
- Eventos nativos de “comanda ausente” / produção por item no log de fluxo.
- Ações humanas registradas com horário (para Recuperação Líquida histórica).

Contrato de importação gerado em cada run: `08_import_contract.json`.

## Qualidade

Ver `02_quality.json` em cada execução.

**Confirmados:** pedido_id, timestamps de recebido/aceito/pronto/saiu/entregue/cancelado, status final, tempos logísticos no payload iFood, itens+qtd no export de itens.

**Inferidos (alta):** motoboy aguardando (espera na loja ≥ 5 min), alocação de entregador (minutos de alocação), praça via casamento cardápio.

**Inferidos (baixa) / pendentes:** complexidade sem tempo por item; praça se nome não casa no seed.

**Ausentes:** equipe, 6 meses, comanda física, ranking de pessoas (propositalmente não modelado).

## Normalização

Eventos canônicos em `normalizer.js`. Epistemic obrigatório. Fora de ordem e duplicatas medidos em `buildOrderTimelines`.

## Catálogo

Construído a partir do seed (199 itens) + regras de evidência (peças, multi-praça, quente, kit).  
Itens com `revisao_manual` / sem praça → **CLASSIFICAÇÃO PENDENTE DE VALIDAÇÃO**.

## Replay

`replay.js` — intervalo default 5 min (CLI configurável). Calcula ISF, exceções, menor intervenção **em sombra**.

## Calibração ISF

Variantes de pesos testadas; seleção por **estabilidade cal/val** + penalidade a pausa geral (anti-overfit).  
Split: ~67% dias calibração / 33% validação (ordem cronológica).

## Modo sombra

Linhas com horário, praça, estado, sinais, confiança, intervenção.  
**Não** afirma que a ação teria funcionado (sem contrafactual).

Recuperação Líquida histórica: **contrato apenas** — requer log de ações futuras.

## Como executar

```bash
cd C:\Users\italo\Desktop\Claude\deliveryos-capacidade-viva-calibration
node tools/calibrar_capacidade_viva.js
# demo sintético:
node tools/calibrar_capacidade_viva.js --demo
# custom:
node tools/calibrar_capacidade_viva.js --ifood "C:\path\ifood_real.jsonl" --interval 5 --team estrutura_media
node tests/capacidade-viva/calibration/run.js
node tests/capacidade-viva/run.js
node tests/copiloto/run.js
```

Saídas em `results/capacidade-viva/run-<ts>/` (gitignored).

## Perguntas para César / equipe

1. Validar aliases Quentes × Cozinha no cardápio.
2. Confirmar itens marcados pendentes de validação.
3. Fornecer escala típica por dia da semana (contagens, não nomes).
4. Exportar mais meses de relatório iFood para fechar 6 meses.
5. Registrar intervenções reais (horário + tipo) para RL histórica.
6. Confirmar se “espera na loja” ≥ 5 min é limiar operacional adequado.

## Riscos

- Timestamps em Z vs horário local BR na análise por hora.
- Subsample de pedidos em bases grandes (usar `--full` se necessário).
- Overfitting se só maximizar fit sem validação temporal (mitigado).
- Inferência de praça falha em nomes fora do seed.

## Limitações

Não operacional; não alerta equipe; não aplica pausa; não ranqueia pessoas; não estima dinheiro.

---

## Fase 2D.1 — Saneamento e validação humana

### Problemas da V1 (corrida inicial)

- ~98% ticks com “exceção” (envelhecimento e pronto tratados como críticos).
- ~48% ticks “críticos” sem ground truth (não é taxa de detecção).
- Risco UTC vs horário BR na análise temporal.
- Subsample de pedidos.
- Equipe simulada tratável como se fosse real.
- Pausa seletiva acoplada demais ao ISF isolado.

### Correções

| Tema | Correção |
|---|---|
| Timezone | `America/Sao_Paulo` explícito; preserva `timestamp_original` / UTC |
| Taxonomia | sinal contínuo · atenção · exceção crítica |
| Envelhecimento | sinal/atenção, **não** exceção isolada |
| Pronto→saída | “aguardando saída — causa não confirmada” sem campo de espera na loja |
| Motoboy | só com evidência de espera na loja (alta confiança) |
| Episódios | gap 10 min; métricas por episódio + tick |
| Pausa | gates (tendência, confiança, localização) |
| Full replay | default `--full` (use `--fast` só em dev) |
| Config | `cv-cal-sane-v2` (não sobrescreve v1) |
| Humanos | 40 casos + 14 itens em `data/capacidade-viva/calibration/review/` |

### O que ainda não se conclui

- Falso positivo real (precisa rótulo do César).
- Capacidade real de equipe (só perfis hipotéticos).
- Recuperação Líquida histórica.
- Superioridade vs baselines sem validação humana.
- Seis meses de histórico.

### Comando

```bash
node tools/calibrar_capacidade_viva.js          # FULL
node tools/calibrar_capacidade_viva.js --fast   # dev
node tests/capacidade-viva/calibration/run-sane.js
```
