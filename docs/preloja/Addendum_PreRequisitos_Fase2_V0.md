# Addendum — Pré-Requisitos da Fase 2 (V0)

> Missão corretiva documental sobre a Fase 1 (`0b68cc3`), em resposta à revisão adversarial do Grok
> (`docs/auditoria-grok/Checkpoints/AUDITORIA_E_ARQUITETURA_PRELOJA_Revisao_Grok.md`, commit
> `de26588`, veredito **APROVADO COM RESSALVAS**). Este documento fecha as ressalvas **enquanto
> ainda são decisões documentais** — nenhuma pode ser "resolvida depois no código" sem contrato
> explícito e critério de aceite aqui. **Nenhum código foi implementado nesta missão.**
>
> Em caso de conflito entre este Addendum e os 4 documentos da Fase 1, **este Addendum vence** — as
> correções pontuais aplicadas nos 4 documentos apontam para cá.

---

## 1. Motivo do addendum

O Grok aprovou a Fase 1 com 5 ressalvas obrigatórias (R1-R5, achados F1-01 a F1-05) e 7 achados
médios/baixos (F1-06 a F1-12). O César determinou que todas fossem fechadas em contrato documental
antes de qualquer linha de código da Fase 2. Este addendum é esse fechamento.

## 2. Achados do Grok considerados

| Achado | Gravidade | Tratamento | Seção deste addendum |
|---|---|---|---|
| F1-01 confiança ≠ staleness | Alta | Gate independente de atualidade | §4 |
| F1-02 envelope incompleto | Alta | Envelope obrigatório versionado | §5 |
| F1-03 gitignore sem cobertura live | Alta | `.gitignore` corrigido + prova executada | §6 |
| F1-04 colisão resolvida por tempo | Alta | Estado `conflict`, proibido merge temporal | §7 |
| F1-05 embalagens no caminho crítico | Alta | Fase 6 suspensa atrás de gate do César | §8 |
| F1-06 duas árvores documentais | Média | Matriz de fonte canônica | §9 |
| F1-07 superfície rica sob fonte parcial | Média | Regras de interface sob parcialidade | §10 |
| F1-08 proibição de clique fraca | Média | Contrato somente-leitura inviolável | §11 |
| F1-09 numeração 2-7 vs 2-8 | Baixa | Corrigida nos docs (padrão: Fases 2-8) | — |
| F1-10 gates sem evidência executada | Média | Política de evidência de teste | §12 |
| F1-11 semântica de pedido_alterado | Média | change_mode/revision definidos | §13 |
| F1-12 rasura sem slot no contrato | Média | quality.manual_correction_* | §14 |

## 3. Decisões adotadas (resumo normativo)

1. Staleness é um **gate próprio, anterior ao cálculo de recomendação** — nunca um efeito colateral
   de confiança baixa, nunca responsabilidade do `confComp` atual (que só lê `fonteReal` e fraqueza
   de severidade — verificado no código; a premissa contrária da Fase 1 estava **errada** e foi
   corrigida nos docs).
2. Todo evento vivo usa o **envelope obrigatório da §5** — versionado, idempotente, com qualidade
   por evento.
3. Runtime real fica **fora do repositório**; `data/live/` é só fallback de desenvolvimento e está
   gitignorado (prova executada, §6).
4. Colisão de identificador vira **`conflict`** — nunca casamento automático por proximidade
   temporal (§7).
5. O motor de embalagens está **fora do caminho crítico** e suspenso atrás do **GATE EMBALAGENS
   VALIDADO PELO CÉSAR** (§8).

## 4. Gate de staleness (fecha F1-01 / R1)

**Correção de premissa:** a Fase 1 afirmou que "o mecanismo de confiança por fonte já existe no
cérebro — `confComp`" cobriria a parada de recomendações com fonte congelada. **Isso é falso.**
`confComp` (em `decisao.js`) só depende de `fonteReal` e de fraqueza de severidade/unblock — não lê
idade de dado, não lê desconexão, não conhece o mundo vivo. Com `fonteReal: true` e status congelado
há 40 minutos, a recomendação sairia com confiança "alta". Os docs da Fase 1 foram corrigidos.

**Decisão:** existe um **gate de staleness independente**, aplicado **antes** do cálculo de
recomendações (no caminho vivo, antes de `decidir()` ser chamado — ou, no mínimo, antes de a ação
dominante ser exibida). Ele não altera `motor.js`/`decisao.js`: é uma peça do `src/live/` que decide
**se** o cérebro deve ser consultado para ação, e **como** o resultado pode ser apresentado.

**Estados de atualidade (freshness_state), por fonte:**

| Estado | Significado |
|---|---|
| `atual` | Último evento dentro do limiar configurado |
| `atrasada` | Acima do limiar de atenção, abaixo do limiar de vencimento |
| `vencida` | Acima do limiar de vencimento |
| `desconectada` | Fonte emitiu `fonte_desconectada` ou heartbeat sumiu |
| `desconhecida` | Sem informação suficiente para classificar (ex.: boot) |

**Campos conceituais mínimos** (no snapshot de qualidade, por fonte):
`occurred_at` (quando o fato aconteceu na origem) · `captured_at` (quando o adaptador observou) ·
`received_at` (quando o núcleo recebeu) · `last_trusted_at` (último instante em que a fonte era
`atual`) · `freshness_state` · `freshness_age_ms`.

**Limiares:** configuráveis, **sem valores definitivos agora** — serão calibrados com evidência da
Fase Sombra na loja. Valores iniciais de desenvolvimento são chutes declarados, nunca verdade.

**Matriz de comportamento (normativa):**

| Status | Composição | Comportamento |
|---|---|---|
| atual | atual | Operação normal — cérebro consultado, ação dominante permitida |
| vencida/desconectada | atual | **Não criar recomendação baseada em tempo/atraso.** Composição segue como dado observado, claramente parcial. Foco por tempo não nasce |
| atual | vencida/desconectada | Pode acompanhar estado e tempo. **Não produzir decisão de praça, embalagem ou composição** como se os itens estivessem atuais |
| vencida | vencida | **Nenhuma recomendação nova.** Preservar último snapshot confiável com horário explícito; interface indica dado vencido/fonte desconectada |

**Critério de aceite (Fase 2/5):** teste unitário provando que, com fonte de status `vencida`, o
caminho vivo **não** produz ação dominante nova — independente do que `confComp` diria.

## 5. Envelope de eventos (fecha F1-02 / R2)

Todo evento vivo obedece a este envelope. Evento **sem `schema_version` não é aceito
silenciosamente**; versão desconhecida ⇒ **rejeição ou quarentena** (contada em qualidade, nunca
descartada em silêncio). Nenhum campo ausente é inventado. **Dados pessoais não operacionais
(telefone, endereço) não têm campo no envelope** — o que não existe no schema não vaza; nome de
cliente não entra por padrão.

```json
{
  "schema_version": "1.0",
  "event_id": "uuid-gerado-na-captura",
  "event_type": "comanda_impressa | status_ifood | pedido_cancelado | pedido_reimpresso | pedido_alterado | fonte_conectada | fonte_desconectada | pedido_vivo",
  "source": "sim_comanda | sim_status | (futuro: epson_fila | gestor_ifood)",
  "source_event_id": "id nativo da fonte, quando existir (ex.: id do job de impressão)",
  "idempotency_key": "chave determinística do FATO (mesmo fato => mesma chave)",
  "occurred_at": "quando o fato aconteceu na origem (se conhecido; senão null)",
  "captured_at": "quando o adaptador observou",
  "received_at": "quando o núcleo recebeu",
  "correlation": {
    "ifood_short": "0724 | null",
    "pedido_interno": "0000170512 | null",
    "print_job_id": "id do job | null"
  },
  "payload": { "conteúdo específico do event_type" },
  "quality": {
    "completeness": "complete | partial",
    "freshness": "atual | atrasada | desconhecida (na captura)",
    "certainty": "observado | inferido",
    "parsing_warnings": [],
    "manual_correction_possible": true,
    "manual_correction_detected": null,
    "digital_state_may_differ_from_paper": true,
    "fields_missing": [],
    "source_partial": false
  }
}
```

**Papéis distintos:** `event_id` identifica **a observação** (cada captura gera um);
`idempotency_key` identifica **o fato** (mesma comanda relida no replay ⇒ mesma chave ⇒ processada
uma vez). `schema_version` permite evolução compatível.

**Exemplos conceituais (payloads; envelope omitido por brevidade — dados fictícios):**

- `comanda_impressa` — payload: `{ pedido_interno, ifood_short, sequencia, emissao, itens: [{nome,
  quantidade, observacao}], origem }`. idempotency_key: `comanda:{pedido_interno}:{hash_conteudo}`.
- `status_ifood` — payload: `{ ifood_short, coluna: "em_preparo|pronto|em_rota|finalizado",
  tempo_decorrido_min, atraso_min }`. idempotency_key:
  `status:{ifood_short}:{dia}:{coluna}:{captured_at_arredondado}`.
- `pedido_cancelado` — payload: `{ ifood_short, visto_em }` — **só nasce da fonte de status**
  (nunca inferido da comanda). idempotency_key: `cancel:{ifood_short}:{dia}`.
- `pedido_reimpresso` — payload: `{ pedido_interno, ifood_short, emissao_nova, conteudo_identico:
  true|false }` (ver §13 — reimpressão com conteúdo divergente é `reimpressao_divergente` no
  payload, nunca segundo pedido). idempotency_key: `reimp:{pedido_interno}:{emissao_nova}`.
- `pedido_alterado` — ver semântica completa na §13. Payload inclui `change_mode`, `revision`,
  `supersedes_event_id`, `changed_fields`.
- `fonte_desconectada` — payload: `{ source, ultimo_evento_em, motivo: "timeout|erro|parada" }`.
- `pedido_vivo` — **semântica definida** (o Grok apontou tipo opaco): é o **heartbeat de
  observação** — a fonte de status reafirma "este pedido continua visível na origem em T". É uma
  observação real (o cartão está lá), não um derivado. Serve para `last_trusted_at` e para detectar
  sumiço silencioso. Payload: `{ ifood_short, coluna, visto_em }`.

**Proibição herdada da §11:** o contrato dos adaptadores (mesmo simulados) é **somente leitura** —
nenhum evento pode nascer de uma interação de escrita com a fonte.

## 6. Política de runtime e Git (fecha F1-03 / R3)

- **Produção real:** diretório de runtime **fora do repositório**, configurável — referência
  conceitual no Windows: `%LOCALAPPDATA%\DeliveryOS\runtime`.
- **Desenvolvimento/simulação:** `data/live/` como fallback local, **gitignorado**.
- **`.gitignore` corrigido nesta missão** (não adiado para a Fase 2): `/data/live/`, `/runtime/`,
  `*.live.jsonl`, `*.runtime.jsonl`.
- **Prova executada** (10/07/2026, nesta máquina): `data/live/prova-ignore.jsonl` criado sem dado
  real → `git check-ignore -v` respondeu `.gitignore:18:/data/live/` → arquivo **não** apareceu no
  `git status` → prova extra `teste.live.jsonl` respondeu `.gitignore:20:*.live.jsonl` → ambos
  removidos. Nenhum arquivo de runtime foi commitado.
- Logs e snapshots obedecem à mesma política (padrões `*.live.jsonl`/`*.runtime.jsonl` cobrem).
- **Nenhum pedido real pode ser commitado, nunca** — nem como exemplo, nem truncado.
- Gate de checkpoint das fases: `git status` precisa estar limpo de qualquer arquivo vivo.

## 7. Política de conflito (fecha F1-04 / R4)

**Proibido:** consolidar dois registros usando **apenas** proximidade temporal. Proximidade
temporal pode ser **indício registrado** (diagnóstico), nunca chave suficiente de casamento.

**Estados de casamento (por pedido consolidado):**

| Estado | Significado | Vai ao motor? |
|---|---|---|
| `matched` | Casado por identificador forte | Sim |
| `partial` | Só uma fonte presente (comanda sem status / status sem comanda) | Regras de parcial (§10 e Fase 1 §8) |
| `unmatched` | Fonte presente, sem candidato do outro lado | Como parcial |
| `conflict` | Ambiguidade real (ver gatilhos) | **Não** |

**Gatilhos de `conflict`:** mesmo código curto podendo corresponder a mais de um pedido · múltiplos
`pedido_interno` candidatos · horários próximos sem identificador forte · itens/origem
incompatíveis entre os candidatos · evidência insuficiente para uma relação única.

**Regras do estado `conflict`:** não consolidar automaticamente · não enviar ao motor · não
produzir praça, embalagem, pressão ou foco a partir dele · registrar candidatos + motivo · aguardar
evidência posterior (ex.: um `pedido_vivo`/status novo que desambigue) ou revisão manual · **nunca
apagar os eventos originais** · nunca escolher "o mais próximo" como se fosse certeza.

**Identificadores fortes preferenciais (ordem):** `ifood_short + pedido_interno` (quando as duas
fontes trazem ambos) → identificador próprio da fonte (`source_event_id`) → `print_job_id +
pedido_interno` → outra combinação comprovadamente única. **Nome de cliente nunca é chave.**

**Critério de aceite (Fase 2):** teste unitário com dois pedidos de mesmo código curto em janela
próxima ⇒ resultado `conflict`, motor não recebe nenhum dos dois, eventos preservados.

## 8. Bloqueio do motor de embalagens (fecha F1-05 / R5)

- A Fase 6 **não é pré-requisito** da fonte viva e **não bloqueia** o modo sombra.
- A Fase 6 fica **suspensa** até as pendências das §15 e §16 de
  `docs/Logica_Embalagens_DeliveryOS_V0.md` serem validadas (8 respostas do César + matriz técnica).
- Nenhuma regra incerta vira decisão automática; nenhum alias desconhecido é resolvido por
  adivinhação.
- Implementação futura só como **módulo experimental por flag**, após **autorização separada** — e
  com a flag desligada, **nada** muda em Sinais de Fluxo, interface ou comportamento atual.

### GATE EMBALAGENS VALIDADO PELO CÉSAR

Sem este gate: **não** implementar o motor completo; **não** usar embalagem como verdade
operacional; **não** incorporar embalagens ao caminho crítico da Release Candidate. O caminho
crítico do programa é **F2 → F3 → F4 → F5 → F7 → F8**; F6 é opcional/estacionada.

## 9. Fonte canônica dos documentos (fecha F1-06)

| Camada | Documentos | Papel |
|---|---|---|
| **Canônicos de produto/operação** | `Constituicao.md` → `Leis_Fundamentais.md` → `Manifesto_Produto_Design.md` → `Contrato_Estado_Cognitivo_V1.md` · `Contrato_Motor_Decisao.md` · `Logica_Embalagens_DeliveryOS_V0.md` · `Auditoria_Fonte_Viva_Loja_V1.md` · `Arquitetura_Sincronizacao_Local_V1.md` · `Parser_Comanda_Tecnisa_V1.md` · `Inspecao_Fontes_Reais_Loja_V0.md` | Mandam sobre produto, operação e verdade dos dados |
| **Auditoria adversarial** | `docs/auditoria-grok/*` (branch do Grok) | Evidência crítica; não é especificação — seus achados viram norma quando absorvidos em addendum como este |
| **Implementação pré-loja** | `docs/preloja/*` (Fase 1) | Plano de engenharia; **não substitui silenciosamente** os canônicos |
| **Addendum atual** | `docs/preloja/Addendum_PreRequisitos_Fase2_V0.md` | Vence os docs da Fase 1 em conflito; perde para os canônicos |

**Regra de conflito:** quando `docs/preloja` divergir de um canônico, **registrar a divergência e
pedir decisão ao César** — nunca escolher automaticamente. Equivalência de vocabulário entre trilhas
(fases 2-8 do Fable × S0/S1/T/P/O do Grok) deve ser mapeada quando os dois vocabulários se cruzarem
num mesmo checkpoint.

## 10. Regras da interface sob fonte parcial (fecha F1-07)

- Fonte parcial ou vencida **não sustenta percentual de pressão com aparência precisa** — barra sem
  número, neutra ou marcada como parcial.
- Ambiente sem composição atual fica **neutro/parcial/sem percentual** — nunca verde por ausência
  de dado (verde = saúde comprovada, não silêncio).
- Barra de pressão **não usa dado antigo como se fosse atual**.
- **Foco não nasce de fonte vencida** (consequência direta do gate de staleness, §4).
- Último snapshot confiável exibe **idade ou condição de desatualização**.
- A Fase 4 **pode restringir a superfície** no caminho vivo (Calmo + Ambiente + Foco + estado de
  saúde das fontes, antes de Mapa/Pressão/Sinais) — paridade total com as camadas experimentais da
  V1 histórica **não é** critério de aceite; honestidade sob parcialidade é.

## 11. Contrato de somente leitura do Gestor (fecha F1-08)

Linha inviolável, válida para **todo** adaptador do Gestor iFood — simulado agora, real depois:

**SOMENTE LEITURA. Nenhum clique em pronto. Nenhum clique em cancelar. Nenhum chat. Nenhum envio.
Nenhuma alteração de status. Nenhuma captura de senha. Nenhum armazenamento de cookie no Git.
Nenhuma chamada de escrita.**

- O programa pré-loja **não contém API de clique** — nem "só para testar".
- Inspeção de DOM é **manual** (F12, roteiro de `docs/Inspecao_Fontes_Reais_Loja_V0.md`).
- Qualquer necessidade futura de interação (ex.: rolagem controlada do Modelo B) exige **nova
  missão com autorização explícita do César** — não é derivável deste programa.

## 12. Evidência de testes (fecha F1-10)

Nota 8,1, troca proibida 0 e demais gates **só podem ser declarados aprovados quando**: o comando
foi realmente executado · o ambiente estava disponível · a saída foi registrada · o código analisado
corresponde ao hash declarado.

**Quando o ambiente não permitir execução** (ex.: worktree sem `node_modules`, `data/raw` ausente):
registrar **`N/A — não executado (motivo)`**. **Nunca aprovado por herança de relatório anterior.**

Gates da Fase 2 em diante ficam separados em dois grupos:
- **G1 (sempre executável):** `node --test src/live/` — obrigatório verde em todo checkpoint.
- **G2 (bateria histórica):** build/typecheck/demo/cardápio/autoteste/auditoria — executar **se**
  deps+dados presentes; senão `SKIP com motivo` explícito no relatório. Nunca inventar nota.

## 13. Semântica de `pedido_alterado` (fecha F1-11)

Campos obrigatórios no payload:

| Campo | Significado |
|---|---|
| `change_mode` | `snapshot_completo` (estado inteiro novo) · `delta_parcial` (só mudanças) · `correcao_campo` (um campo corrigido) · `substituicao_itens` (lista de itens trocada) |
| `revision` | Número/marca de revisão crescente, quando a fonte fornecer |
| `supersedes_event_id` | `event_id` do evento que este substitui, quando conhecido |
| `changed_fields` | Lista dos campos alterados |
| `previous_revision` | Revisão anterior, quando conhecida |

**Regras:** não aplicar delta sem base confiável (sem base ⇒ tratar como parcial, nunca reconstruir
por adivinhação) · **não remover item por ausência num delta** (ausência em delta ≠ remoção) · não
presumir que a última chegada é a mais nova sem `revision` ou `occurred_at` confiável (fora de ordem
existe) · igualdade de conteúdo entre duas comandas é definida por **hash canônico de itens
ordenados** (nome normalizado + quantidade + observação) — reimpressão com hash idêntico só atualiza
carimbo; hash divergente vira `pedido_reimpresso` com `conteudo_identico: false`
(**reimpressão divergente**), registrada e nunca silenciosa.

## 14. Limitação de correção manual (fecha F1-12)

Campos permanentes no `quality` de todo evento de comanda (e herdados pelo consolidado):

- `manual_correction_possible: true` — sempre, nesta V1 (a operação corrige à caneta).
- `manual_correction_detected: null` — normalmente `null`: a captura digital **não detecta** rasura;
  `null` significa "não sabemos", **nunca** "não houve".
- `digital_state_may_differ_from_paper: true` — o estado digital pode diferir do papel.

A interface e os relatórios nunca apresentam a comanda digital como estado final absoluto (copy:
"itens impressos", não "itens do pedido"). Risco registrado na matriz da operação real.

## 15. Critérios objetivos para autorizar a Fase 2

A Fase 2 só pode ser autorizada com **todos** os itens abaixo declarados nesta documentação:

| # | Critério | Onde está |
|---|---|---|
| 1 | Gate de staleness independente, anterior à recomendação | §4 |
| 2 | Envelope versionado e idempotente | §5 |
| 3 | Runtime protegido e fora do Git (com prova) | §6 |
| 4 | Colisões tratadas como `conflict` | §7 |
| 5 | Embalagens fora do caminho crítico | §8 |
| 6 | Dados parciais não geram falsa precisão | §10 |
| 7 | Adaptadores futuros somente leitura | §11 |
| 8 | Testes exigem evidência executada (ou N/A declarado) | §12 |
| 9 | `pedido_alterado` com semântica definida | §13 |
| 10 | Correção manual explicitamente incerta | §14 |

Pendência operacional que continua antes da execução (não da autorização) da Fase 2:
**`npm ci` no worktree** (autorização própria, já solicitada — sem ela, G2 será `SKIP com motivo`).
