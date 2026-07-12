# Campanha Sintética Determinística de 30 Dias — V0 (Fase 3B)

> Fase 3B do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `c0b165c`.
> Campanha 100% sintética sobre o núcleo REAL (`src/live` intocado), reutilizando o motor
> da Fase 3A. **Sintético prova resiliência do encanamento; sintético NÃO prova qualidade
> operacional do motor de decisão.** Nenhum dado, nome, telefone, endereço, observação ou
> identificador real foi usado.

---

## 1. Contrato da campanha (implementado em `tools/live/simulator/campanha/contrato.js`)

`campaign_id: campanha-sintetica-30d-v0` · `campaign_seed: deliveryos-3b-sintetico` ·
`store_time_zone: America/Sao_Paulo` (obrigatório, IANA validado) ·
`start_local_date: 2026-08-01` · `total_days: 30` · `daily_profile` (calendário de 30
perfis) · `order_volume_target: 8.000–10.000` · `event_mix` (pesos por cenário) ·
`operational_window: 11:00–23:00` · `restart_plan` (6 reinícios) · `disconnect_plan`
(2 janelas) · `anomaly_plan` (inválidos/dia + dia ampliado) · `boundary_plan` (fronteira
23:00) · `reporting_config`. Seeds diárias derivadas: `{seed}:dia:{n}`.

A mesma configuração produz os mesmos dias, pedidos, eventos, timestamps, reinícios,
resultados e **o mesmo hash canônico** — nada do resultado depende de `Date.now()`,
`Math.random()`, caminho temporário, duração real ou ordem do sistema de arquivos
(voláteis explicitamente fora do hash).

## 2. Perfis diários e mix

| Perfil | Pedidos/dia | Dias |
|---|---|---|
| calmo | 160–200 | 4 |
| normal | 240–300 | 12 |
| alto | 360–420 | 4 |
| pico | 480–540 | 3 |
| pressao (dup 15%, conflito 3%) | 360–420 | 2 |
| fonte_instavel / recuperacao | 240–300 | 2+2 |
| invalidos_ampliado (25 inválidos) | 240–300 | 1 |

Mix base por pedido: fluxo_normal 55% · comanda_antes 15% · status_antes 15% ·
cancelamento 4% · duplicado 4% · reimpressão 2,5% · fora_de_ordem 2% · conflito 1,5% ·
comanda_vazia 1% (F2-08 no volume). Dias calmos, normais e degradados — nenhum dia é
artificialmente problemático por inteiro.

## 3. Regras operacionais implementadas

- **Dia operacional = data local** (`localDayKey`); operação encerra às 23:00.
- **Fronteira 23:00**: nos dias 3/12/25, 3 eventos deliberados em ≥23:00 — classificados
  `fora_janela`, no MESMO dia local (nunca carregados para o dia anterior), separados
  das métricas do fluxo normal. Total: 9 eventos, verificados por teste.
- **Desconexões** (dias 10 e 23): `fonte_desconectada` + fonte de status muda na janela
  (comandas seguem); o retorno dos status é a evidência fresca que reconecta.
- **Carimbo = emissão**: o gerador nunca emite `captured_at` à frente da injeção — a
  guarda de clock skew do núcleo (F2-03) validou isso em desenvolvimento, detectando um
  descuido inicial do próprio gerador (registrado como prova de que a guarda funciona).

## 4. Resultado da execução canônica (seed oficial, determinístico)

| Métrica | Valor |
|---|---|
| Pedidos sintéticos | **9.298** (alvo 8.000–10.000 ✓) |
| Eventos gerados / aceitos / no log | 24.595 / 24.093 / 24.093 |
| Duplicados ignorados (sem append) | 448 |
| Quarentena (inválidos) | 54 |
| Reimpressões / cancelamentos / pares em conflito | 239 / 344 / 136 |
| Fora de ordem / comandas vazias | 177 / 93 |
| Fronteira 23:00 (separados) | 9 |
| Status suprimidos por desconexão | 30 |
| Desconexões / reconexões | 2 / 2 |
| Reinícios / replays equivalentes | **6 / 6** |
| Amostras freshness (atualizada/atrasada/vencida/desc./desconh.) | 356 / 279 / 113 / 1 / 1 |
| Estados finais (matched/unmatched/conflict/cancelados) | 8.602 / 81 / 408 / 343 |
| Aptos para decisão | **8.567** (pós-correção F2-08: −35 vazias casadas que antes ficavam aptas) |
| Divergências / falhas inesperadas | **0 / 0** |

Separação de leitura: duplicados, quarentena, conflitos, parciais e supressões são
**comportamento esperado pelo cenário**; não houve **falhas inesperadas**; as
**limitações conhecidas** estão nas §6–§8; nenhum resultado ficou **inconclusivo**.

## 5. Reinícios e replay

6 reinícios determinísticos: pós-calmo (d5), durante pico (d12), após duplicados (d17),
após conflito (d20), **durante desconexão e antes de evidência fresca** (d23), pós-calmo
(d28). Em todos: replay do log, reconstrução do estado, **projeção reconstruível
idêntica por hash**, nenhuma duplicação (log aceito = fatos únicos, F2-04 sob volume),
identificadores contínuos, quarentena íntegra (re-semeada), freshness coerente.

**last_trusted_at:** comportamento conservador conhecido (Contrato §17 / achado 3A) —
não é falha automática. O relatório separa estado reconstruível × último evento ×
freshness efetiva × last_trusted_at. Na campanha, nenhum caso quebrou contrato, alterou
decisão indevidamente, impediu recuperação ou gerou divergência não explicada.

## 6. F2-07 — índice de deduplicação (medido, não corrigido)

- Eventos processados: 24.595 · chaves de fato: **24.093** (1 por fato aceito; razão 1,0)
- Série diária registrada (30 pontos, crescimento monotônico ∝ volume aceito).
- Duplicidades reconhecidas: 448 · não reconhecidas: **0**.
- **Não existe limpeza/expiração** no núcleo atual (fato registrado; nada implementado).
- **Classificação: `crescimento_linear_esperado`** — o índice cresce linearmente com os
  fatos aceitos, sem componente superlinear (~24k chaves/30 dias na escala testada).
- **Correção documental (auditoria 3B):** reinício com replay COMPLETO **reconstrói**
  as chaves a partir do log inteiro — o log nunca é rotacionado, então **reiniciar
  sozinho NÃO limita o crescimento** (a afirmação anterior de que "reinício diário
  mitiga" estava tecnicamente errada e foi retratada). **Retenção, rotação, compactação
  ou janela de histórico serão necessárias antes de operação contínua multiperíodo.**
  O achado não bloqueia D4A; nenhuma política nova foi implementada nesta missão.

## 7. F2-08 — comanda com itens vazios (CORRIGIDO — missão pós-auditoria 3B)

Correção mínima centralizada em `src/live/qualidade.js` (contrato no
`Contrato_Nucleo_Fonte_Viva_V0.md` §13): composição presente exige ≥1 item válido;
`itens: []` (ou só itens sem nome) ⇒ `suspect` com motivo `comanda_sem_itens` — nunca
`complete`, nunca apta. Casos recertificados (7 de f208.js + 93 vazias no volume + 15
testes dedicados em `tests/live/comanda-vazia.test.js`):

| Caso | Resultado pós-correção |
|---|---|
| vazia → `pedido_alterado` traz composição | **recupera**: 1 item, sai de suspect |
| vazia permanece vazia | suspect; nunca apta |
| vazia duplicada | dedup segura (1 fato); suspect |
| **vazia + status (antes ou depois)** | **matched + `suspect` + `apto_para_decisao: false`** (antes: complete/apto — corrigido) |
| itens válidos → alteração para vazio | **revoga** completude e aptidão |
| vazia + cancelamento | cancelada; aptidão nunca reaberta |
| vazia atravessando reinício | replay equivalente; regra sobrevive |
| sem campo `itens` / formato inválido | quarentena (`payload_incompativel`) |

## 8. Limitações desta campanha

1. Sintético não prova qualidade operacional do motor de decisão (motor não é chamado).
2. Volume alvo é comparável em ESCALA, não em distribuição real (perfis controlados).
3. Amostras de freshness são da fonte de status em passos de 30 min — sinal, não censo.
4. `last_trusted_at` conservador pós-reinício (contrato) — separado nas métricas.
5. F2-07/F2-08 foram MEDIDOS; correções pertencem a missões futuras autorizadas.

## 9. Gates

G1 testes 137/137 ✓ · G2 determinismo (2 execuções, runtimes distintos, hash idêntico) ✓
· G3 replay 6/6 equivalentes ✓ · G4 privacidade (varredura recursiva de eventos +
varredura do runtime persistido; zero PII) ✓ · G5 volume (9.298 no alvo; zero falha
inesperada; zero divergência) ✓ · G6 F2-07 medido e classificado ✓ · G7 F2-08
documentado ✓ · G8 isolamento (diff vazio em `src/live` e áreas protegidas) ✓.

## 10. Conclusão (atualizada pós-correção F2-08)

O núcleo de fonte viva sustentou 30 dias sintéticos determinísticos na escala da
operação real (9,3k pedidos, 24,6k eventos) com dedup-antes-do-append íntegro sob
volume, 6 reinícios com replay equivalente, quarentena e conflitos honestos e zero
falha inesperada. **F2-08 foi corrigido e recertificado** (hash da campanha mudou de
forma explicada e determinística: só os estados de comanda vazia e os textos F2-07 do
relatório; matched inalterado em 8.602; aptos 8.602→8.567). **F2-07 permanece
registrado**: crescimento linear; reinício não limita (replay reconstrói do log
inteiro); retenção/rotação necessárias antes de operação contínua multiperíodo.
