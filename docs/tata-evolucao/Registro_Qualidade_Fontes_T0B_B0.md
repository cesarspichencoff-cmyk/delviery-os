# Registro de Qualidade das Fontes — T0B-B0

> Avaliação de integridade, completude e risco — **sem** minerar conteúdo sensível.  
> Complementa `Inventario_Privado_T0B_B0.md`.

---

## 1. Critérios de qualidade usados

| Critério | Definição nesta B0 |
|---|---|
| **Integridade de arquivo** | Arquivo legível; zip abre e tem entradas |
| **Completude de conjunto** | Qtd esperada vs encontrada (ex. 13/13 WA) |
| **Identidade** | SHA-256 estável; duplicatas mapeadas |
| **Rastreabilidade** | Cópia imutável + manifesto local |
| **Adequação à mineração** | Formato conhecido; período estimável |
| **Risco PII** | Crítico / alto / médio / baixo |
| **Confiabilidade temporal** | Ver modelo temporal T0B-A |

Notas: `OK` · `ATENCAO` · `FALHA` · `NAO_AVALIADO` (conteúdo interno).

---

## 2. Qualidade por conjunto

### SET-WA (WhatsApp)

| Critério | Nota | Detalhe |
|---|---|---|
| Integridade | **OK** | 13/13 zips abrem |
| Completude | **OK** | 13 conversas (meta do estudo Git) |
| Identidade | **OK** | Hashes únicos entre WA-01…13 |
| Temporal | **ATENCAO** | Timestamp de **mensagem** ≠ hora do erro físico |
| PII | **CRITICO** | Tratar como fonte de máxima restrição |
| Mineração | **OK** com amostragem | Não ler 100% na primeira passagem |
| Problemas | Nenhum container | Conteúdo = NAO_AVALIADO de propósito |

### SET-IFOOD

| Critério | Nota | Detalhe |
|---|---|---|
| Integridade | **OK** | Zips abrem; xlsx presentes |
| Completude | **ATENCAO** | Pack Claude não inventariado **por membro** ainda |
| Identidade | **OK** | Hashes registrados |
| Temporal | **OK** potencial | Pedidos 27/05–25/06/2026 no nome do zip |
| PII | **MEDIO** | Depende de colunas |
| Mineração | **OK** | Prioridade para exposição |
| Problemas | HTML 01/07 avulso | Não visto fora dos packs |

### SET-AVAL

| Critério | Nota | Detalhe |
|---|---|---|
| Integridade | **OK** | 1 xlsx |
| Completude | **ATENCAO** | Uma planilha; pode haver outras no pack Claude |
| Temporal | **ATENCAO** | Período a confirmar na abertura |
| PII | **MEDIO** | Comentários livres |
| Mineração | **OK** com cuidado | Agregar, não citar texto bruto |

### SET-B3

| Critério | Nota | Detalhe |
|---|---|---|
| Integridade | **OK** | 8 PDFs + 1 zip qualidade |
| Completude | **OK** vs meta “8 PDFs” | Zip extra é bônus |
| Temporal | **ATENCAO** | Mês no nome; ano/conteúdo a validar; possível mislabel |
| PII | **BAIXO–MEDIO** | Agregados (hipótese docs Git) |
| Mineração | **OK** | pdftotext na B1 |
| Problemas | Rótulos de mês | Validar no texto |

### SET-OP

| Critério | Nota | Detalhe |
|---|---|---|
| Integridade | **OK** | pdf/docx/xlsx/pptx/png |
| Completude | **ATENCAO** | Não é inventário RH completo da empresa |
| Identidade | **ATENCAO** | OP-11 ≡ OP-12 (duplicata byte-a-byte) |
| Temporal | **ATENCAO** | Períodos mistos / não inventariados por doc |
| PII | **ALTO** | Escalas/listas podem ter nomes |
| Mineração | **OK** | Bom para procedimentos de formação |
| Problemas | Duplicata | Deduplicar no processamento |

### SET-MID

| Critério | Nota | Detalhe |
|---|---|---|
| Integridade | **OK** | jpeg + 1 mp4 |
| Completude | **ATENCAO** | Não cobre todos os erros históricos (imagens de chat perdidas) |
| Temporal | **OK** fraco | Datas de arquivo ~2026-06/07 |
| PII | **ALTO** | Possível dado de cliente em comanda |
| Mineração | **SELETIVA** | Só com necessidade clara |
| Problemas | Vídeo | Não processado (sem frames nesta B0) |

---

## 3. Matriz risco × utilidade (processamento)

| Conjunto | Risco PII | Utilidade T0B-B1 | Ordem |
|---|---|---|---|
| SET-WA | Crítico | Máxima (cultura/escala/omissão narrativa) | L1 |
| SET-IFOOD | Médio | Máxima (exposição temporal) | L2–L3 |
| SET-B3 | Baixo–médio | Alta (séries) | L4 |
| SET-AVAL | Médio | Alta (atendimento) | L5 |
| SET-OP | Alto | Alta (processos/treino) | L6 |
| SET-MID | Alto | Média | L7 |

---

## 4. Controles de qualidade obrigatórios na B1

1. Antes de extrair: revalidar hash do original imutável.  
2. Após extrair: não escrever de volta em `00_ORIGINALS_IMMUTABLE`.  
3. Qualquer ficha no Git: só `source_id` + resumo anonimizado.  
4. Recontar mensagens WA com método **versionado** (script + commit do script se for para o repo, **sem** dados).  
5. Eventos com hora ≥ 23:00: `after_hours_class` (modelo temporal).  
6. Duplicata OP-11/12: processar uma vez.

---

## 5. Verificação de isolamento Git

| Check | Resultado B0 |
|---|---|
| Arquivos privados staged no repo | **Não** (documentos só em `docs/tata-evolucao/`) |
| Caminho private-sources dentro do `.git` | **Não** (irmão do worktree) |
| Conteúdo de chat em markdown | **Não** |

---

## 6. Limitações honestas da B0

- Não abriu planilhas/PDFs para validar colunas ou anos.  
- Não mediu qualidade de texto dentro dos WhatsApp (só container).  
- Não confirmou backup off-machine.  
- Não reconciliou 155k vs 171k mensagens.  

Essas tarefas pertencem à **T0B-B1+**, não à preparação.

---

*Qualidade B0 · preparação concluída · mineração não iniciada.*
