# Proposta B — Modelo de Dados

> Banco e arquitetura de conhecimento do cérebro operacional. Proposta independente (Claude).
> Nenhum código de produto implementado.

## 1. Princípio: cinco camadas que nunca se misturam

O erro clássico é gravar tudo numa tabela de "pedidos" e depois não saber o que foi
observado, o que foi deduzido e o que foi decidido. A Proposta B separa por **natureza
epistêmica**, não por assunto:

| Camada | Natureza | Regra |
|---|---|---|
| **L0 · Bruto** | O que a fonte entregou, como entregou | Imutável. Nunca corrigido no lugar. |
| **L1 · Normalizado** | Mesmo fato, vocabulário do DeliveryOS | Reconstruível a partir de L0. |
| **L2 · Derivado** | Cálculo sobre L1 (simultaneidade, ritmo, backlog) | Reconstruível; versionado pela regra que o gerou. |
| **L3 · Hipótese** | Interpretação não confirmada | **Nunca** promovida a fato sem humano. |
| **L4 · Decisão** | O que um humano decidiu/aprovou | Append-only. É o que dá autoridade a L3. |

Consequência prática: **apagar L1–L3 e reconstruir a partir de L0 + L4 deve devolver o mesmo
estado.** Se não devolver, há conhecimento preso em lugar errado.

## 2. Entidades

### 2.1 Fonte e ingestão (a base da confiança)

**`source`** — de onde veio
`source_id · tipo (relatorio_ifood, coletor_sessao, whatsapp, treino, midia, humano) · autoridade (alta/media/baixa) · periodo_coberto · privacidade (publico/interno/restrito_pii) · notas`

**`ingestion_run`** — cada vez que se leu algo
`run_id · source_id · coletor_versao · inicio · fim · registros_lidos · registros_aceitos · registros_quarentena · resultado · erro`
*Finalidade:* sem isto não há como responder "por que o número mudou?".

**`evidence`** — o átomo de rastreabilidade
`evidence_id · run_id · source_id · ponteiro (arquivo/linha/URL/unit_id) · hash · trecho_anonimizado · privacidade`
*Regra:* **toda** afirmação em L2/L3 aponta para ≥1 `evidence_id`. Afirmação sem evidência não entra.

### 2.2 Operação observada

**`order`** (L1) — `order_id · recebido_em · data_local · hora_local · periodo_operacional · status · cancelamento · preparo_min · pronto_btn_min · espera_loja_min · atraso_min · canal · qualidade_cobertura · composicao_disponivel (bool)`
*Origem:* relatório iFood / coletor. **Hoje `composicao_disponivel = false` em 100% dos 70.071 pedidos.**

**`order_item`** (L1) — **não populável hoje**
`order_id · item_id · quantidade · observacao · complementos[]`
*Registrar a tabela vazia é intencional:* ela documenta a lacuna em vez de escondê-la.

**`order_event`** (L1) — `order_id · tipo (recebido/pronto/saiu/entregue/cancelado) · em · fonte · confianca`
*Hoje:* só `recebido` é absoluto; `pronto` existe como **duração**, não carimbo; `saiu`/`entregue` **não observados**.

**`operational_window`** (L2) — a unidade de leitura
`janela_id · data_local · inicio · duracao_min · recebidos · ativos_simultaneos · concluidos · ritmo_entrada · ritmo_saida · backlog · atraso_medio · fontes_ausentes[] · confianca`

### 2.3 Produto e conhecimento

**`menu_item`** — `item_id · nome · aliases[] · nomes_antigos[] · categoria · praca_principal · pracas_auxiliares[]`

**`item_preparation`** — `item_id · etapa · praca · sequencia · lote_ou_individual · tempo_estimado · equipamento · dependencias[] · confianca · evidence_ids[]`

**`item_assembly`** — `item_id · componentes[] · acompanhamentos[] · molhos[] · embalagem · volume_estimado · separacao_termica · confianca · evidence_ids[]`

**`item_conference_risk`** — o que importa para a etapa final
`item_id · verificacoes[] · itens_externos[] · confundivel_com[] · risco_esquecimento · risco_troca · risco_quantidade · risco_vazamento · sensibilidade_tempo · impacto_erro · confianca · evidence_ids[]`

**`item_photo`** — `item_id · origem (local/oficial/propria) · url_pagina · referencia · aprovada_por_humano (bool) · aprovada_em · versao · expira_em`
*Regra:* `aprovada_por_humano = false` ⇒ **não** aparece no produto.

### 2.4 Contexto do turno

**`shift`** — `shift_id · data · dia_semana · abertura · fechamento`
**`shift_staffing`** — `shift_id · setor · pessoas · posicoes_cobertas · fonte (declarado/observado) · confianca`
**`readiness_check`** — `shift_id · dominio · item · estado · nivel (bloqueador/critico/atencao/informativo) · efeito_capacidade · efeito_confianca · registrado_por · em`
**`occurrence`** — `ocorrencia_id · shift_id · tipo · descricao_anonimizada · inicio · fim · impacto · evidence_ids[]`

### 2.5 Memória humana

**`human_evidence`** — `unit_id · chat_ref · data · hora · categoria · tipo (fato_relatado/decisao/hipotese/evento/resultado/padrao) · resumo_anonimizado · tem_decisao · relacionado_a[] · confianca · privacidade`
*Regra de privacidade:* texto bruto com PII vive **só** em L0 restrito; L1+ carrega apenas resumo anonimizado.

**`decision`** (L4) — `decisao_id · data · tema · o_que_mudou · motivo · quem_aprovou · evidence_ids[] · status (vigente/revogada) · revogada_por`
*Isto é o que falta na maioria dos sistemas:* regras nascem e morrem sem registro, e ninguém sabe por que a operação faz o que faz.

### 2.6 Modelo e versão

**`model_version`** — `versao · escopo (conferencia/prontidao/…) · regras_hash · vigente_de · vigente_ate · aprovada_por`
**`reading`** (L2/L3) — `leitura_id · janela_id · escopo · estado · fatores[] · fontes_ausentes[] · confianca · model_version · evidence_ids[]`
*Regra:* toda leitura carrega a versão do modelo que a produziu. Sem isso, comparar histórico é comparar coisas diferentes.

## 3. Campos transversais obrigatórios

Toda entidade de L1+ carrega:
`confianca (alta/media/baixa)` · `fontes_ausentes[]` · `evidence_ids[]` · `criado_em` · `model_version` (quando derivada)

**`fontes_ausentes[]` é o campo mais importante do modelo.** É ele que permite ao produto
dizer "leitura parcial" com precisão em vez de fingir completude.

## 4. Chaves, retenção e privacidade

| Entidade | Chave | Retenção | Privacidade |
|---|---|---|---|
| `order` | `order_id` (uuid da plataforma) | longa | sem PII de cliente |
| `order_event` | `order_id + tipo + em` | longa | — |
| `human_evidence` | `unit_id` | longa (resumo) / curta (bruto) | **bruto restrito; nunca em doc geral** |
| `evidence` | `evidence_id` | acompanha o dado | herda da fonte |
| `readiness_check` | `shift_id + dominio + item` | média | sem avaliação individual |
| `item_photo` | `item_id + versao` | até expirar | direitos de imagem |
| `decision` | `decisao_id` | **permanente** | — |

**Idempotência:** `order_id` da plataforma é a chave natural; reingestão do mesmo pedido
atualiza, não duplica. `ingestion_run` registra o que foi visto de novo.

## 5. Qualidade e quarentena

Registro que não passa na validação **não é descartado nem corrigido em silêncio** — vai para
quarentena com motivo, e a leitura declara que existe material em quarentena. Motivos previstos:
`sem_id · data_invalida · duracao_implausivel · duplicata_conflitante · layout_desconhecido · fora_do_periodo`.

Precedente que valida essa escolha: a Capacidade Viva já trata pedido implausível como
**qualidade da fonte**, não como crítico operacional. O modelo de dados deve carregar a mesma
disciplina.

## 6. O que este modelo recusa

- Recusa **tabela única de verdade** misturando observado e deduzido.
- Recusa **campo derivado sem versão de modelo** (impossível auditar).
- Recusa **afirmação sem evidência** em L2+.
- Recusa **PII fora de L0 restrito**.
- Recusa **apagar hipótese refutada** — hipótese morta vira histórico, não sumiço.
