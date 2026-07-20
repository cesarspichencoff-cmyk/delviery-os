# AUDITORIA — APLICATIVO / PROTÓTIPO ANTERIOR DE ENTREGAS

| Campo | Valor |
|---|---|
| Gate | Zero |
| Data | 2026-07-20 |
| Worktree | `deliveryos-entregas-v1` / `feature/entregas-v1` @ `5ac221b` |
| Autoridade de confronto | Fontes reais (planilha, comandas, grupo) + **COR-ENTREGAS-V1@1.0.3** |
| Veredito | Protótipo **não** é fonte de verdade · **não** copiar para código |

---

## 1. O que foi localizado

| Artefato | Path / local | Base declarada |
|---|---|---|
| App protótipo visual V0.3 | `prototipos/entregas-v01/` | Fundação V0.1 + design V0.x |
| Design handoff / jornadas | `docs/entregas-design/*` | Produto V0.1–V0.3 |
| Auditoria de design | `docs/entregas-design-audit/*` | Fundação V0.1 (não COR) |
| Fundação domínio Grok | `docs/deliveryos/*Entregas*`, `Fundacao_Dominio_Entregas_V0_1.md` | Modelo paralelo pré-COR |
| Wireframes Desktop | `Desktop/WF_ENTREGAS_*` | Declaram COR 1.0.3 (melhor alinhamento UX) |
| Auditoria retomada | `docs/entregas/auditoria-retomada/01_*` | vs COR 1.0.3 |
| COR importado | `docs/entregas/cor-v1-0-3/` | Normativo redação/aceitação; **sem** auth código |

**Nada foi apagado.** Arquivar como laboratório visual, não evoluir como domínio.

---

## 2. Classificação peça a peça

Legenda: **fiel** · **parcial** · **incorreto** · **ausente** · **perigoso** · **reutilizável** · **remover**

### 2.1 Autoridade e modelo

| Parte | vs fontes reais | vs COR 1.0.3 | Classificação | Ação |
|---|---|---|---|---|
| Autoridade = Fundação V0.1 | ignora planilha trip_id gap de forma normativa fraca | COR é soberano | **incorreto** | **remover** autoridade V0.1 |
| contract_version em Trip | N/A no real (não existe trip) | obrigatório | **ausente** | implementar só pós-auth |
| Trip como objeto central | real = form ida sem id | COR exige trip_id pré-saída | **parcial** (intenção) | **corrigir** |
| Eventos imutáveis add/remove/reorder | real = sobrescrita no chat | COR exige eventos | **incorreto** / ausente no app | **corrigir** na fundação |
| active=false / removed_* | real: remove no chat | COR G1–G5 | **ausente** | **corrigir** |

### 2.2 Fluxos

| Parte | vs real | vs COR | Class. | Ação |
|---|---|---|---|---|
| Multi-pedido por viagem | **fiel** à planilha (até 5) | fiel | **fiel** / **reutilizável** intenção | manter |
| Ida/volta como eixos | **fiel** aos forms | fideliza e amplia | **parcial** | manter eixos; ids |
| Handoff = volumes à Ana / “handoff de volta” | real iFood = courier **externo** | handoff ≠ Trip; sem handoff de volta | **incorreto** / **perigoso** | **remover** |
| iFood como Trip do motoboy casa | real: **não** | proibido | **incorreto** | **remover** |
| Confirmação entrega humana | real: implícita | COR: CTA humano | **parcial** / boa intenção | **manter** CTA |
| Fechamento bloqueado por volumes / “close pending” | real: volta genérica | entrega_sem_confirmacao **não** bloqueia | **incorreto** | **remover** bloqueio |
| trip_return_started exige todos stops | real: não | COR D-301: **não** exige | **incorreto** | alinhar COR |
| GPS → entregue | protótipo em geral separa | COR proíbe | **parcial** bom | garantir testes A |
| Ranking / auto-assign | não encontrado | proibido | **fiel** (ausência) | **manter** proibição |
| Volumes gate saída (design V-01…) | real: chat “faltou” | fora COR soberano | **perigoso** se virar norma | **remover** como gate soberano |
| Tentativas max 2 (design) | inventado | fora COR | **incorreto** | não elevar |

### 2.3 Estados

| Estado COR | Protótipo | Class. |
|---|---|---|
| preparando_saida / em_rota / retornando / encerrada / sem_atualizacao | parcial / nomenclatura UI | **parcial** |
| chegada_detectada ≠ entregue_confirmado | parcialmente separado | **parcial** |
| entrega_sem_confirmacao não bloqueante | **incorreto** no close pending | **incorreto** |
| apoio_expedicao ≠ disponivel | pouco exposto | **parcial** |
| active=false | ausente | **ausente** |

### 2.4 UX / wireframes

| Parte | Class. | Nota |
|---|---|---|
| `prototipos/entregas-v01` visual | **reutilizável com cautela** | só layout; domínio errado |
| WF Desktop 1.0.1 | **parcialmente fiel** / melhor referência UX | subordinar a COR + fontes |
| Docs design EXCEPTION_TAXONOMY | **parcial** | reescrever sob ocorrências COR |
| Offline/sync WF | **parcial** | app fraco; COR exige occurred/synced |

### 2.5 Fundação V0.1 (docs deliveryos)

| Parte | Class. | Nota |
|---|---|---|
| Separação própria × marketplace | **fiel** às fontes | reutilizável conceitualmente |
| PrintedArtifact / correlação | **fiel** ao problema real de comandas | manter regras anti-dup |
| 25 objetos | **parcial** | renomear/alinhar a COR (Trip/Delivery/Handoff/Occurrence) |
| GPSConsentSession | alinhado privacidade | reutilizável pós-auth |
| MarketplaceHandoff | **fiel** intenção | protótipo UI confundiu |

---

## 3. O que o app anterior **acertou** (relativo às fontes reais)

1. Viagem multi-pedido existe na vida real (planilha).  
2. Há ciclo ida → rota → volta.  
3. Confirmação humana de entrega é desejável (hoje frágil).  
4. Exceções existem e precisam de UI (hoje só WhatsApp).  
5. Não implementou ranking nem punição.  
6. Fundação documental separou marketplace de viagem própria (docs; app visual falhou na nomenclatura).  
7. Ideia de correlação de impressões (docs) casa com comandas reais multi-layout.

---

## 4. O que o app anterior **errou**

1. **Autoridade errada** (V0.1 em vez de COR + fontes).  
2. **Handoff de volta** e handoff misturado com rider da casa — conflita com iFood real e COR.  
3. **Bloqueio de fechamento** por volumes/pendências — conflita com operação (volta genérica) e COR.  
4. **Sem trip_id / eventos imutáveis** — exatamente a dor da planilha, não resolvida.  
5. **Sem active/removed** em paradas.  
6. **Volumes e tentativas** elevados a regra de produto sem base nas fontes/COR.  
7. **Sem testes A01–A39**.  
8. **Offline/idempotência** não no app.  
9. Design audit anterior **não** usou COR 1.0.3.  
10. Protótipo pode induzir a copiar telas **antes** de validar operação com César (risco Gate Zero).

---

## 5. Matriz rápida retenção

| Artefato | Decisão |
|---|---|
| `prototipos/entregas-v01` | Arquivo visual · **não** evoluir domínio |
| `docs/entregas-design/*` | Secundário · subordinar COR + Gate Zero |
| `docs/deliveryos/*Entregas*` V0.1 | Histórico · ideias seletivas |
| WF Desktop | Referência UX sob COR |
| COR 1.0.3 | Autoridade de **segurança/consistência** |
| Fontes reais (este gate) | Autoridade de **como funciona hoje** |
| Confirmação César | Autoridade de **validação** |

---

## 6. Perigos se alguém “continuar o protótipo”

| Ação | Por que é perigoso |
|---|---|
| Migrar cenários de handoff do V0.3 | Treina operação errada de iFood |
| Implementar close pending bloqueante | Congela disponibilidade sem base real/COR |
| Copiar modelo de volumes como gate | Inventa fricção que a planilha não tem |
| Usar Fundação V0.1 como schema DB | Divergência de contract_version e eventos |
| Skip Gate Zero | Retrabalho garantido |

---

## 7. Conclusão da auditoria

| Pergunta | Resposta |
|---|---|
| O app anterior representa a operação real? | **Parcialmente** na intenção multi-stop; **não** nos detalhes iFood, ids, eventos |
| Pode ser fonte de implementação? | **NÃO** |
| O que reutilizar? | Intuição multi-pedido; separação própria/marketplace nos **docs**; WF como esboço UX |
| O que remover da cabeça do projeto? | Handoff de volta; bloqueio por volumes; autoridade V0.1 |

---

*AUDITORIA_APP_ENTREGAS_ANTERIOR · Gate Zero · protótipo arquivado como laboratório.*
