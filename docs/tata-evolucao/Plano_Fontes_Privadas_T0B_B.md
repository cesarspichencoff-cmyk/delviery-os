# Plano de Fontes Privadas — T0B-B

> O que a Camada B precisa, **em prioridade**, para validar ou refutar a Camada A.  
> Esclarece: **source_id ausente** ≠ **número de arquivos** dentro dele.  
> **Não** iniciar T0B-B nesta missão. **Não** importar brutos para o Git.

---

## 1. Diferença: source_id vs arquivos

| Conceito | Significado | Exemplo |
|---|---|---|
| **source_id** | Família lógica de fonte no inventário T0A | `SRC-EXT-WHATSAPP-RAW` = **1** source_id |
| **Arquivos / unidades** | Objetos físicos a inventariar e amostrar | **13** conversas/zips dentro desse source_id |
| **Mensagens** | Grão fino | ~155k–171k msgs (contagem **divergente**; recontar na B) |

### Contagem T0A (lembrete)

| | Qtd |
|---|---:|
| source_ids catalogados | 18 |
| source_ids legíveis no Git (Camada A) | 11 |
| source_ids externos / ausentes neste ambiente | 7 |
| Arquivos WhatsApp esperados | **13** conversas |
| PDFs Bloco 3 esperados | **8** |
| Pacote Dados Claude | **~16** arquivos (auditoria) |
| Lote ifood_2026-07-01 documentado | **4** arquivos |

**“7 fontes ausentes”** no inventário = 7 **famílias**, não 7 arquivos. Só WhatsApp já são 13 arquivos.

---

## 2. O que a Camada A **não** pode fechar sozinha

| Conclusão indevida se não houver B | Por quê |
|---|---|
| Ranking de dores por frequência real | Só há contagens legadas no estudo, não revalidadas |
| “A equipe ainda faz X em 2026” | Estudo cobre até 2026, mas sem reabertura do bruto |
| Limites de compensação na prática | Não estão no Git |
| Eficácia de kit/embalagem no chão | Doc formal ≠ comportamento |
| Tempo até autonomia por cargo | Sem RH/datas |
| Qualidade de escalonamento | Precisa amostra de threads |

---

## 3. Lista priorizada de fontes privadas para T0B-B

### P0 — Bloqueiam validação dos eixos provisórios

| Prioridade | source_id | Unidades esperadas | Para quê (Camada A a validar) | Destino local sugerido |
|---|---|---|---|---|
| **P0.1** | SRC-EXT-WHATSAPP-RAW | **13** exports/zips | TC-01…05, 14–16, 18; casos A01–A04, A10; contagem msgs | `../deliveryos-private-sources/whatsapp/` |
| **P0.2** | SRC-EXT-DADOS-CLAUDE-ZIP | **~16** arquivos | Atraso, cancelamento, logística, desfecho; baseline M1/M6 | `.../ifood/dados-claude/` |
| **P0.3** | SRC-EXT-BLOCO3-PDF | **8** PDFs | Série qualidade 2023–2024; cancel/estrelas | `.../qualidade/bloco3/` |
| **P0.4** | SRC-EXT-IFOOD-RAW-LOCAL | 1+ xlsx + lotes incoming | Cruzar Motor A/B; janelas recentes | `data/raw/` gitignorado **ou** private-sources |

### P1 — Fortemente recomendadas

| Prioridade | source_id / tipo | Unidades | Para quê |
|---|---|---|---|
| P1.1 | Avaliações / comentários iFood (se no pack) | planilhas | Atendimento; sem PII no Git |
| P1.2 | SRC-EXT-RH-TREINO | desconhecido | Marcos de autonomia; M5 |
| P1.3 | Manuais onboarding antigos | desconhecido | Não reinventar conteúdo |
| P1.4 | Política de compensação (mesmo que áudio transcrito) | 1 doc | Trilha Atendimento B4 |

### P2 — Úteis se existirem

| Prioridade | Tipo | Para quê |
|---|---|---|
| P2.1 | Mídia de erros (se backup além do placeholder WhatsApp) | Omissão visual |
| P2.2 | Fotos kit físico | Embalagem/kit |
| P2.3 | Vídeo fluxo caixa | Formação caixa |
| P2.4 | JSONL derivados já gerados | Replay; não substituem bruto |

---

## 4. Ordem de ataque na T0B-B (quando autorizada)

```text
1. Inventário físico: listar arquivos, bytes, hash, período — SEM minerar texto ainda
2. Recontar WhatsApp com método versionado (fechar 155k vs 171k)
3. Amostragem estratificada WhatsApp (Plano_Mineracao_T0B §3)
4. Extrair Bloco 3 (pdftotext) → séries mensais
5. Cruzar dores A com séries iFood/PDF no mesmo período
6. Atualizar temas: promover TC → padrão candidato só com critérios §7 do plano
7. Nunca commitar brutos; só fichas anonimizadas em docs/tata-evolucao/
```

---

## 5. Checklist de entrega ao repositório privado (César)

- [ ] Pasta `../deliveryos-private-sources/` criada  
- [ ] `whatsapp/` com 13 unidades + README local (sem dados no Git)  
- [ ] `ifood/` com pack + raw recente  
- [ ] `qualidade/bloco3/` com 8 PDFs  
- [ ] Backup fora de Downloads  
- [ ] Confirmação: nenhum path privado staged no Git  

---

## 6. Escopos possíveis de autorização futura

| Autorização | Escopo | Resultado esperado |
|---|---|---|
| **T0B-B parcial** | Só WhatsApp amostrado | Validar cultura/escalonamento/omissão narrativa |
| **T0B-B completa** | WhatsApp + iFood + Bloco 3 | Frequências relativas + baseline M1 esboço |
| **Sem B** | — | Blueprint de cursos **não** deve ser definitivo |

---

## 7. Critério de “bastante privado” para blueprint V1 de formações

Mínimo sugerido:

1. Amostra WhatsApp com saturação (§12 Plano Mineração).  
2. Pelo menos 3 meses de qualidade (Bloco 3 ou equivalente).  
3. Um mês de pedidos com timing (xlsx/jsonl).  
4. Respostas César: 5 erros prioritários + compensação + kit atual.  

Sem isso: manter formações como **preliminares** (este pacote T0B-A).

---

## 8. Confirmações desta missão (T0B-A)

| Item | Status |
|---|---|
| Fontes privadas acessadas | **Não** |
| Fontes privadas no Git | **Não** |
| T0B-B iniciada | **Não** |

---

*Plano de entrada da Camada B · execução só com AUTORIZO T0B-B.*
