# MAPA DA PLANILHA — Cópia de Motoboy TATÁ 2026.xlsx

| Campo | Valor |
|---|---|
| Arquivo | `Cópia de Motoboy TATÁ 2026.xlsx` (cópia local `_tmp_motoboy.xlsx`) |
| Período dados IDA | 2026-03-23 15:38 → 2026-07-12 12:22 |
| Contagens | **705** RESPOSTAS_IDA · **501** RESPOSTAS_VOLTA |
| Multi-parada | 1→526 · 2→155 · 3→23 · 4→1 · 5→0 |
| Gate | Zero |
| Data análise | 2026-07-20 |

---

## 1. Visão geral das abas

| Aba | Finalidade | Quem preenche | Quando | Tipo |
|---|---|---|---|---|
| **RESPOSTAS_IDA** | Registro de saída + até 5 paradas | Motoboy (formulário Google) | Na saída / logo após sair | Manual (entrada) |
| **RESPOSTAS_VOLTA** | Declaração de retorno + “tudo bem?” + obs | Motoboy (formulário) | Ao voltar / ao encerrar ciclo | Manual (entrada) |
| **00_Operacao_Hoje** | Painel do dia: saídas, em rota, finalizadas | Fórmulas | Contínuo (leitura) | Calculado / painel |
| **01_Resumo_Gerencial** | Indicadores e visão por motoboy | Fórmulas | Contínuo | Calculado |
| **02_Clientes** | Base cliente/endereço/telefone + norm | Import/histórico | Manutenção | Referência (**PII alto**) |
| **03_Historico** | Consolida ida↔volta, rota, KM, SLA, status | Fórmulas + cache | Contínuo | Calculado / frágil |
| **07_Bairros** | KM padrão e meta (min) por bairro | Operação (manual) | Cadastro | Referência de **estimativa** |
| **08_Apelidos** | Alias digitado → bairro padrão | Operação (manual) | Quando nasce variação | Dicionário |
| **09_Como_Conectar** | Instruções de setup formulários | — | Setup | Documentação |

---

## 2. RESPOSTAS_IDA (705 registros)

### Campos

| Campo planilha | Tipo | Valores possíveis | Manual? | Correspondência conceitual |
|---|---|---|---|---|
| Carimbo de data/hora | timestamp | auto formulário | sistema form | `trip.departure_declared_at` (declarado) |
| Nome do Motoboy | texto livre | nomes digitados (Marcelo, Paulo, Filho…) | sim | **Actor** (identificação frágil, sem ID estável) |
| Endereço | texto | livre | sim | Delivery #1 address |
| Cliente: | texto | livre | sim | Delivery #1 customer label |
| Bairro | texto | livre / apelidos | sim | Delivery #1 neighborhood |
| Tem 2ª entrega nessa saída? | Sim/Não | Sim, Não | sim | flag multi-stop |
| Endereço 2 / Cliente 2 / Bairro 2 | texto | se 2ª | sim | Delivery #2 |
| Tem 3ª… / blocos 3–5 | idem | até 5 | sim | Delivery #3–#5 |
| Endereço 5 / Cliente 5 / Bairro 5 | texto | raro | sim | limite de **cinco paradas** no form |

### Como funciona a ida (hoje)

1. Pedidos prontos são agrupados **manualmente** na loja (sem trip_id).  
2. Motoboy sai e preenche o **formulário de ida** com nome + até 5 blocos endereço/cliente/bairro.  
3. Carimbo = momento do envio do form (pode ser **depois** da saída real).  
4. **Não há** order_id, comanda, telefone, pagamento nem volumes no form.  
5. Identificação do motoboy = **string digitada** (variações de grafia possíveis).

### Fragilidades

- Sem `trip_id`.  
- Sem vínculo a pedido/comanda.  
- Até 5 paradas hard-coded no formulário.  
- Ordem das paradas = ordem digitada, não evento de reordenação.  
- Inclusão/remoção **depois** da saída não fica como evento (só chat).

### Preservar vs substituir

| Preservar (conceito) | Substituir no sistema | Não migrar como verdade |
|---|---|---|
| Multi-parada até N | formulário Google | carimbo como “hora real de saída” sem outra evidência |
| Nome do executor da viagem | Actor com id estável | ranking por volume de linhas |
| Endereço/cliente/bairro por parada | Delivery + address | texto bruto sem normalização forçada |
| Histórico de volume de saídas | eventos Trip | SLA derivado de pareamento frágil |

**COR:** Trip · Delivery (stops) · Actor.

---

## 3. RESPOSTAS_VOLTA (501 registros)

| Campo | Valores | Manual | Correspondência |
|---|---|---|---|
| Carimbo de data/hora | timestamp form | sistema | `return_declared_at` |
| Nome do Motoboy | texto | sim | Actor (mesmo problema de digitação) |
| Ocorreu tudo bem com as entregas? | predominantemente “Sim” | sim | sinal binário fraco ≠ status por Delivery |
| Observações | texto livre (“Ok”, “Normal”, “Tudo certo”) | sim | Occurrence leve / nota; **não** estrutura |

### Como funciona a volta (hoje)

1. Motoboy declara volta no formulário.  
2. **Não** aponta qual ida (sem chave).  
3. “Tudo bem?” não discrimina parada a parada.  
4. Disponibilidade na loja é **inferida** pelo retorno (Operação Viva), sem estado explícito no form.

### Vínculo ida ↔ volta (R1, reconstrução)

| Classe | Qtd | Tipo |
|---|---|---|
| Associações unívocas (mesma id digitada, janela ≤8h) | **390** | inferência |
| Ambíguas | **47** | inferência |
| Ida sem volta temporal | **268** | ausência de registro |
| Volta sem ida temporal | **64** | ausência |
| Conflito pareamento por ordem (fórmula vs cronologia) | **434** | fato da planilha |

**Não** tratar tempo/SLA da planilha como duração real quando ambíguo.

**COR:** evento de retorno / Trip encerrada · **não** Delivery confirmada por volta genérica.

---

## 4. 00_Operacao_Hoje

| Aspecto | Conteúdo |
|---|---|
| Finalidade | Dashboard “saídas hoje”, “entregas”, “em rota”, “finalizadas”, “% prazo” |
| Preenchimento | Fórmulas sobre histórico/respostas |
| Fragilidade R1 | Intervalos fixos (~400 registros) — cobertura pode falhar na base cheia |
| Correspondência | Visão operacional (não objeto de domínio) |
| Migrar? | Substituir por queries sobre eventos; **não** copiar fórmulas INDIRECT |

---

## 5. 01_Resumo_Gerencial

| Aspecto | Conteúdo |
|---|---|
| Finalidade | Saídas/entregas/KM por período e por motoboy |
| Fragilidade | Mesma limitação de intervalo; KM vem de bairro, não GPS |
| Risco | Ler como performance individual → **proibido** no COR (sem ranking) |
| Migrar? | Indicadores agregados anônimos ok; **não** score individual |

---

## 6. 02_Clientes (3.698 linhas)

| Campos | Cliente, Endereço, Bairro, Telefone, Cliente_Norm, Endereco_Norm, Cliente_Chave, Endereco_Chave |
|---|---|
| Finalidade | Cadastro/normalização |
| PII | **Alto** — telefone e nome completos |
| Uso seguro | Nunca chave automática de match sozinha; mascarar em docs |
| COR | Customer ref opcional; match por sinais fortes (order_ref) primeiro |

---

## 7. 03_Historico (~399 linhas em cache / fórmulas até 1000)

| Campos principais | Data, Saída, Volta, Motoboy, Qtd, Rota, Bairros, KM, Meta, Tempo, SLA, Status, Fonte, Seq, Volta_raw, Obs_raw, End1–5, Cli1–5, Bai1–5, BairroRes1–5 |
|---|---|
| Finalidade | “Viagem” reconstruída |
| Pareamento | n-ésima ocorrência do nome + ordem — **não** trip_id |
| Fonte (exemplos) | `ENDERECO/CLIENTE`, `BAIRRO/APOIO` |
| KM / Meta | de **07_Bairros**, não telemetria |
| Status | Concluída / etc. derivados |
| Fragilidades | Cache 399 vs 705 idas; INDIRECT; SLA artificial em conflitos |
| COR | substituto = log de eventos da Trip |

**Preservar conceito:** multi-stop, motoboy, timestamps declarados, obs.  
**Não migrar como verdade:** Tempo, SLA, Status quando Fonte/pareamento frágil.

---

## 8. 07_Bairros (~87)

| Campos | Bairro, KM padrão, Meta (min), Prioridade, Bairro_Chave |
|---|---|
| Uso | Estimativa de distância e meta de tempo |
| Não é | Distância real percorrida |
| COR | política/referência opcional; **não** prova de rota |

---

## 9. 08_Apelidos (~169)

| Campos | Digitado, Bairro_Padrao, Digitado_Chave |
|---|---|
| Uso | “ITAIM” → “Itaim Bibi” |
| Manutenção | Humana |
| COR | normalização de bairro / dicionário local |

---

## 10. 09_Como_Conectar

Instruções: conectar form IDA → aba RESPOSTAS_IDA; form VOLTA → RESPOSTAS_VOLTA; localidade BR / fuso SP; form IDA com até 5 blocos Endereço/Cliente/Bairro.

---

## 11. Fluxos atuais (só planilha)

### Registro de ida
Form Google → linha em RESPOSTAS_IDA → histórico tenta montar “viagem”.

### Até cinco paradas
Flags “Tem Nª entrega?” + blocos 2–5. Distribuição real: maioria 1; multi relevante (155+23+1).

### Registro de volta
Form → RESPOSTAS_VOLTA; histórico tenta amarrar por nome/ordem.

### Identificação digitada
Nome do motoboy e textos de endereço/cliente — sem IDs estáveis.

### Disponibilidade
**Não** há coluna “disponível”. Inferida: se “voltou” e não “saiu de novo”. Risco de estado falso se volta esquecida (R1).

### Operação do dia
Abas 00/01 leem fatias da base; podem não cobrir 705 linhas.

---

## 12. Correspondência com objetos COR (conceitual)

| Planilha | Trip | Delivery | Handoff | Occurrence | Actor |
|---|---|---|---|---|---|
| Linha IDA | ≈ criação frágil de viagem | 1–5 stops | **não** | — | nome |
| Linha VOLTA | ≈ fim declarado | não por stop | **não** | obs se problema | nome |
| Historico | reconstrução | rota concatenada | **não** | — | nome |
| Clientes | — | apoio endereço | — | — | — |
| Bairros/Apelidos | — | norm | — | — | — |
| iFood | **ausente** | — | **ausente na planilha** | — | — |

---

## 13. O que o novo sistema deve eliminar

1. Pareamento por ordem/nome.  
2. SLA/tempo como fato sem trip_id.  
3. Painel com janela fixa silenciosa.  
4. KM de tabela como km real.  
5. Base de clientes exportável sem controle de acesso.

---

## 14. Dúvidas para o César (planilha)

1. O formulário ainda é a fonte de verdade operacional diária?  
2. Quem preenche quando o motoboy esquece ida/volta?  
3. Há regra informal de “não sair sem preencher ida”?  
4. Observações da volta: alguém lê/atua sistematicamente?  
5. Deseja migrar histórico 705/501 como arquivo morto ou só a partir do go-live?

---

*MAPA_PLANILHA_MOTOBOY · Gate Zero · 705/501 validados no arquivo · sem implementação.*
