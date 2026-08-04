# Qualificação dos produtores vivos — resolução de PB8

> **R5-D2.** Nenhuma integração foi ativada, nenhum probe externo foi executado, nenhum evento foi
> gravado no ledger oficial. Guarda: `npm run test:platform:r5d2-producer-qualification`.
>
> **Decisão vinculante:** não existe fonte única. **Cada tipo de evento tem produtor autoritativo
> próprio**, e uma fonte só pode emitir os fatos que efetivamente conhece.

---

## 1. Inventário — o que existe no repositório

| Fonte | Arquivo/módulo | Direção | Formato | Autenticação | Implementado? |
|---|---|---|---|---|---|
| **Relatório iFood (lote)** | `src/ingest/ifoodRelatorio.ts` · `parserRelatorioIfood.js` · `src/core/adaptadores.ts` | leitura | XLSX exportado, linha por pedido | nenhuma (arquivo) | **sim** |
| **Gestor iFood (DOM)** | ∅ — só documentação | leitura passiva | HTML no navegador | sessão humana já logada | **não** |
| **Odhen/Teknisa — fila de impressão** | ∅ — só documentação | leitura | job de spool Windows | ACL local | **não** |
| **Odhen/Teknisa — banco local** | ∅ — só documentação | leitura | desconhecido | desconhecida | **não** |
| **Saúde de fonte** | `sinais.ts` `EstadoDeFonte` · `live-states.js` `LIVE_SOURCE_HEALTH` | interna | vocabulário existente | n/a | **sim** |

**Nada de captura viva está implementado.** `Arquitetura_Sincronizacao_Local_V1.md` diz em letra
própria: *"Proposta de arquitetura. **Nada foi implementado.**"* E `git grep` por `Get-PrintJob`,
`puppeteer` e `spooler` em `src/` e `tools/` volta **vazio** — guarda Q11.

**Uma integração não existe por haver documentação, variável de ambiente ou interface.** O
`browser-adapter.js` citado em `BLOCKERS.md` C5 **não está neste repositório**: ele ficou no port do
Conference Brain que nunca foi aceito.

---

## 2. Matriz de autoridade

Legenda: **A** autoritativa · **O** observacional · **D** derivada · **I** indisponível · **?** desconhecida.

### Pedido — `pedido_ciclo_observado@1`

| Campo | Relatório iFood (lote) | Gestor iFood (DOM) | Odhen impressão | Banco local |
|---|---|---|---|---|
| `pedido_id` | **A** (id completo) | **A** (código iFood) | O (id curto no papel) | ? |
| unidade | **A** | **A** | ? | ? |
| estado | **O** (5 estados por carimbo) | **A** (fonte viva de status) | I | ? |
| instante do estado | **D** — *reconstruído de duração* | ? (tela não datada) | O (instante da impressão) | ? |
| cancelamento | **O** | **A** (confirmado pelo César) | **I** — *"não deve ser lido pela comanda"* | ? |
| revisão | **I** | **I** | I | ? |
| origem | **A** | **A** | **A** | ? |
| chave idempotente | **I** | **I** | I | ? |

### Trabalho por praça — `trabalho_praca_observado@1`

| Campo | Relatório iFood | Gestor iFood | Odhen impressão | Banco local |
|---|---|---|---|---|
| `trabalho_id` | I | I | **I** — reimpressão indistinguível | ? |
| `pedido_id` | **A** | **A** | O | ? |
| `item_id` | O (nome, não id) | O (itens ao abrir) | O (linha do papel) | ? |
| **`praca_id`** | **I** | **I** | **D** — *inferida do item*, nunca declarada | ? |
| estado do trabalho | **I** | **I** | **I** — no máximo *comanda emitida* | ? |
| quantidade | O | O | O | ? |
| criação / início / conclusão | **I** | **I** | I / **I** / **I** | ? |
| cancelamento | O | **A** | **I** | ? |
| revisão / chave idempotente | I | I | I | ? |

### Capacidade — `capacidade_praca_observada@1`

Nenhuma fonte declara capacidade de praça. **Todos os campos: I.** Converter quantidade de pessoas,
equipamentos ou itens em capacidade produtiva exigiria política explícita e versionada — que não
existe.

---

## 3. Odhen — as dez respostas obrigatórias

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Reimpressão mantém o trabalho ou cria identidade nova? | **Indistinguível.** A auditoria registra que reimpressão acontece e que *"o capturador precisa de uma forma de"* diferenciar — hoje não tem. |
| 2 | Alteração de item é revisão ou nova impressão? | **Desconhecido.** Pergunta aberta na auditoria §351. |
| 3 | O cancelamento chega ao mesmo canal? | **Não.** *"Cancelamento não deve ser lido pela comanda"* — ele aparece no Gestor iFood. |
| 4 | Existe confirmação de impressão? | Só o job do spool. Confirma **emissão**, não recebimento na bancada. |
| 5 | Existe confirmação de início ou conclusão de preparo? | **Não.** Nenhuma. |
| 6 | O histórico sobrevive a reinício? | **Não.** O pedido *"some da tela ativa após imprimir"*. |
| 7 | É possível replay? | **Não** pelo canal de impressão. |
| 8 | Risco de perda entre emissão e observação? | **Sim** — a captura só existe *no instante da impressão*. |
| 9 | A praça vem explícita ou é inferida? | **Inferida.** *"Não existe comanda separada por praça"* — a comanda é única. |
| 10 | Consultável sem interferir na operação? | Leitura do spool sim; reconfigurar driver não. |

**A consequência que decide tudo:** o canal de impressão prova que uma **comanda foi emitida**. Ele
não prova início de produção, e chamar emissão de "início" seria inventar o interior da cozinha.

---

## 4. Gestor iFood — o que ele produz

**Produz:** status vivo do pedido (em preparo, pronto, em rota, atraso, **cancelamento**), itens ao
abrir o pedido, código do iFood. É a fonte real de acompanhamento pós-impressão, confirmada pelo
César.

**Não produz:** sequência interna, praça, estado de trabalho, revisão, chave idempotente, histórico
consultável, carimbo de origem por etapa.

**Veredito por evento:** consegue sustentar **parte** de `pedido_ciclo_observado`. **Não consegue
nada** de `trabalho_praca_observado` — e `adaptadores.ts:66` já registrava isso em código:
*"producao_opaca / conferido_lacrado NÃO entram (interior não emitido)"*.

**Status de pedido não é promovido a estado de trabalho por praça.** Nunca.

---

## 5. Banco local — não mapeável hoje

Tecnologia, localização, tabelas, chaves, timestamps, retenção, trilha de alteração e política de
acesso: **todos desconhecidos**. Nenhum driver, string de conexão ou schema existe no repositório.

E há um limite estrutural registrado antes de qualquer acesso: **se a tabela guardar só o estado
atual, ela não oferece linhagem** — seria preciso CDC, log de alterações ou mecanismo equivalente.

---

## 6. Probes — todos recusados, e a recusa é a resposta

Nenhum probe contra fonte externa foi executado. Não por esquecimento: **a segurança do probe não
pode ser provada deste ambiente**.

- Não há implementação de captura para exercitar.
- Não há credencial, e credencial não entra em código, fixture, log ou commit.
- **Este ambiente não é o computador da loja** — o spool, o banco e a sessão do Gestor vivem lá.

A regra da missão é explícita: *"Caso a segurança do probe não possa ser provada, marcar a fonte como
`nao_qualificada`, sem tentar."* Foi o que se fez. `CAMINHO_DE_LEITURA_SEGURO = false`.

---

## 7. Decisão por evento

| Evento | Produtor primário | Secundário | Evidência | Lacunas | Decisão |
|---|---|---|---|---|---|
| `pedido_ciclo_observado@1` | Gestor iFood (DOM) | Relatório iFood (lote) | fonte viva de status confirmada; 5 estados com carimbo no relatório | sem carimbo absoluto por etapa (reconstruído de **duração**) · sem histórico consultável · sem chave idempotente | **parcialmente qualificada** |
| `trabalho_praca_observado@1` | **nenhum** | **nenhum** | comanda é **única, sem separação por praça**; interior da produção não é emitido | praça **inferida, não declarada** · reimpressão indistinguível · cancelamento fora do canal · sem estado de trabalho | **rejeitada** |
| `capacidade_praca_observada@1` | **nenhum** | **nenhum** | nenhuma fonte declara capacidade | endpoint ausente · campo obrigatório ausente | **ainda inacessível** |
| `source_health_changed@1` | observador interno | — | `EstadoDeFonte` e `LIVE_SOURCE_HEALTH` já existem e são internos | nenhuma | **qualificada** |

**Um só evento está pronto para virar adapter — e é o único que não depende de fonte externa.**
Isso não é coincidência: é a medida exata de quanto o DeliveryOS ainda depende de uma fonte que
ninguém construiu.

**Nenhuma fonte foi escolhida por ser a mais fácil de acessar.** O relatório iFood é o único
implementado e ficou como **secundário**, porque reconstrói instante a partir de duração.

---

## 8. PB8 — resolvido por autoridade de evento

A pergunta de PB8 era *"o pedido some do Odhen: fica gravado?"*. A resposta muda de forma: **não
importa mais escolher um sistema.** O que importa é que cada evento tenha um produtor que
**conheça** o fato.

- **Pedido** tem caminho, com lacunas nomeadas.
- **Trabalho por praça não tem produtor possível hoje** — e a causa não é acesso, é **o dado não
  existir na fonte**. A comanda não separa praça. Nenhum acesso conserta isso; só uma mudança na
  operação ou no Odhen.
- **Capacidade** não existe em fonte nenhuma.

**PB8 deixa de ser bloqueio de acesso e vira bloqueio de EMISSÃO.** Registrado como
`PB8_RESOLVED_BY_EVENT_AUTHORITY`.

---

## 9. O que a próxima missão pode implementar

**Exatamente um adapter qualificado:** `ObservadorSaudeFonte` sobre o vocabulário interno — sem
credencial, sem rede, sem loja.

Para os outros três, a próxima decisão **não é de engenharia**:

1. **Trabalho por praça** — o Odhen consegue emitir comanda separada por praça, ou a bancada passa a
   registrar início/fim? Sem uma das duas, o evento não tem fonte.
2. **Pedido** — vale construir o leitor passivo do DOM do Gestor, aceitando que ele não tem
   histórico nem chave idempotente?
3. **Capacidade** — alguém declara capacidade por praça, ou o campo fica permanentemente ausente?

**R5-D continua bloqueado** — agora por `R5D_BLOCKED_LIVE_ADAPTER_IMPLEMENTATION`.
