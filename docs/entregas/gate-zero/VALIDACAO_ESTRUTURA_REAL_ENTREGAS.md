# VALIDAÇÃO DA ESTRUTURA REAL — ENTREGAS

| Campo | Valor |
|---|---|
| Documento | `VALIDACAO_ESTRUTURA_REAL_ENTREGAS.md` |
| Gate | **ZERO** — reconstrução operacional para o César |
| Data | 2026-07-20 |
| Worktree | `C:\Users\italo\Desktop\Claude\deliveryos-entregas-v1` · `feature/entregas-v1` |
| Status | **ESTRUTURA OPERACIONAL CONFIRMADA** (César · 2026-07-20) · Gate Zero **encerrado** · fundação autorizada |
| Anexos deste gate | `RESUMO_PARA_CONFIRMACAO_CESAR.md` · `MAPA_CAMPOS_COMANDAS.md` · `MAPA_PLANILHA_MOTOBOY.md` · `MATRIZ_MENSAGENS_EVENTOS.md` · `AUDITORIA_APP_ENTREGAS_ANTERIOR.md` · `DECISOES_PILOTO_RECOMENDADAS.md` |
| Pacote de revisão | `ENTREGAS_GATE_ZERO_PACOTE_REVISAO_CESAR_V2` — **sem** `_tmp_*`, PII, fotos, chats brutos |
| Enumerações / estados / eventos | **Somente** COR-ENTREGAS-V1 @ **1.0.3** (não inventar a partir de resumos) |

---

## Inventário de fontes (obrigatório)

### Encontradas e usadas

| # | Fonte | Onde | Status |
|---|---|---|---|
| 1 | Planilha **Cópia de Motoboy TATÁ 2026.xlsx** | `Downloads` + cópia `_tmp_motoboy.xlsx` no worktree | **OK** — 9 abas; 705 idas; 501 voltas; multi-stop 526/155/23/1; datas 23/03/2026–12/07/2026 |
| 2 | Comandas/etiquetas fotografadas | Pacote `WhatsApp Unknown 2026-07-13…zip` (várias fotos reais de sacola); R1 (20 fotos); Parser Tecnisa | **OK** — layouts L1 Relatório de Entrega (ForSale/Odhen), L2 compacta clip, L3 Link Delivery App; iFood via Parser+R1 |
| 3 | Grupo operacional motoboys | `Downloads/Conversa do WhatsApp com TATÁ Entregas.zip` (~70k linhas export); R1 52.626 msgs | **OK** — padrões de saída, volta, iFood, troco, interfone, reenvio |
| 4 | Conversas bilaterais | Zips WA em Downloads (clientes); R1 5.104 msgs | **OK** como inventário R1; export bruto parcial (vários zips de clientes) |
| 5 | App/protótipo anterior | `prototipos/entregas-v01/`, design docs, WF Desktop, auditoria retomada | **OK** — auditado; **não** autoridade |
| 6 | R1 + COR | Desktop `ENTREGAS_R1_*`, `Entregas_R1_Analitica_*`, COR 1.0.3 + anexos A–D no worktree `docs/entregas/cor-v1-0-3/` | **OK** |

### Parcial / com ressalva

| Fonte | Ressalva |
|---|---|
| Fotos iFood “Relatório” com campo IFOOD explícito | Estrutura no Parser Tecnisa + R1; amostra visual L1 aberta neste gate foi sobretudo **ForSale** (próprio). Se César tiver mais fotos só-iFood, reenviar ajuda a fechar L4. |
| Mídias internas R1 (18 img + 1 áudio) | Citadas no consolidado; não reprocessadas pixel a pixel neste gate (já mineradas na R1). |
| Export completo bilaterais 2021–2026 | R1 cobre contagens; zips locais são amostra. **Não** inventar casos. |

### Não encontradas / não necessárias para fechar o gate de *reconstrução*

| Item | Nota |
|---|---|
| Export bruto plataforma iFood identificável | Limitação R1 mantida — handoff descrito sem reconciliação completa externa |
| Banco/schema do protótipo em produção | Protótipo é front de cenários; sem backend soberano |
| GPS histórico da operação | Não existe na planilha; COR só define regras futuras |

**Veredito de fontes:** material **suficiente** para reconstruir a operação atual e apresentar proposta. **Não** seguir para código sem a frase de confirmação do César.

---

## 1. Como a operação funciona hoje

Dois fluxos distintos:

### A) Pedido próprio (motoboy da casa)

```text
Pedido pronto → impressão da comanda → separação/volumes na loja
  → agrupamento manual de até ~5 endereços
  → motoboy sai (muitas vezes anuncia no grupo)
  → formulário IDA (nome + endereços/clientes/bairros)
  → rota + exceções no WhatsApp
  → entrega (confirmação frágil / implícita)
  → formulário VOLTA (“tudo bem?” + obs)
  → disponibilidade inferida na loja
```

### B) iFood (courier externo)

```text
Pedido pronto → sacola aguarda
  → courier da plataforma chega
  → loja identifica pedido/código
  → localiza sacola → confere volumes
  → repassa → responsabilidade física da loja encerra
```

**Não** é viagem do motoboy da casa. Planilha **não** registra handoff.

### C) Recuperação

Relato (grupo/bilateral) → triagem → ação → às vezes confirmação. **Sem** occurrence_id. Ausência de “ok final” ≠ não resolvido (R1).

---

## 2. Como a comanda impressa foi interpretada

Ver `MAPA_CAMPOS_COMANDAS.md`.

- **L1 Relatório de Entrega:** Operador, Emissão, Pedido interno (10 dígitos), Consumidor, ORIGEM (ForSale/iFood), endereço, itens, taxa, total, barcode; às vezes Entregador-zona.  
- **L2 Compacta:** Pedido curto, data, nome, telefone, endereço, taxa, total, forma pagamento (ex.: online cartão).  
- **L3 Link Delivery:** Estabelecimento, pedido, itens, totais, pagamento (Pix online etc.), “App” manuscrito.  
- Artefato = evidência de impressão/sacola; **não** prova entrega nem volta.  
- Correção a caneta pode existir só no papel (César já confirmou em contexto Tecnisa).  
- Planilha **não** carrega order_id da comanda → correlação automática **não** feita.

---

## 3. Como a planilha foi interpretada

Ver `MAPA_PLANILHA_MOTOBOY.md`.

| Aba | Leitura |
|---|---|
| RESPOSTAS_IDA | Entrada de saída multi-stop |
| RESPOSTAS_VOLTA | Entrada de retorno genérico |
| 00/01 | Painéis (intervalos fixos frágeis) |
| 02 | Clientes PII |
| 03 | “Viagem” reconstruída sem trip_id |
| 07/08 | KM/meta e apelidos de bairro |
| 09 | Setup formulários |

Problema central: **sem trip_id**; ida/volta amarradas por nome digitado e ordem → 390 unívocas / 47 ambíguas / 268 idas sem volta / 64 voltas sem ida (R1).

---

## 4. Como ida e volta funcionam

| | Ida | Volta |
|---|---|---|
| Quem | Motoboy no form | Motoboy no form |
| O quê | Nome + 1–5 × (endereço, cliente, bairro) | Nome + ok? + obs |
| Chave | Nenhuma | Nenhuma (não aponta a ida) |
| Quando | Perto da saída (ideal) | Perto do retorno |
| Falha comum | Esquecer / preencher tarde | Esquecer → disponibilidade falsa |
| Chat | “Saindo”, “saindo com três” | “Já estou voltando” |

---

## 5. Como uma viagem com vários pedidos funciona

1. Loja agrupa sacolas na bancada.  
2. Motoboy leva 2–4 pedidos com frequência (155×2, 23×3 na base).  
3. Form IDA: flags “Tem 2ª entrega?” … até 5.  
4. Ordem das paradas = ordem digitada.  
5. Alteração depois da saída: **só WhatsApp** (“leve mais um”, endereço novo, “esse não saiu”).  
6. Volta **não** discrimina qual pedido deu problema — só obs livre.

---

## 6. Como o motoboy fica disponível / indisponível

**Hoje (observado):**

- “Disponível” ≈ na loja e sem ida aberta sem volta.  
- Não há estado formal `apoio_expedicao` na planilha (existe na prática quando ajuda handoff).  
- Pausa/indisponível: informal (chat).  
- Esquecer volta → sistema (humano) pode achar que ainda está fora.

**Proposta alinhada COR (sujeita a confirmação):** após retorno normal → `disponivel`, salvo pausa / indisponivel / apoio_expedicao / ocorrência em tratamento explícitos; sem sinal → `sem_atualizacao`.

---

## 7. Como o grupo é usado

Canal de **coordenação em tempo real**:

- Colar endereço e número de pedido.  
- Perguntar quem saiu / quem leva.  
- Anunciar “saindo” / “voltando”.  
- Problemas de portaria, interfone, troco.  
- iFood: “entregador chegando”, reenvio.  
- Fotos de comanda/sacola.  
- Às vezes suprimentos (fora do core Entregas).

**Não** é log transacional. Ver `MATRIZ_MENSAGENS_EVENTOS.md`.

---

## 8. Como alterações de viagem acontecem

| Alteração | Como é hoje | Como deve ser no app (proposta) |
|---|---|---|
| Incluir pedido | Chat + (às vezes) não atualiza form | Evento `delivery_added` no trip_id |
| Remover pedido | Chat / “não saiu” | Evento `removed_*` / active=false |
| Reordenar | Implícito na rota | Evento reorder |
| Trocar motoboy | Redistribuição verbal | Nova trip ou reassignment com trilha |

Planilha **não** versiona alterações.

---

## 9. Como as ocorrências acontecem

1. Surgem no grupo ou bilateral (cliente não atende, item, atraso, devolução).  
2. Decisão: loja / César / líder no chat.  
3. Execução: motoboy vai, retira, reentrega.  
4. Fechamento: muitas vezes social (“valeu”) sem status.  

**Proposta:** `occurrence_id` com relato, ação, evidência, responsável funcional, status; fechamento por líder de Delivery ou gerente (COR).

---

## 10. Como o iFood é separado do pedido próprio

| | Próprio | iFood |
|---|---|---|
| Entrega ao cliente | Motoboy da casa | Courier plataforma |
| Registro planilha | Ida/volta | **Ausente** |
| Comanda | ForSale / App / Link | ORIGEM iFood + código curto |
| Fim responsabilidade loja | Após entrega/volta | Após handoff conferido |
| Trip | Sim (proposta) | **Não** |

---

## 11. O que o aplicativo anterior acertou

- Multi-pedido por viagem.  
- Eixo ida/rota/volta.  
- Ideia de confirmação humana.  
- Exceções na UI (em vez de só chat).  
- Sem ranking/punição.  
- Docs: marketplace ≠ viagem própria; correlação de impressões.

---

## 12. O que o aplicativo anterior errou

- Autoridade Fundação V0.1 em vez de COR + fontes.  
- Handoff confuso / “handoff de volta”.  
- Fechamento bloqueado por volumes/pendências.  
- Sem trip_id e eventos imutáveis (não cura a dor da planilha).  
- Sem active/removed.  
- Regras de volume/tentativas inventadas.  
- Sem A01–A39 / offline robusto.  

Detalhe: `AUDITORIA_APP_ENTREGAS_ANTERIOR.md`.

---

## 13. Estrutura proposta do novo sistema

**Três pilares (alinhamento):**

1. **Fontes reais** → o que existe hoje (este documento).  
2. **COR-ENTREGAS-V1 @ 1.0.3** → **única** fonte de enumerações, estados, eventos, atores, pré-condições e falhas seguras (normativo; **ainda sem auth de código**).  
3. **Confirmação do César** → se a reconstrução e o adendo de piloto batem com a operação.

**Objetos mínimos (proposta, não schema final):**

| Objeto | Papel |
|---|---|
| **Trip** | Viagem própria com `trip_id` **antes** da saída; rider = **motoboy da casa** |
| **Delivery** | Pedido próprio na viagem (stops); `active` controla G1–G5 |
| **Handoff** | Expedição iFood / plataforma (**fora** da Trip); courier **externo** |
| **Occurrence** | Exceção/recuperação com ciclo de fechamento |
| **Actor** | Papéis funcionais (motoboy da casa, expedição, líder…) |
| **PrintedArtifact** | Comanda/etiqueta (correlação, anti-dup) |
| **Event** | Log imutável (occurred_at / recorded_at / synced_at) |

### Separação obrigatória de papéis (motoboy × courier externo)

| Papel operacional | Campo canônico COR 1.0.3 | Objeto | Usuário do módulo Entregas? | Nunca usar como |
|---|---|---|---|---|
| Motoboy da casa (rider) | `courier_actor_id` | **Trip** | **Sim** (quando houver app/piloto) | Courier iFood / handoff |
| Courier externo iFood | `external_courier_ref` (mínimo) | **Somente Handoff** | **NÃO** | Rider da Trip; conta; app; Trip; GPS |

> No COR congelado o campo da Trip chama-se `courier_actor_id`, mas a **semântica Gate Zero + COR** é: **somente motoboy da casa**.  
> Leitura humana: “rider da casa”. **Proibido** reutilizar o mesmo conceito técnico para courier externo.

### Esclarecimento — entregador iFood **não** é usuário do Entregas

O entregador do iFood **não** será usuário do módulo Entregas. **Não criar** para ele:

| Proibido | |
|---|---|
| Cadastro operacional · conta · aplicativo mobile | Estado de disponibilidade |
| Trip · GPS · rota · ranking · acompanhamento individual | Confirmação de entrega ao cliente |

A referência ao courier externo existe **exclusivamente** no agregado **Handoff**, para registrar o **repasse físico na loja**.

**Quem opera a tela:** funcionário **interno autorizado**, confirmando:

1. pedido correto;  
2. entregador verificado por método operacional disponível;  
3. volumes esperados;  
4. volumes entregues;  
5. responsável interno pela conferência;  
6. horário do repasse;  
7. eventual exceção.

**Dado mínimo do externo** (sem exigir nome completo, documento ou PII):

- `courier_verified`  
- `courier_verification_method`  
- referência mascarada ou código da plataforma, **quando disponível**

**Após `handoff_confirmed`:** não criar Trip; não GPS; não controlar rota; não exigir confirmação no app do motoboy da casa; **encerrar responsabilidade física da loja**; status posterior só via **futura integração oficial iFood**.

**Nomenclatura de interface (quando houver UI):** não usar “Entregadores iFood”. Usar **EXPEDIÇÃO IFOOD** ou **HANDOFF IFOOD**. Foco = **pedido e conferência**, não controle do entregador externo.

**Fora de escopo até auth explícita:** código, migrations, GPS produção, integrações, telas.

---

## 14. Campos propostos (mínimo conceitual)

### Trip (COR)
`trip_id`, `unit_id`, **`courier_actor_id`** (= **motoboy da casa apenas**), `created_by`, `state`, `contract_version`, timestamps de formação/saída/retorno, deliveries via eventos.

### Delivery (COR)
`delivery_id`, `order_ref`(s), `channel`, endereço, sequência, `active`, estados de entrega, confirmação.

### Handoff / Expedição iFood (COR + verificação pelo **interno**)

Campos mínimos COR 1.0.3 (agregado Handoff):  
`handoff_id`, `external_order_ref`, `external_courier_ref` (mínimo), `arrived_at`, `conference_actor`, `volumes`, `integrity_ok`, `handoff_at`, `handoff_actor`, `confirmed`, `exception`, `unit_id`.

O courier **não** é ator de sistema do Entregas. Quem preenche/confirma é o **funcionário interno autorizado**.

| Conceito | Função | PII |
|---|---|---|
| Pedido identificado | `external_order_ref` + conferência interna | order ref |
| `courier_verified` | Interno confirma verificação | sem nome/doc obrigatório |
| `courier_verification_method` | Método operacional usado | ex.: código app plataforma, visual |
| Ref. mascarada / código plataforma | `external_courier_ref` quando disponível | **mínimo**; não exigir nome completo/documento |
| Volumes esperados | Parte de `volumes` | — |
| Volumes entregues/conferidos | `volumes` + `integrity_ok` | — |
| Responsável interno | `conference_actor` | actor **interno** |
| Ator do repasse físico | `handoff_actor` (interno) | actor **interno** |
| Horário do repasse | `handoff_at` / confirmed | — |
| `exception` | Divergência | — |

**Regra:** sem verificação do courier **pelo interno** → Handoff **pendente** ou **exceção**.  
**Após confirmado:** responsabilidade física da loja **encerra**; sem Trip/GPS/rota do courier no Entregas.  
**Proibido:** gerar `trip_id` a partir do Handoff (COR); cadastro/app do courier iFood.

### Occurrence
`occurrence_id`, tipo, relato, evidência, ação, responsável, status, confirmação conhecida/desconhecida; `blocks_availability` (piloto — ver adendo).

### Comanda (artefato)
layout, printed_at, order_ref impresso, reprint_flag, payload resumido (sem PII em logs públicos).

**Não** copiar todos os campos da comanda para o modelo de viagem sem necessidade operacional.  
Campo impresso “Entregador” **não** preenche `Trip.courier_actor_id`.

---

## 15. Estados, eventos e transições — fonte exclusiva COR 1.0.3

**Não** criar novas enumerações a partir deste resumo nem de telas/protótipos.

A implementação futura deve usar **exatamente**:

```text
COR-ENTREGAS-V1 @ 1.0.3
```

como fonte de: estados, eventos, atores, pré-condições, falhas seguras, matriz, políticas de piloto e cenários A01–A39.

### Regras COR preservadas obrigatoriamente

| # | Regra |
|---|---|
| 1 | `trip_return_started` **não** exige `require_all_active_stops_resolved` |
| 2 | **G3** pode criar `entrega_sem_confirmacao` ao entrar em `retornando` |
| 3 | `require_all_active_stops_resolved` pertence ao **retorno automático / fechamento** (não ao início do retorno) |
| 4 | `active=false` exclui Delivery de **G1, G2, G3, G4 e G5** |
| 5 | Retorno automático **não** confirma entrega |
| 6 | `entrega_sem_confirmacao` **não** bloqueia viagem |

Síntese orientativa (detalhe normativo só no COR/anexos): viagem `preparando_saida` / `em_rota` / `retornando` / `encerrada` / `sem_atualizacao`; entrega e motoboy conforme matriz COR; evento `retorno_detectado` não é estado persistente.

**Também:** GPS nunca sozinho → `entregue_confirmado`; sem ranking.

---

## 16. Fluxos propostos

### Próprio
```text
preparar → criar trip_id + courier_actor_id (motoboy casa) → deliveries → preparando_saida
  → saída → em_rota → (chegada_detectada?) → confirmação humana ou entrega_sem_confirmacao
  → trip_return_started (sem exigir todos stops resolvidos) → retornando
  → (G3 pode marcar entrega_sem_confirmacao em active=true sem desfecho)
  → retorno_detectado|manual autorizado (require_all_active_stops_resolved no fechamento automático)
  → encerrada → disponivel (salvo pausa/indisponivel/apoio_expedicao/ocorrência com blocks_availability)
```

### iFood — EXPEDIÇÃO / HANDOFF (fora de Trip; courier **não** é usuário)
```text
pronto → courier externo chega à loja (sem conta no Entregas)
  → funcionário interno: pedido correto
  → courier_verified + courier_verification_method (+ ref. mascarada/código se houver)
  → volumes esperados e volumes entregues
  → conference_actor + handoff_actor (internos) + horário
  → handoff_confirmed → responsabilidade física da loja ENCERRA
  → (status posterior só integração oficial iFood, fora deste módulo)
```
Sem verificação pelo interno → **pendente/exceção**.  
Sem volumes conferidos → **não conclui**.  
**Sem** Trip, GPS, rota, app do courier, confirmação no app do motoboy da casa.  
UI futura: **EXPEDIÇÃO IFOOD** / **HANDOFF IFOOD** (não “Entregadores iFood”).

### Ocorrência
```text
aberto → em tratamento → ação → resolvido | fechado_sem_confirmacao | nao_resolvido | info_insuficiente
```
Fecha: líder Delivery ou gerente.  
Bloqueio de disponibilidade só se `blocks_availability=true` (proposta piloto).

### Mensagem WhatsApp
Sugere evento (classe B/C) → **nunca** commit de estado sozinha.

### Adendo de piloto
Ver `DECISOES_PILOTO_RECOMENDADAS.md` (paradas configuráveis, forms contingência, papéis, histórico RO, etc.).

---

## 17. Dúvidas / confirmações que ainda dependem do César

**Núcleo da reconstrução:** tratado como correto no processo Gate Zero; falta a frase formal.

**Adendo de piloto** (`DECISOES_PILOTO_RECOMENDADAS.md`): confirmar, ajustar ou rejeitar as 19 decisões (paradas N + teto piloto 5; forms contingência; app principal; WA sem auto-commit; volumes; papéis; GPS calibrável; histórico RO; suprimentos fora; etc.).

Ainda explicitamente:

1. Layouts de comanda cobrem 100% do impresso? Layout desconhecido → conferência manual (proposta 18).  
2. Campo “Entregador” impresso: só referência de zona; **não** atribui motoboy (proposta 17).  
3. Aceita separação `Trip.courier_actor_id` (casa) × `Handoff.external_courier_ref` (externo)?  
4. Aceita handoff **só** com courier verificado + volumes?  
5. Aceita as 6 regras COR de retorno/G3/active listadas na §15?

---

## Proibição de avanço (Gate Zero)

Até o César responder com confirmação explícita:

- **Não** criar telas, banco definitivo, domínio definitivo, migrations.  
- **Não** implementar console, mobile, GPS, automações.  
- **Não** inventar campos “de mercado”.  
- **Não** copiar o protótipo V0.3 como verdade.  
- **Não** deduzir só pelo contrato sem as fontes.

O contrato define **segurança e consistência**.  
As fontes reais definem **como a operação funciona**.  
O César valida se a **reconstrução está correta**.

---

## Pedido direto de confirmação

> **César, esta reconstrução representa corretamente como o Entregas funciona hoje?**  
> **O que precisa ser corrigido antes de eu implementar?**

Por favor confirme explicitamente (quando estiver de acordo):

```text
ESTRUTURA OPERACIONAL CONFIRMADA
```

ou envie uma versão corrigida para nova validação.

Confirmar em especial:

- interpretação das comandas  
- estrutura da viagem (multi-parada, trip_id)  
- dados necessários  
- fluxo de ida e de volta  
- disponibilidade do motoboy  
- uso do grupo  
- alterações na viagem  
- ocorrências  
- fluxo iFood  
- estrutura proposta do aplicativo (seções 13–16)

---

*VALIDACAO_ESTRUTURA_REAL_ENTREGAS · Gate Zero · PARAR aqui · 2026-07-20*
