# Mapa de Regras e Contradições — T0B-A

> Regras **documentadas** no Git (Camada A).  
> Classificação: **FD** fato documental · **RV** regra vigente canônica · **RD** possivelmente desatualizada · **HIP** hipótese · **TC** tema candidato · **CTR** contradição · **DES** desconhecido.  
> Código **não** prova comportamento da equipe.

---

## 1. Regras formais (canônicas / operacionais escritas)

### 1.1 Leis e produto (sempre vigentes no corpus)

| ID | Regra | Classe | Fonte |
|---|---|---|---|
| R-L01 | Memória durável não pede log por evento no pico | **RV** | Lei 1 |
| R-L02 | Atenção: mínimo acionável; devolver mais do que consome | **RV** | Lei 2 |
| R-L04 | Nunca vigilância/punição de pessoas | **RV** | Lei 4 |
| R-L05 | Nunca apresentar inferência como fato | **RV** | Lei 5 |
| R-L06 | Humano decide; máquina mostra | **RV** | Lei 6 |
| R-L12 | Nunca gritar lobo (alarme falso) | **RV** | Lei 12 |
| R-M01 | Nunca pedir preenchimento para alimentar o sistema | **RV** | Manifesto |
| R-M02 | Um foco por vez; não dashboard | **RV** | Manifesto / contratos |
| R-TE01 | Hierarquia de decisão (qualidade > velocidade; etc.) | **RV** | Visão Mestra TATÁ |
| R-TE02 | Erro: segurança para relatar + responsabilidade para corrigir | **RV** | Visão Mestra |
| R-TE03 | Caso não vira regra automática | **RV** | Visão Mestra |
| R-TE04 | Passaporte sem ranking | **RV** | Visão Mestra |
| R-PD01 | Bruto/PII fora do Git | **RV** | Política Dados + Privacidade Evolução |

### 1.2 Embalagens e montagem (documento César → doc V0)

| ID | Regra | Classe | Fonte |
|---|---|---|---|
| R-E01 | Categoria antes de sabor (caixa) | **RV** *como doc operacional* | Embalagens §2 |
| R-E02 | Combinado é produto fechado; extra separado | **RV** doc | Embalagens |
| R-E03 | Quente de cozinha e frio em sacolas separadas | **RV** doc | Embalagens |
| R-E04 | Hot roll: exceção (pode ir com frios) | **RV** doc | Embalagens |
| R-E05 | Volume sem espaço → 2+ sacolas | **RV** doc | Embalagens |
| R-E06 | Dúvida → pendência, não inventar | **RV** doc | Embalagens §2.8 |
| R-E07 | Sistema só sinaliza 2 sacolas se regra confiável **e** pedido identificável | **RV** doc | Embalagens §1 |
| R-E08 | Pendências de alias (Fish Katsu, Yakisoba, etc.) abertas | **DES** / **RD** | Embalagens §15 |

*Nota:* “RV doc” = vigência no documento oficial de embalagens; **comportamento real da equipe = Camada B**.

### 1.3 Cardápio / praças (seed)

| ID | Regra / fato | Classe | Fonte |
|---|---|---|---|
| R-C01 | 199 itens canônicos; 8 praças de produção + bar/montagem/sobremesa | **FD** | seed meta + contagem |
| R-C02 | Distribuição aproximada no seed: duplas 64 · bar 36 · cozinha_quentes 31 · combinados 20 · enrolados 16 · enrolados_quentes 11 · sobremesa 9 · montagem 5 | **FD** | contagem `"praca_principal"` |
| R-C03 | Seed é referência set-once; popularidade **não** inventada no seed | **FD** | meta do seed |
| R-C04 | Multi-praça é norma em pedidos reais (docs de auditoria citam 70–87%) | **FD** *nas auditorias* | Auditoria praça/janelas — **não** recontado nesta missão |

### 1.4 Sinais / operação (especificados para o sistema)

| ID | Regra | Classe | Fonte |
|---|---|---|---|
| R-S01 | Famílias: expedição, produção, custódia, fechamento, conferência… | **FD** | Mapa Sinais |
| R-S02 | Conferência reforçada: 2ª sacola, kit, bebida, observação | **FD** | Mapa Sinais / motor docs |
| R-S03 | Kit padrão comunicado em 25/09/2023 (estudo) | **FD** no estudo | WhatsApp-study F6 |
| R-S04 | Motor A tempo real vs Motor B composição (duas fontes) | **FD** | Auditoria fonte viva / arquitetura |
| R-S05 | Correção à caneta na comanda não aparece no iFood | **FD** | Parser/Auditoria fonte viva |
| R-S06 | Cancelamento lido no Gestor iFood, não na comanda | **FD** | Auditoria fonte viva |

### 1.5 Heurísticas no código (não são prova de cultura)

| ID | Conteúdo | Classe | Fonte |
|---|---|---|---|
| R-K01 | `segundaSacola = combinado âncora OU ≥8 itens` | **FD** código/docs | motor.js citado em embalagens/auditorias |
| R-K02 | R-K01 **≠** regra completa quente×frio do doc embalagens | **CTR** | Embalagens §11–12 vs motor |
| R-K03 | Baseline/tempos de praça são provisórios | **FD** | motor comentários / Estado Atual |

---

## 2. Regras aparentemente **informais** (só como tema no estudo)

> Classe **TC** — precisam de Camada B para virar “ainda é assim”.

| ID | Descrição informal no estudo | Risco se ensinar como formal |
|---|---|---|
| I-01 | “Pausa” resolvida em DM com hub/liderança | Engessa autonomia; precisa protocolo |
| I-02 | Estado recuperado por câmera/foto/memória | Normaliza caça a pessoa se mal ensinado |
| I-03 | “Manda pro caixa / bancada” como fluxo de alívio | Pode ser regra real de chão — validar |
| I-04 | Reensino anual de conferência | Indica falta de retenção, não preguiça |
| I-05 | Contador de dias sem erro (ideia de app) | **Contradiz** Leis — não ensinar como política |

---

## 3. Contradições e tensões documentais

| ID | Tensão | Lados | Classe | Resolução candidata (só proposta) |
|---|---|---|---|---|
| C-01 | Heurística 2ª sacola no motor vs regra embalagens real | Código/docs vs Embalagens César | **CTR** | Formação usa **Embalagens**; sistema só sinaliza com confiança |
| C-02 | “Quentes” no DISPLAY do motor vs vocabulário César (Quentes ≠ Cozinha) | Mapa Ambientes / motor | **CTR** | Validar mapa com César antes de ensinar nomes de bancada |
| C-03 | Custódia “quem fechou” vs Lei 4 não punir | Estudo vs Leis | **CTR** cultural | Atribuição para **aprendizado/sistema**, nunca placar |
| C-04 | Gamificação dias-sem-erro (chat) vs leis cortadas | Estudo F8 vs Leis candidatos cortados | **CTR** | Conteúdo: por que **não** fazer placar |
| C-05 | Contagem WhatsApp 171k vs 155k | Estudo vs Auditoria Nível 2 | **CTR** metodológica | Recontar na B; não usar % |
| C-06 | Bloco 3 “erros item-a-item” vs PDFs agregados | Estudo antigo vs Auditoria N2 | **CTR** resolvida em auditoria | Usar versão corrigida (agregados) |
| C-07 | Sinalizar 2 sacolas (embalagens) vs “não inventar se não identificável” | Mesmo doc | **FD** (regra de ouro) | Coerente se bem implementado |
| C-08 | DeliveryOS “não pede input” vs Academia pede estudo | Manifesto vs Evolução | **HIP** tensão | Evolução é **fora do pico**; nunca no slot de Foco do turno |
| C-09 | Limites de compensação “existem” na Visão vs texto operacional completo | Visão Mestra | **DES** | César documenta limites antes de curso SAC |
| C-10 | Seed 199 vs “217 recebidos” na meta | Seed meta | **FD** | Itens filtrados a canônicos — explicar em formação de cardápio |

---

## 4. Conhecimentos essenciais de cardápio e operação (Camada A)

### Cardápio

- 8 praças de produção + bar/sobremesa/montagem (**FD** seed).  
- Combinados e menus compostos têm prioridade de regras no seed (**FD** meta).  
- Dependências multi-praça de combinados existem no modelo (**FD** auditorias/seed).  
- Aliases e grafias pendentes (**DES** até César fechar §15 embalagens).  

### Operação (sistema)

- Tempo/estado (Motor A) ≠ composição/praça (Motor B) (**FD**).  
- Foco único; ambiente ≤2 rótulos conceituais (**FD** contratos).  
- Expedição: prontos sem sair (**FD** mapa sinais).  
- Conferência: sacolas, kit, obs (**FD**).  

### Operação (estudo — candidato)

- Kit padronizado desde 2023-09-25 (**FD** no estudo; **TC** se ainda idêntico em 2026).  
- Omissão de item/kit como dor narrativa dominante no estudo (**TC**).  

---

## 5. O que **não** está nas regras documentais (lacunas de regra)

| Tema | Status |
|---|---|
| Script de atendimento iFood/WhatsApp cliente | **DES** |
| Tabela de compensação (valores/limites) | **DES** |
| Escala e papéis de cada cargo no turno | **DES** formal |
| Protocolo escrito de pausa (quem, quando, quem libera) | **DES** formal (só TC no estudo) |
| SLA de resposta da liderança no chat | **DES** |
| Checklist de abertura/fechamento de turno | **DES** no Git |

---

## 6. Uso na Academia (sem virar aula ainda)

1. **Trilha cultura:** R-L*, R-TE*, C-03, C-04.  
2. **Trilha operação/embalagem:** R-E*, C-01, C-02, R-C*.  
3. **Trilha liderança:** pausa, escalonamento, C-03.  
4. **Trilha atendimento:** R-TE01 cliente, C-09 compensação (quando existir).  

---

*Regras e contradições Camada A · validação de chão = T0B-B.*
