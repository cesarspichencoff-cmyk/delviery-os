# Modelo de Análise Temporal e Alertas — T0B-A

> **Camada documental apenas.** Não implementa alertas. Não afirma padrões temporais reais.  
> Branch `research/tata-evolucao-grok` · sobre `df1d9d8` (T0B-A cultural) · fuso de referência: **America/Sao_Paulo**.  
> Regra de ouro: **nunca** classificar dia/hora como “pior” só por contagem absoluta. Sem exposição → análise **inconclusiva**.

---

## 0. Legenda de rigor

| Código | Significado |
|---|---|
| **FD** | Fato documental (fonte Git descreve o campo) |
| **HIP** | Hipótese analítica (método proposto) |
| **DES** | Desconhecido / campo ausente nesta camada |
| **BLOQ** | Bloqueado sem fonte privada (T0B-B) |

---

## 1. Fontes com informação de dia e horário

| source_id / família | O que tem de temporal | Granularidade | Confiança do timestamp | Status no ambiente T0B-A |
|---|---|---|---|---|
| **SRC-EXT-DADOS-CLAUDE-ZIP** / relatórios pedidos iFood (xlsx) | Carimbos de ciclo (recebido / pronto / saiu / etc.) por pedido | minuto (pedido) | **Alta** se export oficial intacto | **BLOQ** — bruto não no worktree |
| **SRC-EXT-IFOOD-RAW-LOCAL** / logística | Timing completo (botão pronto, espera na loja, alocação…) | minuto | **Alta** (doc inventário: 246/246 campos em janela 01/07) | **BLOQ** |
| Lote HTML `relatorio_pedidos_*` | `HH:MM` por pedido (~recebido) | minuto; **sem** pronto/saiu | **Média** (um horário só; janela 24h pode cruzar meia-noite) | **BLOQ** bruto; **FD** no inventário |
| Dashboard HTML iFood | Turno (almoço/tarde/jantar/ceia); dia da semana | agregado mês×turno / dia-semana | **Média** (agregado, sem evento unitário) | **BLOQ** bruto; **FD** inventário |
| **SRC-EXT-BLOCO3-PDF** | Pedidos por dia-da-semana×turno; cancel/avaliações mensais | mês / dia-semana×turno | **Média** (agregado mensal) | **BLOQ** |
| **SRC-EXT-WHATSAPP-RAW** | Timestamp de mensagem `[data, hora]` no export iOS | minuto (mensagem) | **Alta** no texto do export; **baixa** como proxy de hora do **erro físico** | **BLOQ** |
| **SRC-DOC-WHATSAPP-STUDY** | Datas de citações-âncora (ex. 25/09/2023 kit) | dia | **Alta** para o trecho citado | **Disponível** (só âncoras, não série) |
| **SRC-DOC-INVENTARIO-DADOS** / auditorias / relatórios | Descrevem janelas (ex. 20–30/06, 01/07) e métricas de replay | janela de estudo | N/A (meta-documento) | **Disponível** |
| **SRC-DOC-SINAIS** / contratos / motor docs | Fala em min, debounce, baseline de praça | regras de sistema | N/A (especificação, não ocorrência) | **Disponível** |
| **SRC-SEED-CARDAPIO** | Sem timestamp de erro | — | — | Sem tempo de ocorrência |
| **SRC-DOC-EMBALAGENS** | Sem timestamp | — | — | Sem tempo |
| **SRC-DOC-CORE** / Visão Mestra | Sem timestamp operacional | — | — | Sem tempo |
| **SRC-CODE-MOTOR** | Constantes FLOORS (DEBOUNCE, STALE…) | config | N/A | **Não** é comportamento de equipe |

---

## 2. Fontes sem timestamp (ou sem timestamp de ocorrência operacional)

| Fonte | Limitação temporal |
|---|---|
| Seed cardápio / fonte txt | Cadastro set-once; sem “quando errou” |
| Embalagens V0 | Regras atemporais |
| Constituição / Leis / Manifesto | Normativos |
| Política de dados / privacidade Evolução | Governança |
| Taxonomia / planos T0A | Método |
| Casos CASE-A* (T0B-A) | Esqueletos didáticos **sem** `occurred_at` real |
| Voz/rádio do chão | **DES** — não está em texto |
| Imagens de erro no WhatsApp | Placeholder; sem hora do ato físico recuperável do export texto |

---

## 3. Qualidade dos horários

| Tipo de timestamp | Qualidade | Uso permitido | Uso proibido |
|---|---|---|---|
| Carimbos oficiais iFood (recebido/pronto/saiu) | Alta | Deltas de produção/expedição; volume por hora | Inferir “culpa” de pessoa |
| HH:MM único do HTML de pedidos | Média | Aprox. de chegada; juntar com logística | Ciclo completo sozinho |
| Turno agregado (dashboard/PDF) | Média-baixa | Comparar faixas grossas (jantar vs almoço) com **exposição** | Declarar “hora pior” |
| Timestamp de mensagem WhatsApp | Alta como chat; **baixa** como hora do erro de sacola | Quando o texto **é** o evento (escalonamento, pausa anunciada) | Assumir que “faltou kit” ocorreu no minuto da msg |
| Data-âncora no estudo | Alta pontual | Marcar mudanças de regra (kit 25/09/2023) | Série estatística |
| Ausência de timestamp | — | Contagem absoluta + **inconclusivo** | Inventar horário |

**Regra:** se não houver timestamp confiável → `occurred_at = null`; análise temporal daquele evento **não entra** em ranking de janela.

---

## 4. Política de timezone

| Regra | Valor |
|---|---|
| Fuso padrão de análise | **America/Sao_Paulo** (IANA explícito) |
| UTC silencioso | **Proibido** |
| Derivação de `local_date` / `weekday` / `local_hour` | Sempre a partir de instante + IANA |
| Fonte sem offset | Tratar como **ambíguo** até política de ingestão (HIP: assumir America/Sao_Paulo **só** se export da loja for local e documentado) |
| Alinhamento com DeliveryOS live | `storeTimeZone` / `localDayKey` (núcleo live F2) — **HIP** reutilizar a mesma IANA |

---

## 5. Proposta de dia operacional

| Conceito | Definição preliminar (HIP) | Validação |
|---|---|---|
| **data civil** | Calendário em America/Sao_Paulo | Automática |
| **dia da semana** | Derivado da data civil local | Automática |
| **hora local** | 0–23 local | Automática |
| **turno** | HIP inicial: almoço / tarde / jantar / ceia (como dashboards iFood) — cortes de hora **a validar** | César + operação |
| **dia operacional** | HIP: janela que começa no horário de abertura efetiva do delivery e pode **atravessar meia-noite civil** (ex.: pedidos 00:30 ainda do “sábado operacional”) | **César decide** política definitiva |
| **operational_day_key** | Chave estável do dia operacional (não necessariamente = data civil) | Depende da política acima |

**Eventos após meia-noite:** se `operational_day_key` ≠ `local_date`, ambos os campos ficam preenchidos; comparações de “sábado” usam a chave operacional quando a política estiver aprovada.

**Até validação do César:** análises publicáveis usam **data civil America/Sao_Paulo** e marcam virada noturna como **limitação**.

---

## 6. Modelo mínimo do evento analítico (conceitual)

Nenhum campo é inventado na ingestão. Ausente = `null` + `context_missing`.

```text
occurrence_id          # id estável da ocorrência analítica
source_id              # família de fonte (inventário)
occurred_at            # instante ISO com offset ou null
local_date             # YYYY-MM-DD America/Sao_Paulo ou null
weekday                # 0-6 ou nome local; null se sem data
local_hour             # 0-23 local; null se sem hora
time_window            # ex. 30m/60m/120m bucket; null se sem hora
operational_shift      # turno; null se não classificado
operational_day_key    # chave do dia operacional; null se política não aplicada
event_category         # taxonomia primária
event_subcategory      # taxonomia secundária
operational_area       # praça / caixa / conferência / saída / ...
channel                # ifood | whatsapp | papel | sistema | ...
severity              # baixa | media | alta | critica | null
affected_orders        # inteiro ≥0 ou null
affected_items         # inteiro ≥0 ou null
order_volume_window    # exposição: pedidos na mesma janela; null se desconhecida
item_volume_window     # exposição: itens na janela; null se desconhecida
recovery_time          # minutos até resolução; null se desconhecido
resolution_type        # reenvio | cortesia | nada | desconhecido | ...
source_confidence      # alta | media | baixa
evidence_type          # conhecimento | simulacao | comportamento | consistencia
context_available      # lista do que se sabe
context_missing        # lista do que falta (exposição, praça, pessoa-papel, etc.)
```

**Proibições de preenchimento:**

- Não inferir `local_hour` de “jantar” agregado sem distribuição.  
- Não preencher `affected_orders` com 1 por padrão.  
- Não usar nome de pessoa como dimensão.  

---

## 7. Dimensões de comparação (futuro)

Preparar comparações (todas com **baseline equivalente** + exposição):

1. Dia da semana  
2. Hora do dia  
3. Faixas 30 / 60 / 120 minutos  
4. Turno  
5. Abertura / pico / fechamento (definições de corte a validar)  
6. Volume de pedidos  
7. Volume de itens  
8. Tipo de pedido (quando classificado: simples / multi-praça / combo…)  
9. Canal  
10. Praça  
11. Etapa operacional (produção, conferência, saída…)  
12. Tipo de erro (taxonomia)  
13. Gravidade  
14. Tempo de recuperação  
15. Repetição na mesma janela  
16. Semana do mês  
17. Feriados / datas especiais (quando tabela existir)  
18. Promoções, mudança de cardápio, falha de sistema (quando documentados)

**Camada A sozinha:** só permite **definir** as dimensões e marcar quais fontes futuras as preenchem — **não** ranquear.

---

## 8. Métricas normalizadas (exposição)

### 8.1 Preferidas (quando volume existir)

| Métrica | Definição | Requer |
|---|---|---|
| erros / 100 pedidos | `100 * ocorrencias / pedidos_janela` | volume pedidos |
| erros / 1.000 itens | `1000 * ocorrencias / itens_janela` | volume itens |
| erros / hora operacional | `ocorrencias / horas_abertas` | calendário de operação |
| erros / volume da faixa | taxa na faixa 30–120 min | volume na faixa |
| erros / praça ativa | taxa condicional à praça | composição ou atribuição de praça |
| erros / etapa | taxa por etapa do processo | etapa no evento |
| % pedidos afetados | `pedidos_com_erro / pedidos` | ligação erro↔pedido |

### 8.2 Quando exposição **não** existe

1. Registrar **contagem absoluta** apenas.  
2. Marcar análise **`inconclusiva`**.  
3. **Não** classificar a janela como de maior risco.  
4. Listar `source_id` necessário para normalizar (em geral: iFood pedidos + logística).  

### 8.3 Possível vs bloqueado nesta Camada A

| Métrica temporal | Camada A (só docs Git) | Camada B |
|---|---|---|
| Listar âncoras datadas (kit 25/09/2023) | **Sim** (pontual) | Confirmar se regra mudou |
| Taxa de erro por hora/dia | **Não** | iFood + classificação de erro |
| Jantar vs almoço em % de pedidos | **Só se** reabrir dashboard/PDF | Agregados brutos |
| Menções WhatsApp por hora do dia | **Não** (bruto ausente) | Export + cuidado proxy |
| Atraso médio produção/expedição por faixa | **Não** | carimbos logísticos |
| Baseline de praça calibrado | **Não** (baselines no motor são provisórios) | dado real multi-dia |

---

## 9. Fatores de confusão

Não atribuir **causa** a dia/hora sem considerar (quando possível):

| Fator | Como entra no modelo |
|---|---|
| Maior volume | Normalização por pedidos/itens |
| Composição diferente (mais combos/quentes) | Dimensão tipo de pedido / praça |
| Falta de funcionário / troca de posição / novato | `context_missing` se não houver escala; **nunca** alerta nominal |
| Indisponibilidade / pausa de item | flag de contexto se documentada |
| Promoção / feriado / jogo / evento | calendário auxiliar |
| Falha técnica / mudança cardápio / procedimento | `event_category` + notas |
| Fonte incompleta | `source_confidence` baixa; inconclusivo |

**Classificação obrigatória de conclusão:**

| Tipo | Uso |
|---|---|
| Correlação observada | “Nesta amostra, Y sobe com X (normalizado)” |
| Hipótese de causa | Explicação possível |
| Causa confirmada | Só com evidência forte + revisão humana |
| Desconhecido | Default honesto |

---

## 10. Critérios para **padrão temporal** (futuro)

Todos os itens:

1. Múltiplas ocorrências.  
2. Mais de um período independente.  
3. Exposição conhecida **ou** limitação explícita (e então **não** ranquear risco).  
4. Comparação com baseline **equivalente** (mesmo tipo de dia/volume quando possível).  
5. Amostra mínima (a definir na B; HIP: não publicar com n&lt;30 eventos na fatia sem caveat).  
6. Confiança declarada.  
7. Impacto operacional descrito.  
8. Explicação alternativa considerada (confusão §9).  
9. Revisão humana.  

**Proibido:**

- Uma noite ruim = padrão.  
- Só média geral se o comportamento varia por dia/turno/volume.  
- Contagem absoluta como “pior sábado”.  

---

## 11. Categorias de alerta (futuras — não implementar)

| Categoria | Momento | Intenção |
|---|---|---|
| **A. Preventivo** | Antes de janela historicamente mais arriscada **com exposição** | Preparar equipe / processo |
| **B. Recorrência** | Mesmo tipo se repete em janela curta | Checar processo agora |
| **C. Anomalia** | Operação atual &gt; baseline comparável de forma relevante | Investigar desvio |
| **D. Aprendizado** | Recorrência histórica justifica revisão de processo/treino | Fora do Foco de turno; briefing / microtreino |

Nenhum está **aprovado para implementação** nesta missão. Status padrão de qualquer exemplo: **`hipótese`** ou **`aguardando dados`**.

---

## 12. Contrato do candidato a alerta

```text
alert_candidate_id
nome
categoria                  # preventivo | recorrencia | anomalia | aprendizado
problema_observado
fontes                     # source_ids
populacao_afetada          # função/praça/operação — NUNCA pessoa nomeada
dimensao_temporal          # weekday | hour | shift | window | ...
baseline_comparavel
metrica
normalizacao_utilizada     # /100 pedidos | /1000 itens | ... | nenhuma (inconclusivo)
condicao_ativacao
janela_observacao
amostra_minima
confianca_minima
acao_recomendada          # acionável por humano
responsavel_acao           # papel, não CPF
risco_falso_positivo
risco_fadiga_alertas
limite_repeticao
validade
data_revisao
aprovador_humano
status                     # hipotese | aguardando_dados | em_validacao |
                           # aprovado_para_teste | rejeitado | suspenso |
                           # aprovado_para_implementacao
```

### Exemplos conceituais (sem números inventados)

| ID | Nome | Cat. | Status | Nota |
|---|---|---|---|---|
| ALC-001 | Reforço de conferência pré-faixa | Preventivo | `aguardando_dados` | Só se taxa normalizada de omissão/conferência for elevada na faixa **com** volume |
| ALC-002 | Recorrência de omissão na janela | Recorrência | `aguardando_dados` | Contagem de eventos iguais em 30–120 min; sem expor pessoa |
| ALC-003 | Atraso acima do baseline do dia×volume | Anomalia | `aguardando_dados` | Requer carimbos + volume |
| ALC-004 | Microtreino de kit/embalagem | Aprendizado | `hipótese` | Sai de padrão temporal validado + revisão humana; **não** é Foco de turno |

Textos de exemplo (conceituais):

- Preventivo: *“Esta faixa costuma exigir atenção adicional em Conferência. Reforce a checagem antes do pico.”* — **só após** padrão com exposição.  
- Recorrência: *“Foram observadas várias ocorrências semelhantes nesta janela. Verifique processo, reposição e comunicação.”*  
- Anomalia: *“A quantidade de atrasos está acima do esperado para este dia, horário e volume.”*  
- Aprendizado: *“Há evidência recorrente suficiente para revisar este procedimento e propor um microtreinamento.”*  

---

## 13. Política contra fadiga de alertas

Todo candidato **deve** responder:

| Pergunta | Exigência |
|---|---|
| A pessoa pode agir agora? | Se não → não é alerta operacional |
| Ação clara? | Verbo + onde olhar |
| Antecedência suficiente? (preventivo) | Senão vira ruído |
| Quantas repetições? | `limite_repeticao` obrigatório |
| Custo do falso positivo? | Declarar |
| Custo de não alertar? | Declarar |
| Forma mais silenciosa? | Preferir Calmo/Ambiente/briefing |
| Calmo / Ambiente / Foco? | Classificar (§14) |

**Princípio DeliveryOS:** atenção é sagrada.  
Correlação sozinha **não** autoriza alerta.  
Lei 12: nunca gritar lobo.

---

## 14. Relação com Calmo, Ambiente e Foco

| Destino cognitivo | Quando usar (futuro) |
|---|---|
| Sinal silencioso no **Calmo** | Saúde de fonte / pulso; não interrupção |
| Pressão no **Ambiente** | Clima de faixa (ex. saída lenta) sem ação única |
| Candidato a **Foco** | Uma tensão acionável agora, raridade, confiança alta |
| Briefing pré-turno | Preventivo do dia (aprendizado agregado) |
| Microtreinamento | Categoria D após revisão |
| Mudança de processo | Fora da tela de turno |
| Só relatório | Tudo que não passa nos testes de fadiga |

**Nem todo padrão → alerta. Nem todo alerta → Foco.**

### Alertas individuais — proibidos em automático

Não produzir:

- ranking de erros;  
- “pior funcionário”;  
- personalidade / intenção;  
- punição;  
- promoção/rebaixamento automático.  

Priorizar: processo, função, praça, janela, volume, treino, comunicação, contexto.  
Evidência individual → **revisão humana**; não no alerta coletivo do turno.

---

## 15. Campos e análises que dependem da T0B-B

| Dependência | Fonte privada necessária |
|---|---|
| Preencher `occurred_at` em massa | iFood xlsx/jsonl, logística, WhatsApp amostrado |
| `order_volume_window` / `item_volume_window` | Pedidos + itens por janela |
| Taxas normalizadas por hora/dia | Idem |
| Atraso produção/expedição | Carimbos pronto/saiu |
| Proxy fraco de “erro” via chat | WhatsApp + taxonomia manual |
| Turno oficial da loja | César + eventualmente escala |
| `operational_day_key` definitivo | César |
| Feriados/promoções | Calendário auxiliar a criar |
| Baseline comparável estável | ≥ N semanas de série (a definir) |
| Validar ALC-001…004 | Tudo acima + revisão humana |

---

## 16. Exemplos conceituais de análise (sem números inventados)

### Exemplo A — Contagem absoluta sem volume

```text
Observação: N menções de “faltou kit” em mensagens de um mês (se reaberto o WhatsApp).
Exposição: null
Classificação: contagem absoluta registrada; análise de “pior horário” = INCONCLUSIVA
Necessário: pedidos/hora na mesma janela (iFood)
```

### Exemplo B — Com exposição (futuro)

```text
Métrica: omissões conferência / 100 pedidos
Comparar: sábado 19–21 vs sábado 14–16 com volume semelhante
Se taxa A >> taxa B com n adequado e revisão humana → padrão temporal candidato
Senão → hipótese ou ruído
```

### Exemplo C — Âncora documental (Camada A válida)

```text
2023-09-25: comunicação formal de kit (estudo WhatsApp).
Tipo: mudança de regra datada (FD no estudo), não taxa de erro por hora.
Uso: curso de kit “antes/depois” qualitativo; não alerta de pico.
```

---

## 17. Riscos e limitações

| Risco | Mitigação |
|---|---|
| Falso “sábado pior” por volume | Normalizar ou inconclusivo |
| Timestamp de chat ≠ hora do erro | Só usar chat quando o evento **é** a mensagem |
| Fadiga de alertas | Contrato §12–13; preferir silêncio |
| Vigilância de pessoa | Proibição §14 |
| Baselines do motor provisórios | Não usar como verdade de loja sem calibração |
| Janela HTML 24h cruzando meia-noite | `operational_day_key` + join logística |
| Contagem WhatsApp 155k vs 171k | Recontar antes de qualquer % |
| Implementar alerta cedo demais | Status só avança com aprovador humano |

---

## 18. Checklist de conclusão (temporal) da T0B-A

- [x] Fontes temporais identificadas (§1–2)  
- [x] Timestamps confiáveis vs não confiáveis separados (§3)  
- [x] Método de normalização definido (§8)  
- [x] Nenhum padrão temporal afirmado sem exposição  
- [x] Candidatos a alerta ≠ alertas aprovados (§11–12)  
- [x] Dependências T0B-B registradas (§15)  

---

## 19. Relação com DeliveryOS e TATÁ Evolução

| Sistema | Uso futuro do modelo |
|---|---|
| **DeliveryOS** | Sinais/alertas no turno (Calmo/Ambiente/Foco) com freios de fadiga |
| **TATÁ Evolução** | Briefings, microtreinos, revisão de processo (categoria D) |

Mesma memória analítica; **superfícies e permissões diferentes**.

---

*Modelo metodológico · zero alertas ativos · zero padrões temporais inventados.*
