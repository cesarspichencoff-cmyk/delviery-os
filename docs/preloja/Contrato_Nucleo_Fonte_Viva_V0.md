# Contrato do Núcleo de Fonte Viva — V0

> Fase 2 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `73272bc`.
> **Endurecido pela Fase 2.1** (base `4a74077`, revisão do Grok `04c58e2`): fecha
> F2-01 (PII recursiva), F2-02 (dia operacional com fuso da loja), F2-03 (clock skew)
> e F2-04 (dedup antes do append). F2-05 (`NIGHT`/`rows`) está **adiado por decisão**
> para o adaptador da Fase 4; F2-06 (script `test:live`) **não exige mudança agora** —
> o comando canônico segue `node --test tests/live/*.test.js`.
> Este documento é o contrato do que `src/live/` implementa. Obedece ao
> `Addendum_PreRequisitos_Fase2_V0.md` (que vence os docs da Fase 1) e à autorização da
> Fase 2 do César (que decide vocabulário quando há divergência — registradas na §12).
>
> **O que este núcleo é:** módulos isolados e testáveis que recebem eventos no envelope,
> validam, normalizam, deduplicam, consolidam, persistem e expõem um snapshot honesto.
> **O que ele NÃO é:** não conecta Epson TM-T20X, não conecta Gestor iFood, não toca
> `motor.js`/`decisao.js`/`app-v1`, não simula 30 dias, não decide embalagem. Adaptadores
> (mesmo simulados, Fase 3) são SOMENTE LEITURA (Addendum §11) — o núcleo não contém
> nenhuma chamada de escrita a fonte alguma.

---

## 1. Layout de módulos

```
src/live/
  config.js        limiares configuráveis (chutes de dev DECLARADOS; calibração = Fase Sombra)
  contrato.js      envelope + validação (schema_version, tipos, privacidade)
  normalizar.js    texto, dia, hash canônico de itens, change_mode canônico
  idempotencia.js  chaves de fato por tipo + guarda F3-04
  dedup.js         event_id (observação) × idempotency_key (fato)
  correlacao.js    matched | partial | unmatched | conflict
  consolidar.js    projeção consolidada (parciais, cancelamento, reimpressão, alteração)
  freshness.js     5 estados + gate de staleness independente (Addendum §4, F3-03)
  qualidade.js     completeness (com suspect, F3-07) + limitação de rasura
  quarentena.js    eventos rejeitados com motivo, sem interromper o fluxo
  persistir.js     JSONL append-only, runtimeRoot explícito, guarda F3-01
  reconstruir.js   replay do log (reinício)
  snapshot.js      estado atual derivado
  nucleo.js        orquestração (nenhuma regra própria)
tests/live/        node:test nativo (31+ casos obrigatórios da autorização da Fase 2)
```

Os testes vivem em `tests/live/` **por determinação da autorização da Fase 2** — os docs
da Fase 1 citavam `src/live/__tests__/`; a autorização vence (divergência registrada, §12).

## 2. Envelope obrigatório (Addendum §5)

`schema_version` · `event_id` · `event_type` · `source` · `source_event_id` ·
`idempotency_key` · `occurred_at` · `captured_at` · `received_at` · `correlation`
(`ifood_short`, `pedido_interno`, `print_job_id`) · `payload` · `quality`.

Regras de validação (`contrato.js` + `sanitizar.js`):
- Sem `schema_version` ⇒ quarentena (`schema_version_ausente`). Versão fora de
  `["1.0"]` ⇒ quarentena (`schema_version_desconhecida`). **Nunca aceito em silêncio.**
- `captured_at` obrigatório e legível; `occurred_at`/`received_at` podem ser `null`
  (não observado ≠ inventado). `received_at` é carimbado pelo núcleo na recepção.
- **Privacidade RECURSIVA (F2-01):** telefone/endereço/e-mail/CPF/documento/nome de
  cliente/senha/cookie/token **não têm campo**. A varredura desce em objetos, arrays e
  objetos dentro de arrays (profundidade limitada; estrutura funda demais ⇒ quarentena
  `estrutura_profunda_demais`, nunca aceita cega) e é **case-insensitive**. Presença de
  campo proibido em QUALQUER profundidade rejeita o evento; o registro de quarentena
  guarda só o **caminho** do campo (ex.: `payload.itens[0].meta.telefone`), nunca o
  valor, e nesse caso o bruto **não** é preservado. Identificadores operacionais
  (`ifood_short`, `pedido_interno`, `sequencia`, `print_job_id`) **não** são PII.
- **Normalização por allowlist (F2-01):** evento aceito nunca persiste o payload cego
  da fonte — só os campos operacionais do contrato sobrevivem, por tipo de evento;
  itens são reduzidos ao shape estrito `{nome, quantidade, observacao}`. Campos
  descartados são registrados **por nome** em `parsing_warnings`
  (`campos_descartados:…`). Evento malformado que vai à quarentena por outros motivos
  tem o bruto **redigido** recursivamente antes do disco (`campos_redigidos`).
  *Limitação declarada:* a detecção é por NOME de campo — valor livre dentro de campo
  legítimo (ex.: observação do prato) não é vasculhado.
- Identificador essencial ausente (ex.: comanda sem `pedido_interno`, status sem
  `ifood_short`) ⇒ quarentena (`identificador_essencial_ausente`).
- `quality` ausente ⇒ preenchida com `completeness: "unknown"` + aviso — o default é
  ignorância declarada, nunca certeza inventada.

## 3. Eventos (8 tipos)

| event_type | Semântica | Nasce de |
|---|---|---|
| `comanda_impressa` | composição observada no instante da impressão | fonte de comanda |
| `status_ifood` | coluna/tempo/atraso observados | fonte de status |
| `pedido_cancelado` | cancelamento visto na fonte de status — **nunca inferido da comanda, nunca por ausência** | fonte de status |
| `pedido_reimpresso` | nova via observada de `pedido_interno` já conhecido | fonte de comanda |
| `pedido_alterado` | alteração com `change_mode`/`revision` (§8) | qualquer fonte de composição |
| `fonte_conectada` / `fonte_desconectada` | saúde declarada da fonte | a própria fonte |
| `pedido_vivo` | heartbeat de observação ("segue visível na coluna X em T") | fonte de status |

## 4. Idempotência (fecha F3-04)

`event_id` identifica a **observação**; `idempotency_key` identifica o **fato**.

| Fato | Chave |
|---|---|
| comanda | `comanda:{pedido_interno}:{hash_canonico_do_conteudo}` |
| status | `status:{source}:{ifood_short}:{dia}:{coluna}` (+`:rev={revision}` ou `:sev={source_event_id}` quando existirem) |
| cancelamento | `cancel:{source}:{ifood_short}:{dia}` |
| reimpressão | `reimp:{pedido_interno}:{emissao_nova}` |
| alteração | `alter:{id}:{rev=N \| sev=...}` |

**A chave de status NÃO carrega tempo de captura.** `captured_at` é momento de captura,
não identidade do fato: observações repetidas do mesmo fato só avançam o carimbo. Guarda
executável: `status_ifood` cuja `idempotency_key` embuta horário (fragmento ISO com hora
ou relógio `hh:mm` isolado) vai para quarentena (`idempotency_key_de_status_com_horario`).
*Limite declarado da heurística:* não detecta epoch arredondado — a proibição vale por
contrato mesmo onde o padrão não alcança.

## 5. Deduplicação (endurecida — F2-04)

**A deduplicação acontece ANTES da persistência.** Ordem do pipeline:
validar → sanitizar/allowlist → clock skew → **identidade de conteúdo → consulta ao
índice → persistir somente quando apropriado** → aplicar ao estado → atualizar índices.

Identidade de conteúdo: hash canônico (chaves ordenadas) do conteúdo OPERACIONAL do
evento — exclui `captured_at`/`received_at`/`quality` e os campos de MEDIÇÃO do tipo
(`tempo_decorrido_min`, `atraso_min`, `visto_em`, `emissao` da via, `occurred_at` nas
famílias de status), que variam a cada releitura legítima do mesmo fato.

| Caso | Comportamento |
|---|---|
| mesmo `event_id` + mesmo conteúdo | duplicata: **sem append**, sem estado, sem snapshot |
| mesmo `event_id` + conteúdo divergente | anomalia: **sem append**; quarentena sanitizada (`event_id_reutilizado_com_conteudo_divergente`); o aceito anterior **nunca** é substituído |
| mesma `idempotency_key` + mesmo fato | observação repetida: **sem append**; carimbos/vias avançam em memória |
| mesma `idempotency_key` + conteúdo incompatível | conflito: **sem append**; quarentena sanitizada (`idempotency_key_reutilizada_com_conteudo_divergente`); o fato original aceito é preservado |

Após reinício, os índices de `event_id` e `idempotency_key` são **reconstruídos pelo
replay do log** — duplicata recebida depois do reinício também não é re-anexada
(testado por contagem real de linhas no JSONL, não só pelo snapshot).

*Consequência declarada:* o log contém **só fatos únicos aceitos**; contadores de
recepção (duplicatas, quarentenas) têm **escopo de sessão** e vivem em seção própria
do snapshot (`recepcao`), separados do que é derivado do log (§17).

## 6. Correlação (Addendum §7)

Estados por pedido: `matched` (identificador forte único no dia) · `partial` (uma fonte,
sem identificador para casar) · `unmatched` (uma fonte, identificador presente, nenhum
candidato — comporta-se como partial) · `conflict` (2+ candidatos plausíveis).

**Dia operacional da loja (F2-02):** o "dia" do casamento NUNCA é o prefixo UTC da
string ISO. `localDayKey(occurred_at || captured_at, storeTimeZone)` converte o
instante para o fuso IANA **explícito** da loja (`config.storeTimeZone` — sem padrão
embutido; `America/Sao_Paulo` é exemplo de teste, não constante do núcleo) e extrai o
dia LOCAL: a virada respeita a meia-noite da loja, e eventos perto da meia-noite UTC
não caem no dia errado. **Sem timezone configurado ou com IANA inválido: nenhum
casamento automático dependente de dia** — os lados ficam `partial`/`unmatched` com
motivo `sem_dia_operacional_confiavel`; UTC nunca é assumido em silêncio.

**Proibido e testado:** consolidar por proximidade temporal; escolher o candidato "mais
próximo"; nome de cliente como chave. Em `conflict`: candidatos + motivo registrados,
eventos originais preservados, `apto_para_decisao: false` — nada de praça, pressão,
embalagem ou Foco a partir dele.

## 7. Pedidos parciais

- Status sem comanda: preserva coluna/tempo; `comanda: null`; **nenhum item inventado**.
- Comanda sem status: preserva itens/identificadores; **nenhum tempo/estado inventado**.
- Parcial nunca aparece como completo: entra em `pedidos.parciais` com
  `fields_missing` explícito e `apto_para_decisao: false`.

## 8. pedido_alterado (Addendum §13)

`change_mode` canônico: `full_snapshot` · `partial_delta` · `field_correction` ·
`items_replacement` (vocabulário da autorização da Fase 2; os nomes em português do
Addendum §13 são aceitos como alias e normalizados com aviso — §12). Campos:
`revision`, `previous_revision`, `supersedes_event_id`, `changed_fields`.

Regras implementadas e testadas:
- Delta/correção/troca **sem base confiável não é aplicado**: fica registrado como
  pendente, o pedido marca `alteracao_pendente_sem_base` e vira `suspect`. Nada é
  reconstruído por adivinhação.
- **Ausência num delta não remove item.** Remoção só explícita (`itens_removidos`).
- **Última chegada ≠ mais nova.** Ordem vem de `revision`; sem revision, de
  `occurred_at` confiável; sem nenhum dos dois a alteração **não é aplicada**
  (`ordem_desconhecida`, registrada).
- Revisão antiga chegando depois não regride o estado (preservada com motivo).
- Mesma `revision` com conteúdo diferente ⇒ `conflito_revisao`: preserva os dois lados,
  sinaliza, `suspect` — nunca escolhe em silêncio.
- `full_snapshot` é a própria base: pode criar a composição (marcada como nascida de
  alteração, com aviso — a via impressa original nunca é fingida).

## 9. Cancelamento

Marca `cancelado: true` e move o pedido para a lista `cancelados` do snapshot. Histórico
integral preservado (as colunas anteriores continuam no registro). Aceita chegar antes ou
depois da composição. Nunca depende da comanda; nunca é inferido por sumiço.

## 10. Reimpressão

Nunca cria segundo pedido; `vias` conta cada via; idempotente sob replay. Igualdade =
**hash canônico de itens ordenados** (nome normalizado + quantidade + observação).
Hash idêntico ⇒ só carimbo/via. Hash divergente ⇒ `reimpressao_divergente`: o conteúdo
novo fica registrado em `conteudos_divergentes`, os itens atuais **não** são substituídos
em silêncio, o pedido vira `suspect`. Reimpressão sem conteúdo comparável ⇒ aviso
(`reimpressao_sem_conteudo_para_comparar`), nunca presunção de equivalência.

## 11. Freshness e gate de staleness (fecha F3-03)

Estados por fonte: **`atualizada` · `atrasada` · `vencida` · `desconectada` ·
`desconhecida`**. Campos: `last_trusted_at`, `freshness_state`, `freshness_age_ms`,
`freshness_reason` (+ `aparenta_atual`, `confianca_temporal`).

**Contrato de `atrasada` (F3-03):** preserva fatos observados; reduz a confiança
temporal (`reduzida`); `aparenta_atual: false` — nunca parece plenamente atual;
recomendações sensíveis a tempo são **bloqueadas** (padrão conservador) ou **marcadas
como não confiáveis** — comportamento configurável
(`config.freshness.comportamentoAtrasada`), sem elevar severidade artificial.

**Gate independente (Addendum §4):** avaliado ANTES de qualquer recomendação, sem tocar
`confComp`. Matriz implementada: status morto ⇒ sem ação dominante nova (composição segue
como dado parcial); composição morta ⇒ acompanhar tempo sem decisão de praça/embalagem;
ambos mortos ⇒ nenhuma recomendação nova, último snapshot confiável preservado com idade.
Critério de aceite do Addendum provado fim a fim: fonte de status `vencida` ⇒
`permitir_acao_dominante: false`.

**Limiares:** `atrasadaAposMs=90s`, `vencidaAposMs=5min` são **chutes declarados de
desenvolvimento** — os valores definitivos dependem da Fase Sombra e nunca são verdade
operacional. Papel de cada fonte (status/composição) é deduzido por **evidência** (do que
ela emite), nunca por suposição; desconexão é apagada por evidência de vida posterior.

**Clock skew (F2-03):** `captured_at` no futuro não mantém a fonte artificialmente
fresca. Comparação **determinística** `captured_at × received_at` (o `received_at`
persistido preserva o veredito no replay, independente do relógio real da máquina);
tolerância `config.freshness.clockSkewToleranceMs` (chute de dev — o limite real da
loja não é decidido nesta fase). Acima da tolerância: `quality.clock_skew_detected`,
`quality.clock_skew_ms`, `completeness: suspect`, warning
`relogio_inconsistente_captured_at_futuro`; a fonte **não** avança `ultimo_evento_em`
nem `last_trusted_at` (freshness segue o restante da evidência — sem outra, fica
`desconhecida`); o carimbo futuro **não ordena** coluna/revisão (sem `occurred_at`,
a observação fica no histórico com `carimbo_suspeito`, sem avançar a coluna vigente);
`freshness_age_ms` **nunca** é negativo; carimbo futuro direto no estado da fonte ⇒
`desconhecida` com motivo `relogio_inconsistente_carimbo_no_futuro`.

## 12. Divergências e decisões registradas

| Tema | Addendum/Fase 1 | Implementado | Por quê |
|---|---|---|---|
| 1º estado de freshness | `atual` (Addendum §4) | `atualizada` | Autorização da Fase 2 do César fixa o vocabulário; César decide o produto |
| `change_mode` | `snapshot_completo`… (Addendum §13) | `full_snapshot`… canônico + alias aceito com aviso | Autorização da Fase 2; nenhum evento válido do Addendum é rejeitado |
| Local dos testes | `src/live/__tests__/` (Fase 1) | `tests/live/` | Autorização da Fase 2 (arquivos permitidos + comando G1) |
| Detecção de horário na chave de status | — | heurística regex declarada (§4) | Guarda executável além da norma; limite documentado |
| Papel da fonte no gate | — | deduzido do que a fonte emite | Evidência, não configuração inventada |

## 13. Qualidade (fecha F3-07)

`completeness: complete | partial | suspect | unknown`. **`match_state` é exposto
separado de `completeness`** em todo pedido do snapshot. `matched` não implica
`complete` (matched sem itens = partial; matched com aviso = suspect). `complete` não
implica `atualizada` (freshness mora nas fontes). `suspect` nasce de:
`parsing_warnings`, reimpressão divergente, conflito de revisão, alteração sem base,
**composição vazia**.

**Composição presente exige pelo menos UM item válido (correção F2-08):** item válido =
objeto com `nome` de texto não vazio (shape do §2). Distinções obrigatórias:
comanda não recebida ⇒ composição desconhecida (`partial`); `itens` não-array/`null` ⇒
desconhecida/ inválida (`partial`); **`itens: []` ou só itens sem nome ⇒ composição
VAZIA observada ⇒ `suspect` com motivo `comanda_sem_itens` — nunca `complete`, nunca
`apto_para_decisao`**, com ou sem status, sob duplicidade, reimpressão, reinício e
replay. Composição válida posterior (ex.: `pedido_alterado`) recupera a completude
normalmente; alteração de composição válida para vazia **revoga** completude e aptidão
(nada é preservado por estado anterior). Cancelamento continua soberano: cancelado
nunca volta a apto.

Rasura (Addendum §14): `manual_correction_possible: true`;
`manual_correction_detected: null` = "não sabemos", **nunca** "não houve";
`digital_state_may_differ_from_paper: true`. Permanente nesta V1.

## 14. Persistência local (fecha F3-01)

- `criarArmazenamento({ runtimeRoot })` — o chamador SEMPRE informa o diretório; nenhum
  path absoluto de máquina é fixado no código. Produção esperada:
  `%LOCALAPPDATA%\DeliveryOS\runtime` (fora de repositório). Testes: temp do SO.
- **Guarda F3-01, executada antes de qualquer escrita:** se o `runtimeRoot` resolve para
  dentro de um repositório Git, só `data/live/` e `runtime/` (raiz do repo) são aceitos;
  `data/live_backup/`, `tools/runtime/`, `docs/live/` e qualquer alias improvisado são
  rejeitados com erro (`runtime_root_nao_canonico`) — testado.
- Arquivos `eventos.live.jsonl` e `quarentena.live.jsonl` — o sufixo `*.live.jsonl` é
  proteção extra (já gitignorado), mesmo dentro dos paths canônicos.
- Append-only, uma linha por escrita; leitura tolerante: linha inválida contada e
  registrada sem derrubar o processo e **sem ecoar o conteúdo da linha**; última linha
  truncada descartada com registro (`linha_final_truncada`).
- Nenhum dado real commitado, nunca — nem como exemplo (testes usam dados fictícios).

## 15. Quarentena

Motivos estáveis (`schema_version_ausente`, `schema_version_desconhecida`,
`envelope_invalido`, `identificador_essencial_ausente`, `payload_incompativel`,
`dado_pessoal_nao_permitido`, `change_mode_desconhecido`,
`idempotency_key_de_status_com_horario`, `linha_invalida`, `linha_final_truncada`).
Preserva o bruto quando seguro; nunca interrompe o evento seguinte; nunca entra nas
listas operacionais do snapshot (só contagem + motivos); persiste em
`quarentena.live.jsonl` e sobrevive ao reinício (re-semeada no replay, sem regravar).

## 16. Snapshot

Derivado puro, exposto por `nucleo.snapshot()`:
`pedidos.{completos, parciais, conflitos, cancelados}` · `fontes` (freshness completa
por fonte) · `gate_staleness` · `quarentena.{total, por_motivo}` ·
`ultima_atualizacao_confiavel` · `reconstruido_em` · `gerado_em` · `qualidade`
(contadores: recebidos/aceitos/quarentena/duplicados/observações repetidas/linhas
inválidas/reimpressões/alterações/cancelamentos/fora de ordem).

Dois eixos independentes de aptidão, nunca misturados: `apto_para_decisao` por pedido
(casamento + completude) e `gate_staleness` global (tempo). `completos` exige
`completeness: "complete"` — matched suspeito/incompleto fica em `parciais`.
**Nesta fase o snapshot não alimenta motor nem interface.**

## 17. Reconstrução (reinício)

`reconstruirDoLog({ runtimeRoot })`: relê quarentena persistida (semeadura em memória) +
replay do log de eventos **sem re-persistir nada** (provado: o arquivo não cresce em
reconstruções repetidas). Linha corrompida vira quarentena e contagem, nunca aborta.
Com relógio fixo, o snapshot reconstruído é **igual** ao anterior exceto
`reconstruido_em` e a seção `recepcao` (teste 28, `deepEqual`).

**Escopos declarados pós-F2-04:** `snapshot.qualidade` é 100% derivado do log e
sobrevive ao reinício; `snapshot.recepcao` (recebidos/aceitos/duplicatas/quarentenas/
linhas inválidas) é **contagem da sessão** — duplicatas e quarentenas não são
re-anexadas ao log por desenho, então esses números não são reconstruíveis.
*Limitação declarada:* carimbos de observação repetida (última vista, contagem de
vias por reobservação idêntica) avançam só em memória e regridem no replay — o FATO e
o conteúdo sobrevivem; via que precise sobreviver a reinício deve chegar como evento
próprio `pedido_reimpresso` (fato distinto, persistido).

## 18. Matriz de aceite F3-01 a F3-07

| Ressalva | Como foi fechada | Evidência |
|---|---|---|
| F3-01 paths canônicos | Guarda executável em `persistir.js` + arquivos `*.live.jsonl` | teste 31/31b |
| F3-02 residual matriz de riscos | Risco #6 corrigido: gitignore FEITO em `73272bc` | diff da matriz |
| F3-03 contrato de `atrasada` | §11 deste doc + `freshness.js` + config | teste 20 |
| F3-04 idempotency de status | §4: chave sem tempo + guarda executável | testes F3-04 (3) |
| F3-05 diagrama da arquitetura | legenda corrigida: superfície mínima sob Addendum §10 | diff da arquitetura |
| F3-06 consolidar sem conflict | layout corrigido: estados §7 explícitos | diff da arquitetura |
| F3-07 suspect/match_state | §13: suspect implementado; match_state separado | testes 24 + F3-07 (2) |

Achados da revisão do Grok sobre a Fase 2 (`04c58e2`), fechados na Fase 2.1:

| Achado | Como foi fechado | Evidência |
|---|---|---|
| F2-01 PII aninhada | varredura recursiva + allowlist por tipo + redação na quarentena (§2) | tests/live/pii.test.js (marcadores ausentes do disco) |
| F2-02 dia/fuso | `localDayKey` + `storeTimeZone` IANA explícito; sem fuso ⇒ sem casamento (§6) | tests/live/dia-local.test.js |
| F2-03 captured_at futuro | skew determinístico captured×received; fonte nunca fresca à força (§11) | tests/live/clock-skew.test.js |
| F2-04 dup antes do append | pipeline dedup-before-append; divergências em quarentena (§5) | tests/live/dedup-log.test.js (contagem de linhas) |
| F2-05 NIGHT/rows | **ADIADO por decisão** — pertence ao adaptador da Fase 4 (`paraMotor`), fora deste núcleo | registro nesta tabela |
| F2-06 script test:live | **SEM mudança agora** — `package.json` intocável nesta missão; comando canônico: `node --test tests/live/*.test.js` | registro nesta tabela |

## 19. Riscos e limitações conhecidas desta fase

1. **Heurística F3-04 não pega epoch arredondado** (declarado na §4) — a norma segue por
   contrato; adaptadores da Fase 3 devem usar os construtores de `idempotencia.js`.
2. **Limiares de freshness são chutes de dev** — qualquer leitura operacional antes da
   calibração da Fase Sombra é indevida.
3. **`unmatched` × `partial`** distinguem "tinha identificador e não achou" de "não tinha
   identificador" — ambos se comportam como parcial; a distinção é diagnóstica.
4. **Papel de fonte por evidência**: uma fonte nova só entra no gate depois de emitir o
   primeiro evento do papel — antes disso o lado correspondente é `desconhecida`
   (conservador por construção).
5. **Snapshot não é consumido por ninguém ainda** — o shape `NIGHT`/`rows` para o motor
   será derivado DESTE consolidado na Fase 3/4, sem mutação do que o motor conhece.
