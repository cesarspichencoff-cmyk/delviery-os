# Auditoria — Protótipo Entregas vs COR-ENTREGAS-V1 @ 1.0.3

| Campo | Valor |
|---|---|
| Autoridade | COR-ENTREGAS-V1 @ 1.0.3 (congelado como **normativo**; sem autorização de código) |
| Alvos | `prototipos/entregas-v01` · `docs/entregas-design/*` · `docs/deliveryos/*Entregas*` · WF Desktop (referência) |
| Protótipo correto? | **NÃO** (parcial em intenção; **incorreto** como fonte de verdade) |

---

## 1. Matriz de divergências

| Requisito COR 1.0.3 | Comportamento existente | Avaliação | Ação |
|---|---|---|---|
| Autoridade = COR 1.0.3 | Protótipo/docs design citam Fundação V0.1 / “consciência da viagem” | **incorreto** | **remover** autoridade V0.1; **corrigir** docs |
| `contract_version` em Trip | Ausente no protótipo | **ausente** | **corrigir** na fundação futura |
| Trip = objeto central; `trip_id` antes da saída | Protótipo usa ids `V-10xx` em cenários; sem máquina de eventos imutáveis | **parcialmente correto** | **corrigir** modelo de eventos |
| Pedido próprio = Trip | Cenários de rota própria presentes | **parcialmente correto** | **manter** intenção; **corrigir** estados/eventos |
| iFood = handoff, **não** Trip | Cenário “handoff” mistura handoff de volumes **à Ana** com viagem própria; “handoff de volta” no retorno | **incorreto** | **remover** handoff de volta; **separar** expedição iFood |
| Motoboy da casa **nunca** entrega iFood ao cliente | Não há cenário iFood courier externo claro; handoff parece loja→rider casa | **incorreto / confuso** | **corrigir** nomenclatura e fluxo |
| Estados motoboy: presença ≠ disponibilidade | Design docs afirmam; protótipo pouco expõe `na_loja_apoio_expedicao` / `sem_atualizacao` | **parcialmente correto** | **corrigir** UI/estados |
| GPS só viagem ativa | Fatos de “sessão de localização” em rota | **parcialmente correto** | **manter** ideia; **corrigir** consent/fim explícito |
| GPS/geofence **nunca** → entregue_confirmado | CTA “Confirmar chegada” separado de entrega em alguns fluxos | **parcialmente correto** | **manter** separação; **garantir** testes |
| Confirmação de entrega humana | Presente (“Cliente aceitou · confirmar”) | **correto** (intenção) | **manter** |
| `entrega_sem_confirmacao` não bloqueante | Cenário closePending **bloqueia** fechamento até “handoff de volta”/conferência de volumes | **incorreto** | **corrigir** (G3 pendência ≠ bloquear retorno) |
| `trip_return_started` em_rota→retornando sem require_all_stops | Fechamento exige reconciliação de volumes (PRODUCT_DECISIONS V-06) | **incorreto** vs COR | **remover** bloqueio inventado |
| `active=false` fora G1–G5 | Remoção de stop visual; sem modelo active/removed_* | **ausente** | **corrigir** na fundação |
| Eventos imutáveis (add/remove/reorder) | Estado de UI sobrescreve cenário; sem event log | **incorreto** | **corrigir** |
| Offline occurred_at / synced_at / idempotência | Cenários offline/sync em wireframes WF; protótipo app fraco | **parcialmente correto** (WF) / **ausente** (app) | **corrigir** app futuro |
| Reimpressão ≠ nova Delivery | Fundação V0.1 tem correlação; protótipo visual não exercita | **parcialmente correto** (docs) | **manter** regra COR; **testar** |
| Ocorrências estruturadas (fato/hipótese/fechamento por LE) | Exceções simples na UI | **parcialmente correto** | **corrigir** |
| Ranking / punição / atribuição automática | Não encontrado ranking | **correto** (ausência) | **manter** proibição |
| Acoplamento Capacidade Viva / Foco | Protótipo isolado; app-v1 do monorepo tem motor OV — **não** importar | **risco** | **não acoplar** |
| Volumes bloqueando saída/fechamento (V-01…V-06 design) | Modelo de volumes inventado no design V0.1 | **fora do COR** / **excessivo** | **remover** como bloqueio soberano; parametrizar só se piloto |
| Tentativas max 2 (design) | Inventado no design | **fora do COR** | **não** elevar a norma sem decisão |
| WF Desktop 1.0.1 base COR 1.0.3 | Declara alinhamento a COR | **parcialmente correto** (melhor que app V0.3) | **preferir** WF como referência de UX, sob COR |

---

## 2. Erros do protótipo anterior (lista explícita)

1. **Autoridade errada:** Fundação V0.1 / design V0.x como verdade, não COR 1.0.3.  
2. **Handoff confuso:** “handoff confirmado” = volumes para rider da casa; “handoff de volta” no fechamento — **não** é expedição iFood do contrato.  
3. **Possível confusão iFood × viagem própria** se handoff for lido como fluxo marketplace.  
4. **Fechamento pendente bloqueante** por volumes/retorno — conflita com `entrega_sem_confirmacao` não bloqueante e `trip_return_started` sem exigir todos os stops.  
5. **Sem modelo de eventos imutáveis** (add/remove/reorder).  
6. **Sem `active` / removed_*** em deliveries.  
7. **Sem enumerações COR** de estados de viagem (`preparando_saida`, `em_rota`, `retornando`, `encerrada`, `sem_atualizacao`).  
8. **Volumes como gate de saída/fechamento** inventados no design (não no COR).  
9. **Sem `contract_version`**.  
10. **Sem testes A01–A39**.  
11. **Offline/idempotência** não implementados no app de protótipo.  
12. Auditoria design anterior **não** usou COR 1.0.3 como fonte.

### O que o protótipo **não** cometeu (bom)

- Ranking de motoboys.  
- Punição automática.  
- Atribuição automática forçada.  
- Confirmação de entrega **só** por geofence (há CTA humano).  
- Acoplamento direto com Capacidade Viva no protótipo isolado.

---

## 3. Veredito do protótipo

| Critério | Valor |
|---|---|
| Protótipo anterior correto | **NÃO** |
| Pode ser fonte de verdade | **NÃO** |
| Pode informar UX visual (com cautela) | **PARCIAL** (WF Desktop melhor que app V0.3) |
| Código de produto a partir do protótipo | **NÃO** — recomeçar da fundação COR |

---

## 4. Decisões de retenção

| Artefato | Decisão |
|---|---|
| `prototipos/entregas-v01` | **Arquivar como laboratório visual** — não evoluir como domínio |
| `docs/entregas-design/*` | **Referência secundária**; subordinar a COR |
| `docs/deliveryos/*Entregas*` Fundação V0.1 | **Histórico**; não soberano |
| WF Desktop 1.0.1 | **Referência de UX** alinhada a COR (ainda não é código) |
| COR 1.0.3 em `docs/entregas/cor-v1-0-3/` | **Única autoridade** |

---

*Auditoria retomada · protótipo NÃO é verdade · COR 1.0.3 é.*
