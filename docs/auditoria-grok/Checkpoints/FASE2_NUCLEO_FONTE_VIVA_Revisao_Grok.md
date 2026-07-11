# Revisão Adversarial Grok — Checkpoint Fable

| Campo | Valor |
|---|---|
| **Fase** | FASE 2 — NÚCLEO MODULAR DE FONTE VIVA · CONCLUÍDA |
| **Branch Fable** | `feature/preloja-fable` (**não** alterada por este revisor) |
| **Hash base** | `73272bcbf1bca8c69811f4a1388638582adc3694` |
| **Hash do commit** | `4a74077541245f3429cfe9b6cc6caefdd295588e` |
| **Mensagem** | `Cria nucleo modular de fonte viva local` |
| **Revisor** | Red Team Grok · `audit/preloja-grok` |
| **Data** | 11/07/2026 |
| **main** | intocada |
| **Ancestralidade** | `73272bc` ⊂ ancestral de `4a74077` · OK |

---

## 0. Processo

```text
git fetch origin
git show --stat 4a74077
git log --oneline 73272bc..4a74077   →  1 commit
git diff --stat 73272bc...4a74077    →  30 files, +3290 / −4
```

### Diff (escopo)

| Área | Arquivos |
|---|---|
| Núcleo | `src/live/*` (14 módulos) |
| Testes | `tests/live/*` (12 test files + helpers) |
| Docs | `Contrato_Nucleo_Fonte_Viva_V0.md` + ajustes Arquitetura/Matriz |
| **Não tocados** | `motor.js`, `decisao.js`, `app-v1`, seed, `package.json`, adaptadores reais |

### Ambiente de teste (isolado)

Worktree detach `4a74077` em temp (sem `npm install`):

```text
node --test tests/live/*.test.js
→ 63 tests, 63 pass, 0 fail  (duration ~328ms)
```

Regressão no worktree grok (cérebro histórico):

```text
node tools/verificar_integridade_cardapio.js → OK
```

Ataques manuais adicionais (scripts Node fora da suíte): nested PII, clock futuro, colisão, cancel→print, shape do snapshot, flood, path canônico — ver §3–4.

---

## 1. Veredito

# **APROVADO COM RESSALVAS**

| Dimensão | Julgamento |
|---|---|
| Entrega Fase 2 (núcleo modular + testes + contrato) | **Cumpre** com qualidade alta |
| Gates do Addendum R1–R5 / F3-* anteriores | **Majority fechados em código** (staleness, conflict, idempotência status, F3-01 path, atrasada) |
| Suíte G1 | **63/63 verde** |
| Cérebro / UI | **Intocados** |
| Privacidade sob ataque | **Furo real** (PII aninhado) — ressalva alta |
| Snapshot `NIGHT`+`rows` | **Ausente de propósito** (`modo: nucleo_isolado`) — OK nesta fase; F4 deve consumir adaptador |
| Autorizar **Fase 3** (simulador sintético limpo) | **Sim**, com fixtures sem PII e sem dados reais |
| Ligar adaptador real / operação | **Não** até fechar F2-01 (e calibrar dia/fuso) |
| Bloqueia Fase Sombra S0 cognitiva? | **Não** |
| Bloqueia S1 captura real? | **Parcial** — núcleo serve; privacidade/fuso antes de log real |
| Bloqueia operação real? | **Sim** enquanto PII aninhado puder ir ao JSONL |

**Não é “Aprovado” puro** (furo de privacidade + dia operacional + log com duplicata).  
**Não é “Precisa corrigir” como bloqueio de F3 sintético** — a suíte e o desenho do núcleo são sólidos.  
**Não é “Bloqueado”.**

---

## 2. O que está bem (crédito adversarial)

1. **Arquitetura em módulos** com orquestração magra (`nucleo.js`) e regras localizadas.
2. **Envelope versionado** + quarentena sem aceitar silêncio (`schema_version` ausente/desconhecida).
3. **Staleness independente** de `confComp` (`freshness.js` + `gate_staleness` no snapshot) — F1-01 / F3-03 cobertos; `atrasada` com `bloquear` default.
4. **Conflict sem merge temporal** — testado (casos 11–12); ataque A3 reproduziu `conflict`.
5. **Cancel só de status**, ordem livre, histórico preservado — testes 13a–c + A6.
6. **Reimpressão** idêntica/divergente sem segundo pedido e sem substituir itens em silêncio.
7. **pedido_alterado** com revision, delta sem remoção implícita, fora de ordem — suíte forte.
8. **F3-04**: chave de status sem horário + quarentena se `idempotency_key` embute `T`/`hh:mm`.
9. **F3-01**: `runtimeRoot` improvisado dentro de repo **rejeitado** antes de escrever.
10. **Replay** idempotente; linha truncada/inválida não derruba; PII no topo rejeitado sem ecoar valor.
11. **Honestidade**: limiares rotulados como chutes de dev; `modo: nucleo_isolado`; rasura `manual_correction_detected: null`.
12. **Zero acoplamento** a `motor.js`/`decisao.js`.

---

## 3. Achados

### F2-01 — Privacidade: PII aninhado no payload é aceito e pode ir ao JSONL

| Campo | Conteúdo |
|---|---|
| **ID** | F2-01 |
| **Gravidade** | **Alta** |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `src/live/contrato.js` `acharCampoProibido` — itera só chaves do **objeto de 1º nível** de envelope / correlation / payload; **não** desce em `itens[]`, `entrega{}`, `meta{}` |
| **Evidência** | Ataque: `payload.itens[0].meta.telefone` e `payload.entrega.endereco` → `{aceito:true, destino:"processado"}`. Topo `payload.Telefone` é bloqueado (teste de privacidade + A8). Contrato/docs afirmam que telefone/endereço “não têm campo” e “não vazam”. |
| **Como reproduzir** | No tree `4a74077`: `criarNucleo` + `receber` com item `{ meta: { telefone: "11" } }` ou `entrega: { endereco: "…" }`. |
| **Impacto** | Comanda real Odhen tem consumidor/endereço; se o parser futuro copiar aninhado, **grava PII em `eventos.live.jsonl`**, viola Política de Dados / Addendum §5 em espírito, e quarentena **não** limpa o bruto (motivo ≠ `dado_pessoal_nao_permitido`). |
| **Correção recomendada** | Varredura **recursiva** de chaves proibidas (depth limit); rejeitar; e/ou allowlist estrita do shape de `itens` (`nome`,`quantidade`,`observacao` apenas). Teste adversarial nested. |
| **Bloqueia próxima fase (F3)?** | **Não** se simulador só emitir shape limpo |
| **Bloqueia Fase Sombra com dado real?** | **Sim** até corrigir |
| **Bloqueia operação real?** | **Sim** |
| **Confiança** | **Alta** (reproduzido) |

---

### F2-02 — `diaDe` usa prefixo de calendário da string ISO, não dia operacional da loja

| Campo | Conteúdo |
|---|---|
| **ID** | F2-02 |
| **Gravidade** | **Alta** (em live real) / **Média** (F3 sintético controlado) |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `src/live/normalizar.js` `diaDe`: `iso.match(/^(\d{4}-\d{2}-\d{2})T/)` |
| **Evidência** | Mesmo instante físico: `2026-07-11T02:30:00.000Z` → dia `2026-07-11`; `2026-07-10T23:30:00-03:00` → dia `2026-07-10`. Status e comanda com fusos/formatos diferentes **não casam** (unmatched) ou **colisões por dia errado**. Chave status `if:{short}:{dia}` herda isso. |
| **Como reproduzir** | Chamar `diaDe` nos dois ISOs acima; ou enviar comanda com offset −03 e status em Z no limite da meia-noite. |
| **Impacto** | Pico perto da meia-noite BRT: pedidos órfãos ou conflitos fantasmas; Foco/praça futuros cegos. |
| **Correção recomendada** | Política explícita: normalizar para **fuso da loja** (config) antes de extrair dia; testes de fronteira 22:00–03:00 BRT; documentar no Contrato §12. |
| **Bloqueia F3?** | Não se fixtures usarem o mesmo formato de timestamp |
| **Bloqueia Sombra/real?** | **Sim** sob fontes heterogêneas sem normalização |
| **Confiança** | **Alta** |

---

### F2-03 — Evento com `captured_at` no futuro fica “sempre fresco” até o relógio alcançar

| Campo | Conteúdo |
|---|---|
| **ID** | F2-03 |
| **Gravidade** | **Média** |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `freshness.js` `classificarFonte`: `idade = Math.max(0, agoraMs - ultimoMs)`; `nucleo.js` `atualizarFonte` usa a mesma lógica para `last_trusted_at` |
| **Evidência** | Ataque A4: `captured_at = agora+1h` → `freshness_state: "atualizada"`, `freshness_age_ms: 0`, `last_trusted_at` no futuro. |
| **Como reproduzir** | Relógio fixo + evento com `captured_at` adiantado. |
| **Impacto** | Clock skew de Windows/adaptador mascara atraso real; gate de staleness não aciona. |
| **Correção recomendada** | Se `ultimoMs > agoraMs + tolerância` → `desconhecida` ou `suspect` + warning `relogio_inconsistente`; não atualizar `last_trusted_at` com futuro. |
| **Bloqueia F3?** | Não |
| **Bloqueia sombra/real?** | Parcial (depende de NTP da loja) |
| **Confiança** | **Alta** |

---

### F2-04 — Duplicata de `event_id` ainda é **anexada** ao JSONL antes do dedup

| Campo | Conteúdo |
|---|---|
| **ID** | F2-04 |
| **Gravidade** | **Média** |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `nucleo.js` `receber`: `armazenamento.anexarEvento(ev)` **antes** de `dedup.registrar(ev)` |
| **Evidência** | Mesmo `event_id` 2× → segunda resposta `duplicado_ignorado`, mas arquivo tem **2 linhas**. Replay tolera (dedup em memória), porém log cresce e contadores de “recebidos” ≠ fatos únicos. |
| **Como reproduzir** | Ver script: `lines in log 2` após duas recepções idênticas. |
| **Impacto** | Disco/ruído; auditoria de volume enganosa; em bug de adaptador que reenvia o mesmo id, log explode. |
| **Correção recomendada** | Dedup **antes** de persistir; ou persistir só se `aceito`/fato novo; ou marcar linha como `dup` sem reprocessar contagens de negócio. |
| **Bloqueia F3?** | Não |
| **Bloqueia sombra/real?** | Não se volume baixo; risco operacional em retry agressivo |
| **Confiança** | **Alta** |

---

### F2-05 — Snapshot isolado sem `NIGHT`/`rows` (dívida explícita para F3/F4)

| Campo | Conteúdo |
|---|---|
| **ID** | F2-05 |
| **Gravidade** | **Baixa** nesta fase / **Alta** se F4 ligar UI sem adaptador de shape |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `snapshot.js` retorno: `pedidos.{completos,parciais,conflitos,cancelados}`, `gate_staleness` — **sem** `NIGHT`/`rows` |
| **Evidência** | Ataque A5: `A5_hasNIGHT: false`. Docs da Fase 1/Arquitetura falavam em envelope em volta de NIGHT+rows; Contrato F2 declara isolamento honesto. |
| **Impacto** | Esperado na F2; risco de alguém plugar snapshot cru no motor e inventar mapping ad hoc. |
| **Correção recomendada** | F3/F4: módulo `paraMotor.js` explícito + testes de shape; gate “sem NIGHT ⇒ não chama step”. |
| **Bloqueia F3?** | Não (simulador pode emitir eventos, não UI) |
| **Bloqueia F4/Sombra UI?** | Sim sem adaptador |
| **Confiança** | **Alta** |

---

### F2-06 — Sem script `test:live` no `package.json`

| Campo | Conteúdo |
|---|---|
| **ID** | F2-06 |
| **Gravidade** | **Baixa** |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `package.json` inalterado — sem `"test:live"` |
| **Evidência** | Plano pré-loja previa script com autorização; G1 funciona via `node --test tests/live/*.test.js` |
| **Impacto** | Atrito de checkpoint; não quebra qualidade atual |
| **Correção recomendada** | Com autorização: adicionar script; ou documentar comando canônico no Contrato (já parcialmente em layout) |
| **Bloqueia?** | Não / Não / Não |
| **Confiança** | **Alta** |

---

### F2-07 — Registro dedup em memória sem teto / sem evicção

| Campo | Conteúdo |
|---|---|
| **ID** | F2-07 |
| **Gravidade** | **Média** (processo longo) |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `dedup.js` + `nucleo` Map de chaves por sessão |
| **Evidência** | Flood 5000 status distintos: OK funcional; Sets crescem com o turno. Reinício via reconstruir recarrega o dia do log (OK). Sessão multi-dia sem restart: risco de memória. |
| **Impacto** | Caixa ligado semanas sem restart → crescimento monotônico |
| **Correção recomendada** | Evict por dia operacional antigo; ou reconstruir diário forçado na F7 |
| **Bloqueia F3?** | Não |
| **Bloqueia real?** | Parcial (mitigável por restart diário) |
| **Confiança** | **Média-alta** |

---

### F2-08 — Comanda com `itens: []` é aceita como composição

| Campo | Conteúdo |
|---|---|
| **ID** | F2-08 |
| **Gravidade** | **Baixa** |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `contrato.js` exige `Array.isArray(itens)`, não `length > 0`; consolidar grava `itens_atuais: []` |
| **Evidência** | A1: `comanda_nova`, parcial `unmatched`, `apto_para_decisao: false` |
| **Impacto** | Baixo se apto=false; pode poluir contagens / freshness de composição “viva” com lixo |
| **Correção recomendada** | `itens.length === 0` ⇒ quarentena ou `suspect` + warning `comanda_sem_itens` |
| **Bloqueia?** | Não |
| **Confiança** | **Alta** |

---

### F2-09 — Gate de staleness por **papel** usa pior fonte do papel; multi-source OK, mas ausência de status parece “vencida”

| Campo | Conteúdo |
|---|---|
| **ID** | F2-09 |
| **Gravidade** | **Baixa** (comportamento conservador) |
| **Hash** | `4a74077` |
| **Arquivo e trecho** | `snapshot.js` + `freshness.avaliarGateStaleness`: sem papel status → `desconhecida` → trata como morta |
| **Evidência** | Só comanda: `motivo: fonte_de_status_vencida_ou_desconectada`, `permitir_acao_dominante: false` — **correto e conservador** |
| **Impacto** | Nenhum negativo de segurança; copy futura não deve dizer “Gestor caiu” quando “ainda não houve status” |
| **Correção recomendada** | Distinguir `sem_fonte_de_status_ainda` vs `desconectada` na apresentação (F4) |
| **Bloqueia?** | Não |
| **Confiança** | **Alta** |

---

### F2-10 — Nenhuma regressão de cérebro neste commit

| Campo | Conteúdo |
|---|---|
| **ID** | F2-10 |
| **Gravidade** | Informativa |
| **Evidência** | Diff sem motor/UI; cardápio OK |
| **Impacto** | Zero na loja **hoje** (núcleo isolado) |
| **Bloqueia?** | Não |

---

## 4. Matriz de verificação obrigatória

| Tema | Resultado |
|---|---|
| Premissas falsas | Staleness/confComp **corrigidos**. Premissa “PII não vaza” **falsa sob nested** (F2-01) |
| Casos extremos | Conflict, cancel ordem, reimpressão, schema, truncate: **cobertos**. Nested PII, clock futuro, fuso: **furos** |
| Dados incompletos | Parciais honestos; empty itens aceito (F2-08) |
| Duplicidade | event_id / idempotency OK em estado; log ainda grava dup (F2-04) |
| Fora de ordem | Status e alteração: preserva, não regride |
| Recuperação | Reconstrução testada; append-only |
| Privacidade | Topo OK; **nested FAIL** |
| Falha silenciosa | schema/quarentena OK; future clock mascara atraso |
| Falsa confiança | Limiares rotulados; gate explícito; cuidado com “completo” vs matched (F3-07 testado) |
| Regressões | Nenhuma no cérebro |
| Acoplamentos | Núcleo isolado; dívida NIGHT/rows |
| Impacto loja | **Zero runtime** neste hash; risco futuro se adaptador real + F2-01/F2-02 |

---

## 5. Checklist adversarial (Fase 2)

| Seção | Resultado |
|---|---|
| 0 Higiene | **PASS** |
| 1 Contrato eventos | **PASS** com F2-01 |
| 2 Validação | **PASS** (empty itens frouxo) |
| 3 Dedup | **PASS** estado; F2-04 log |
| 4 Consolidação | **PASS** |
| 5 Parciais | **PASS** |
| 6 Cancel | **PASS** |
| 7 Recuperação | **PASS** |
| 8 Offline/staleness | **PASS** + F2-03 |
| 9 Simulação | N/A (F3) |
| 10 Flags | N/A |
| 14–15 Segurança/Privacidade | **FAIL parcial** F2-01 |
| 16 Rollback | N/A processo Windows |
| Proibidos (motor, click, secrets) | **PASS** |

---

## 6. Parecer final

```text
Checkpoint Fable: 4a74077541245f3429cfe9b6cc6caefdd295588e
Base: 73272bc
Fase: 2 — Núcleo modular de fonte viva
Revisor: Red Team Grok
Data: 2026-07-11

G1: 63/63 PASS (isolado, sem npm install)
Altos: F2-01 (PII nested), F2-02 (dia/fuso) [real]
Médios: F2-03, F2-04, F2-07
Baixos: F2-05, F2-06, F2-08, F2-09

Pode AUTORIZAR FASE 3 (simulador sintético limpo)?  SIM
Pode S1 com captura real de comanda?  NÃO até F2-01 (+ política de dia)
Pode operação real / UI live?  NÃO
Pode merge main?  NÃO (fora de escopo; programa em feature)

Decisão: APROVADO COM RESSALVAS
```

### Ressalvas obrigatórias antes de dado real

1. **F2-01** — bloqueio recursivo / allowlist de itens.  
2. **F2-02** — dia operacional com fuso da loja.  
3. Preferível: **F2-03** clock futuro, **F2-04** persist-after-dedup.

### Crédito

Fase 2 entrega o que o Red Team pediu no Addendum com testes que **citam** achados Grok (F3-01, F3-03, F3-04, F3-07) e os fecham de forma verificável. O núcleo é utilizável como base da F3.

---

## 7. Artefato desta revisão

Somente documentação em `audit/preloja-grok`. Código Fable / `main` intocados.

*Worktree de teste temp: remover com `git worktree remove` no ambiente do revisor (não faz parte do commit).*
