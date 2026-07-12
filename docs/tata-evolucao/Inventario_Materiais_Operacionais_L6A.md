# Inventário de Materiais Operacionais — L6A

> Conjunto `operacional_rh_treino` (work copies). Hashes original × cópia **iguais (17/17)**.  
> Privado: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/OPERACIONAL_L6A/`  
> **Excluídos da mineração nominal:** escalas com nomes, RH, mídia, disciplina.

---

## 1. Arquivos do lote

| ID | Formato | Título genérico | Tipo | Incluir? |
|---|---|---|---|---|
| OP-01 | png | Material visual operacional | imagem | Sim (sem OCR completo) |
| OP-02 | pptx | Avaliações da semana (delivery/salão) | treino leitura cliente | Sim |
| OP-03 | pdf | PDF sem texto extraível | desconhecido | Sim (qualidade baixa) |
| OP-04 | xlsx | Checklist delivery/caixa + montagem + kits | procedimento | **Sim (núcleo)** |
| OP-05 | pptx | Saúde operacional do delivery (semana) | análise gestão | Sim |
| OP-06 | xlsx | Escalas por horário | escala | **Parcial** (só estrutura; **sem nomes**) |
| OP-07 | pdf | Boas práticas de manipulação / uniforme | regra higiene | Sim |
| OP-08 | pdf | Capacidade de sacola P/M/G por famílias de item | regra embalagem | **Sim** |
| OP-09 | pdf | Relatório de dados julho **2023** | histórico métricas | Sim (não fundir L2C) |
| OP-10 | pdf | Plano operacional DeliveryOS (atraso/fluxo) | treinamento liderança | **Sim (núcleo)** |
| OP-11 | pdf | Reunião de alinhamento de equipe (pico) | combinados | **Sim (núcleo)** |
| OP-12 | pdf | Cópia idêntica de OP-11 | duplicata | Processar 1× |
| OP-13 | pptx | Mix e pressão operacional (semana 23–29/03) | análise gestão | Sim |
| OP-14 | docx | Checklists de fechamento salão/bar/cozinha | checklist casa | Parcial delivery |
| OP-15 | docx | Cronograma de treinamento delivery | treinamento | Sim (ressalvas) |
| roteiro_reuniao | pdf | Roteiro “estado da operação” | cultura/treinamento | **Sim (núcleo)** |
| tabela_cardapio | pdf | Tabela de preço de insumos (hortifruti) | insumo | Parcial (não é cardápio delivery) |

**Duplicidade:** OP-11 ≡ OP-12 (mesmo SHA-256).

---

## 2. Períodos e vigência aparente

| Material | Período interno | Vigência candidata |
|---|---|---|
| OP-04 checklist/kits | sem data de emissão | **vigente provável** (ainda alinhado a prática) |
| OP-08 sacolas | sem data | **vigente provável** |
| OP-10 plano atraso | recorte ~30d + semana 01–06/03 (ano não explícito no texto) | **vigente provável com decisão** |
| OP-11 / OP-12 alinhamento | sem data | **vigente provável** (combinados culturais/operacionais) |
| roteiro_reuniao | sem data | **vigente provável** (DeliveryOS / estado) |
| OP-05 / OP-13 | semanas mar (leituras de KPI) | **antiga ainda compatível parcialmente** |
| OP-02 | 24–29/03 (ano implícito no contexto 2025/26) | leitura cliente histórica |
| OP-09 | **jul/2023** | **desatualizado** como série; útil só como histórico |
| OP-15 treinamento | sem data | **parcialmente desatualizado** (propõe quadro de ranking individual) |
| OP-07 higiene | sem data | **vigente provável** (BPF genérica) |
| OP-06 escalas | datas Excel ~2024–2025 | **não** usar como regra; só prova de existência de escala |
| tabela_cardapio | emissão **10/06/2026** | lista de preços de compra — **não** procedimento delivery |

**Regra:** data de arquivo **não** prova vigência. Itens sem data = **NÃO LOCALIZADA** formalização de versão.

---

## 3. Qualidade e privacidade

| Risco | Arquivos | Tratamento L6A |
|---|---|---|
| Alto (nomes) | OP-06 | estrutura horária apenas |
| Médio | OP-02 textos de avaliação | paráfrase agregada |
| Baixo | OP-04, OP-08, roteiro | OK anonimizado |
| Baixo-texto | OP-03 | sem conteúdo |

---

## 4. Hierarquia de fontes (aplicada)

1. Procedimento datado/operacional explícito (OP-04, OP-08)  
2. Visão Mestra / contratos DeliveryOS (referência cruzada, não reaberta)  
3. Planos e reuniões de liderança (OP-10, OP-11, roteiro)  
4. Análises semanais (OP-05, OP-13)  
5. Histórico 2023 (OP-09)  
6. Escala / RH (excluído nominalmente)

Conflitos → **decisão do César**, não resolução silenciosa.

---

*Inventário L6A · 16 úteis + 1 duplicata.*
