# Métricas e Governança de Aprendizado — L8

> Métricas de **comportamento e autonomia**. Conclusão de curso é **secundária**.  
> Sem ranking. Sem placar público de erros.

---

## 1. Métricas principais da Fase 1

### M1 — Repetição dos erros prioritários
| Campo | Conteúdo |
|---|---|
| Objetivo | Ver se omissão/kit/comunicação/sacola se repetem menos após treino |
| Fonte | Casos capturados · L5 temas (agregado) · notas LE (tema, não pessoa pública) |
| Baseline | Temas L5/L6A (qualitativo + taxas L2C onde couber, sem forçar) |
| Unidade | Contagem de ocorrências por tema / 100 pedidos ou por semana de captura |
| Periodicidade | Mensal no piloto; trimestral depois |
| Risco de interpretação | Atribuir a pessoa; subnotificação se cultura de medo |
| Uso permitido | Priorizar conteúdo e processo |
| Uso proibido | Ranking individual; punição automática |

### M2 — Dependência da liderança para decisões rotineiras
| Campo | Conteúdo |
|---|---|
| Objetivo | Reduzir “pode?” genérico no que já tem regra/protocolo |
| Fonte | Amostra WA/observação (agregada); percepção LE |
| Baseline | L1 hub cognitivo (qualitativo) |
| Unidade | % de consultas classificadas como rotineiras vs estratégicas (amostra) |
| Periodicidade | No piloto: semanal qualitativo; depois mensal amostra |
| Risco | Contar toda pergunta como “má” |
| Uso permitido | Ver autonomia da matriz |
| Uso proibido | Silenciar dúvidas de segurança |

### M3 — Qualidade do escalonamento
| Campo | Conteúdo |
|---|---|
| Objetivo | ESTADO+IMPACTO+AÇÃO presente |
| Fonte | Amostra de mensagens / simulações S |
| Baseline | Padrão “cadê?” documentado como indesejado |
| Unidade | % amostra com os 3 elementos |
| Periodicidade | Mensal amostra |
| Risco | Template vazio preenchido mecanicamente |
| Uso permitido | Treino F1/P10 |
| Uso proibido | Score público por pessoa |

### M4 — Aplicação prática de competências
| Campo | Conteúdo |
|---|---|
| Objetivo | Provas B registradas |
| Fonte | Passaporte / validações LE |
| Baseline | 0 no início do app; no piloto papel |
| Unidade | Nº de B aprovadas por competência âncora / período |
| Periodicidade | Semanal no piloto |
| Risco | Validação de favor |
| Uso permitido | Avanço de marcos |
| Uso proibido | Comparar pessoas em mural |

### M5 — Tempo até autonomia por função
| Campo | Conteúdo |
|---|---|
| Objetivo | Quanto tempo até marcos da matriz (não promoção) |
| Fonte | Datas de provas C / marcos |
| Baseline | A definir no primeiro coorte (sem inventar meta %) |
| Unidade | Dias até marco âncora por função |
| Periodicidade | Por coorte |
| Risco | Pressão por velocidade vs qualidade |
| Uso permitido | Desenho de trilha |
| Uso proibido | Meta rígida de promoção |

### M6 — Fechamento de ciclos com cliente
| Campo | Conteúdo |
|---|---|
| Objetivo | SAC fecha com resultado registrado |
| Fonte | Registro SAC (futuro) · amostra piloto |
| Baseline | L5 sem reply no export = lacuna |
| Unidade | % ciclos com encerramento explícito (amostra) |
| Periodicidade | Mensal quando houver dado |
| Risco | Fechar no papel sem cliente ok |
| Uso permitido | F2 e processo SAC |
| Uso proibido | Meta de “sempre dar desconto” |

### M7 — Uso correto de protocolos
| Campo | Conteúdo |
|---|---|
| Objetivo | P1–P12 aplicados quando gatilho existe |
| Fonte | Observação LE · registros de pausa |
| Baseline | Fragmentado pré-L6B |
| Unidade | Checklist de aderência em amostragem de turnos |
| Periodicidade | Quinzenal no piloto |
| Risco | Teatro só quando observado |
| Uso permitido | Reescrever protocolo |
| Uso proibido | Auditoria punitiva pública |

### M8 — Consistência após treinamento
| Campo | Conteúdo |
|---|---|
| Objetivo | Manter B na janela C |
| Fonte | Passaporte |
| Baseline | Janelas candidatas L6B |
| Unidade | % competências com C na janela / coorte |
| Periodicidade | Por coorte |
| Risco | Janela arbitrária |
| Uso permitido | Calibrar prazos (decisão César) |
| Uso proibido | Ranking de “consistentes” |

### M9 — Qualidade de comunicação
| Campo | Conteúdo |
|---|---|
| Objetivo | Queda de cobrança vazia; clareza multi-sacola etc. |
| Fonte | Amostra canal + C-CX05 |
| Baseline | L1/L6A |
| Unidade | Rubrica 0–2 em amostra |
| Periodicidade | Mensal |
| Risco | Julgar estilo, não clareza |
| Uso permitido | Treino linguagem |
| Uso proibido | Placar de “comunicação” |

### M10 — Casos transformados em aprendizado
| Campo | Conteúdo |
|---|---|
| Objetivo | Fluxo de governança funcionando |
| Fonte | Registro de conteúdo |
| Baseline | 0 formal |
| Unidade | Nº casos → proposta aprovada / mês |
| Periodicidade | Mensal |
| Risco | Volume sem qualidade |
| Uso permitido | Memória viva |
| Uso proibido | Toda ocorrência vira regra |

### Métricas secundárias
- Conclusão de microlições (%).  
- Tempo médio por microlição.  
- NPS interno do piloto (3 perguntas).

---

## 2. Governança do conteúdo

### 2.1 Fluxo

```text
caso
  → registro (4 perguntas Visão Mestra)
  → revisão humana
  → classificação (tema, formação, protocolo)
  → proposta de aprendizado
  → aprovação (César ou delegado)
  → formação | procedimento | comunicação | sistema
  → acompanhamento
  → revisão
```

**Nenhuma ocorrência isolada vira regra automática.**

### 2.2 Metadados obrigatórios de cada conteúdo

| Campo | Descrição |
|---|---|
| owner | Responsável humano |
| versao | Semver ou data |
| fonte | Lote/doc origem |
| data_aprovacao | — |
| validade | Até quando |
| proxima_revisao | Data |
| impacto | Formação / processo / sistema |
| competencias | IDs C-* |
| protocolos_relacionados | P1–P12 |
| status | ver §2.3 |

### 2.3 Status de conteúdo

| Status | Significado |
|---|---|
| rascunho | Em escrita |
| em_validacao | Aguardando César/LE |
| aprovado | Pode ir a piloto |
| em_piloto | Em uso controlado |
| vigente | Pós-T4 se confirmado |
| necessita_revisao | Atrito ou contradição |
| substituido | Há versão nova |
| arquivado | Fora de uso |

### 2.4 Regras provisórias R-L6B-05…11

Status inicial do piloto: **em_piloto** (provisórias oficiais controladas).  
Reavaliar após: aplicação · observação · feedback · evidência · piloto 30 dias.

### 2.5 Papéis

| Papel | Pode |
|---|---|
| César | Aprovar regra, $ , arquivar, promover a vigente |
| LE | Registrar caso, validar prova B, propor |
| Formador/produção | Rascunhar microlição |
| IA | Organizar, sugerir classificação — **não** aprovar regra |

---

## 3. Ligação com métricas proibidas

Não criar: ranking, score de erro individual público, 45/55/65 como KPI, “dias sem erro” placar.

---

*Métricas + Governança L8 · comportamento primeiro · conteúdo versionado.*
