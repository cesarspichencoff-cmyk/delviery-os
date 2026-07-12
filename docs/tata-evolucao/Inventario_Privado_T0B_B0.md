# Inventário Privado — T0B-B0

> Preparação de fontes **fora do Git**.  
> Branch `research/tata-evolucao-grok` · base `37692f1`.  
> Local físico dos originais gerenciados: `../deliveryos-private-sources/` (irmão do repo).  
> **Nenhum conteúdo de conversa, nome de pessoa, telefone ou trecho identificável neste documento.**  
> Hashes SHA-256 dos arquivos em `00_ORIGINALS_IMMUTABLE` (prefixo 16 hex para legibilidade; manifesto local completo fora do Git).

---

## 1. Escopo e método

| Item | Valor |
|---|---|
| Missão | Inventariar, hashear, classificar privacidade, separar original/trabalho |
| Análise de padrões | **Não** |
| Originais de Downloads | **Não modificados** |
| Cópia imutável | `deliveryos-private-sources/00_ORIGINALS_IMMUTABLE/` (atributo somente-leitura) |
| Cópia de trabalho | `deliveryos-private-sources/01_WORK_COPIES/` (zips/arquivos ainda fechados; extração = B1) |
| Manifesto local (fora do Git) | `deliveryos-private-sources/_manifests_local/originals_sha256.csv` |

---

## 2. Resumo quantitativo

| Métrica | Valor |
|---|---:|
| Conjuntos lógicos (pastas/famílias) | **6** |
| Arquivos em originais imutáveis | **58** |
| Volume total (bytes) | **32.791.110** (~31,3 MiB) |
| Volume total (MiB arredondado) | **31,3** |
| Zips abertos com sucesso (integridade de container) | **todos** (0 falhas) |
| Grupos de hash duplicado | **1** (2 arquivos idênticos) |
| Arquivos corrompidos (zip ilegível) | **0** |

---

## 3. Conjuntos inventariados

### SET-WA — WhatsApp operacional (exportações)

| Campo | Valor |
|---|---|
| **source_id** | SET-WA / SRC-EXT-WHATSAPP-RAW |
| **Nome genérico** | Exportações de conversas WhatsApp (Delivery) |
| **Formato** | `.zip` (export iOS típico) |
| **Quantidade** | **13** arquivos |
| **Tamanho total** | 3.219.504 bytes |
| **Período** | Documentado no estudo Git: ~2020-04 → 2026-06 (a confirmar por amostragem na B1; **não** recontado nesta B0) |
| **Origem** | Pacote histórico “Projeto / Bloco 2” (cópia imutável local) |
| **Arquivos genéricos** | `WA-01.zip` … `WA-13.zip` |
| **PII / risco** | **CRÍTICO** — nomes de pessoas, conversas, possível contexto sensível |
| **Qualidade B0** | Containers OK; conteúdo não inspecionado |
| **Prioridade B1** | **P0.1** |
| **Restrição** | Só amostragem; anonimização; nunca commit |

| ID genérico | Bytes | SHA-256 (16) |
|---|---:|---|
| WA-01 | 31.188 | `9F2E11716FD58718` |
| WA-02 | 323.550 | `B442AF26A35219B0` |
| WA-03 | 257.727 | `177995988226BB6A` |
| WA-04 | 345.652 | `D617CC4E72C636AB` |
| WA-05 | 1.467.607 | `A4A6DCF44A3BF1D2` |
| WA-06 | 152.945 | `CF7800123533BDCA` |
| WA-07 | 158.127 | `D465EE33F63A68AA` |
| WA-08 | 16.730 | `AB82D5A1425D6711` |
| WA-09 | 129.312 | `22C7CD09AFF7F705` |
| WA-10 | 26.555 | `D9836BFBE34EE74D` |
| WA-11 | 41.201 | `FB2764C60A9996BE` |
| WA-12 | 100.534 | `B952D5C6F1A49B95` |
| WA-13 | 168.376 | `5AD69CDAE78DE3A4` |

---

### SET-IFOOD — Dados e relatórios iFood / planilhas comerciais

| Campo | Valor |
|---|---|
| **source_id** | SET-IFOOD / SRC-EXT-DADOS-CLAUDE + packs avulsos |
| **Nome genérico** | Pacote iFood / vendas / negociações / pedidos |
| **Formato** | `.zip`, `.xlsx` |
| **Quantidade** | **8** arquivos |
| **Tamanho total** | 17.966.402 bytes |
| **Período** | Inclui zip de pedidos **2026-05-27 → 2026-06-25** (nome do arquivo); demais períodos **a inventariar na abertura do pack** |
| **Origem** | Downloads + Bloco 2 (planilhas) |
| **PII / risco** | **Médio–baixo** em exports oficiais de pedido (docs Git: sem nome/tel/endereço de cliente); planilhas internas **médio** se tiverem nomes de equipe |
| **Qualidade B0** | Zips OK; xlsx não abertos (sem parse de abas nesta missão) |
| **Prioridade B1** | **P0.2** |

| ID genérico | Bytes | SHA-256 (16) | Nota |
|---|---:|---|---|
| Dados_Claude.zip | 15.158.045 | `D73A63133A50E5D6` | Pack principal multi-arquivo |
| relatorio_pedidos_2026-05-27_2026-06-25.xlsx.zip | 2.506.975 | `515620A5ED166FCC` | Pedidos ~30 dias |
| negociacoes_ifood.xlsx | 74.104 | `97554CDF501FAED6` | Negociações |
| B2-XLSX-01 … 05 | 120.015 … 21.342 | (ver manifesto local) | 5 planilhas do Bloco 2 (checklist/erros/vendas/cardápio-loja) |

---

### SET-AVAL — Avaliações e reclamações

| Campo | Valor |
|---|---|
| **source_id** | SET-AVAL |
| **Nome genérico** | Avaliações iFood (planilha) |
| **Formato** | `.xlsx` |
| **Quantidade** | **1** |
| **Tamanho** | 90.909 bytes |
| **Período** | Documentado em inventário Git: ~2026-04-03 → 2026-07-02 (a confirmar na abertura) |
| **PII / risco** | **Médio** — comentários de cliente podem ter texto livre; sem copiar trechos |
| **Prioridade B1** | **P1** (atendimento) |
| **SHA-256 (16)** | `72EDF7F482ABD25D` |

---

### SET-B3 — Bloco 3 qualidade (PDFs mensais)

| Campo | Valor |
|---|---|
| **source_id** | SET-B3 / SRC-EXT-BLOCO3-PDF |
| **Nome genérico** | Relatórios mensais de qualidade (PDF) + zip qualidade loja |
| **Formato** | `.pdf`, `.zip` |
| **Quantidade** | **9** (8 PDF + 1 zip) |
| **Tamanho total** | 5.637.991 bytes |
| **Período** | Meses rotulados no pacote (jan/fev/mai/jun/ago/“set”/nov/dez) — **ano no conteúdo a confirmar**; docs Git apontam 2023–2024 |
| **PII / risco** | **Baixo–médio** (agregados; sem abrir texto nesta B0) |
| **Qualidade B0** | Arquivos presentes; possível **rótulo de mês enganoso** já notado em auditoria Git (Setembro≠Outubro) |
| **Prioridade B1** | **P0.3** |

| ID | Bytes | SHA-256 (16) |
|---|---:|---|
| B3-PDF-01 … 08 | 564.076 – 965.728 | (manifesto local) |
| relatorio_qualidade_operacao_loja.zip | 12.024 | `88B153A381972E80` |

---

### SET-OP — Operacional, treino, RH-ligado ao Delivery

| Campo | Valor |
|---|---|
| **source_id** | SET-OP / SRC-EXT-RH-TREINO (parcial) |
| **Nome genérico** | Checklists, treinamentos, escalas, alinhamentos, reuniões, cardápio em PDF, comparativos |
| **Formato** | pdf, docx, xlsx, pptx, png |
| **Quantidade** | **17** |
| **Tamanho total** | 3.963.758 bytes |
| **Período** | Misto (inclui checklist 2023 em outro conjunto; materiais de alinhamento sem período fechado nesta B0) |
| **PII / risco** | **Alto** se escalas/listas tiverem nomes; **médio** em PDFs de processo |
| **Prioridade B1** | **P1** (conteúdo de formação e processo) |
| **Duplicidade** | OP-11 e OP-12 = **mesmo hash** (cópia idêntica) |

---

### SET-MID — Mídia operacional

| Campo | Valor |
|---|---|
| **source_id** | SET-MID |
| **Nome genérico** | Fotos e vídeo de contexto operacional (comanda/loja/kit) |
| **Formato** | jpeg, mp4 |
| **Quantidade** | **10** (6 mid + 4 imgs Bloco 3) |
| **Tamanho total** | 1.912.546 bytes |
| **Período** | Metadados de arquivo ~2026-06 / 2026-07 |
| **PII / risco** | **Alto** se comanda com dados de cliente visíveis; não inspecionar em docs Git |
| **Prioridade B1** | **P2** (validação visual / kit) |

---

## 4. Duplicidades

| Tipo | Detalhe | Ação B1 |
|---|---|---|
| Hash idêntico | `operacional_rh_treino/OP-11.pdf` = `OP-12.pdf` (82.870 bytes, SHA `0A2EB19142AEED17…`) | Processar **uma** vez; marcar a outra como cópia |
| Possível sobreposição lógica | Planilhas Bloco 2 vs conteúdo de `Dados_Claude.zip` | Comparar hashes internos após extrair pack |
| Downloads | Múltiplas cópias de zip de qualidade no Downloads; **uma** copiada para originais | OK |

Mapa de nomes originais de WhatsApp → `WA-xx` existe **somente** em manifesto local (`whatsapp_name_map_LOCAL_ONLY.csv`), **fora do Git**.

---

## 5. Arquivos problemáticos / incompletos

| Item | Severidade | Nota |
|---|---|---|
| Nenhum zip corrompido | — | Abertura de container OK |
| Conteúdo interno WhatsApp | Incompleto para B0 | Não extraído de propósito |
| Rótulos de mês Bloco 3 | Atenção | Ano e possíveis nomes errados → validar na extração de texto |
| Períodos finos de vários OP-* | Incompleto | Abrir metadados na B1 sem copiar PII para Git |
| `data/raw` do repositório | Vazio | Não bloqueia B0; B1 pode usar private-sources |

---

## 6. Fontes ainda faltantes (em relação ao plano T0A)

| Esperado | Status B0 |
|---|---|
| 13 WhatsApp | **Presente** (13/13) |
| Dados Claude.zip | **Presente** |
| Bloco 3 (8 PDFs) | **Presente** (8/8) |
| Avaliações | **Presente** (1 planilha) |
| Materiais treino/checklist/escala | **Presente** (parcial, conjunto OP) |
| Export HTML pedidos 01/07 documentado no Git | **Não** localizado como arquivo solto nesta B0 (pode estar dentro de packs) |
| JSONL derivados | Não necessários em B0 |
| Backup off-machine | **Não verificado** nesta missão |

---

## 7. Riscos de privacidade (resumo)

| Nível | Conjuntos | Regra |
|---|---|---|
| **Crítico** | SET-WA | Não extrair para Git; amostragem; papéis não nomes em fichas |
| **Alto** | SET-MID (comandas), SET-OP (escalas) | Não commit de imagens com dados; anonimizar |
| **Médio** | SET-AVAL (comentários), SET-IFOOD (se colunas de equipe) | Minimizar campos |
| **Baixo** | SET-B3 agregados (hipótese) | Confirmar na abertura |

---

## 8. Preservação

| Camada | Caminho | Política |
|---|---|---|
| Originais de usuário | Downloads / Projeto (intocados) | Não alterar |
| Originais gerenciados | `00_ORIGINALS_IMMUTABLE` | Read-only; hash no manifesto local |
| Trabalho | `01_WORK_COPIES` | Extrair/anotar só aqui |

---

*Inventário B0 · 58 arquivos · 0 privados no Git.*
