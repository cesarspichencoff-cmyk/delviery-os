# Arquitetura da Experiência — Entregas V0.1

---

## 1. Objeto principal

**A viagem (`Trip`) é o objeto principal** no desktop e o contexto raiz no mobile.

Não: grade genérica de cards de pedidos · mapa central · dashboard de frota.

---

## 2. Desktop — Mesa de Expedição

### 2.1 Função
Acompanhar o ciclo: preparação → conferência → atribuição → saída → viagem → exceções → retorno → fechamento.

### 2.2 Estrutura de informação (hierarquia)

```
[ Filas de atenção operacional ]     ← só o que precisa ação na loja
   waiting_assignment | handoff_pending | volume_divergence | under_review | return_provisional | sync_conflict

[ Viagens ativas ]                   ← objeto principal
   uma linha/faixa por Trip: estado · rider · N stops · pendências

[ Detalhe da viagem selecionada ]
   linha do tempo da viagem
   paradas ordenadas
   volumes
   attempts / exceções
   handoffs
   sync / desconhecidos
```

### 2.3 Superfícies (conceituais — não wireframes)

| Zona | Conteúdo | Não é |
|---|---|---|
| Fila loja | Pedidos ready sem trip; handoff marketplace | Foco do Copiloto |
| Montagem | Criar trip, ordenar stops, volumes_checked | ERP |
| Atribuição | Rider **disponível** (não só presente) | Ranking de riders |
| Saída | Bloqueio se divergência; DepartureEvent | Mapa |
| Ao vivo | Estados trip; stale; incidents | Tracker punitivo |
| Retorno/fechamento | Return confirm; reconciliação volumes | “Tudo ok” silencioso |

### 2.4 Mapa no desktop
Oculto por padrão. Opcional no detalhe de uma trip **sem** ser o centro da mesa.

### 2.5 Papéis
LE / expedição / AO conforme operação; handoff por **position_role**.

---

## 3. Mobile — Próximo Passo (entregador)

### 3.1 Princípios
- Uma mão  
- Baixa leitura em deslocamento  
- **Uma ação dominante** por tela  
- Funciona offline  
- Fato confirmado ≠ pendente de sync (visual distinto)

### 3.2 Modelo mental

```
Viagem atual
  └─ Próxima ação (único CTA forte)
       · ir à parada N
       · confirmar chegada (se usado)
       · confirmar entrega + volumes
       · registrar exceção
       · iniciar retorno
       · confirmar chegada à loja
  └─ Lista compacta das paradas (ordem)
  └─ Estado: online | offline | k pendentes de sync
```

### 3.3 Conteúdo obrigatório por momento

| Momento | Mostra | CTA |
|---|---|---|
| Pré-saída | volumes received vs expected; stops | Confirmar coleta / Pronto para sair |
| Em rota | parada atual: ref operacional, volumes | Cheguei / Entregar / Exceção |
| Pós-parada | próxima parada ou “retornar” | Continuar |
| Retorno | volumes a devolver | Cheguei na loja |
| Offline | badge + fila local | Mesmas ações; marca pending |

### 3.4 Referência operacional
Endereço **mínimo** + complemento/ref (não despejar PII extra).  
Sem mapa obrigatório.

### 3.5 Excluir do mobile V0.1
Ranking · KPIs · chat · histórico GPS · financeiro · multi-viagem complexa · admin.

---

## 4. Modelo visual conceitual (linguagem, não brand novo)

### 4.1 Família
Mesma família **premium, calma, operacional** do DeliveryOS / Campo Vivo.  
**Não** criar identidade concorrente.  
Entregas adapta a metáfora: **linha da viagem** em vez de “praça de produção”.

### 4.2 Elementos

| Elemento | Significado |
|---|---|
| **Linha contínua da viagem** | Trip do início (preparação) ao fechamento |
| **Paradas** | Nós na linha (pending / done / skipped / exception) |
| **Handoffs** | Marcos de transferência (loja→rider, rider→cliente, marketplace) |
| **Confirmações** | Nós “sólidos” (fato) |
| **Interrupções** | Quebra/marcador de exceção na linha |
| **Retorno** | Segmento de volta à loja |
| **Fechamento** | Terminal da linha só se comprovado |

### 4.3 Epistemologia visual

| Aparência | Significa |
|---|---|
| Sólido / confirmado | Fato registrado e (se online) sync ok |
| Tracejado / suave | Inferido, provisional, ou pending sync |
| Âmbar operacional | Precisa ação (não “alarme de pessoa”) |
| Técnico neutro | Offline, conflito, dado stale — sem culpar |

Incompleto e não sincronizado **devem** parecer diferentes de confirmado.

### 4.4 O que evitar visualmente
Mapa hero · heatmaps · avatares rankeados · confetes de gamificação · sirenes · cards KPI.

---

## 5. Desktop × Mobile (mesmo domínio)

| Conceito | Desktop | Mobile |
|---|---|---|
| Trip | objeto de gestão | contexto fixo da sessão |
| Stops | lista editável (pré-saída) | ordem fixa em rota (só LE reordena com regra) |
| Exceção | fila + detalhe | registro rápido E01–E10 |
| Volumes | reconciliação | contagem nos marcos |
| Offline | conflitos na mesa | pending no device |

---

## 6. Fronteira com Copiloto (UX)

Entregas **não** mostra Calmo/Ambiente/Foco da operação inteira.  
Pode mostrar **estado da viagem** e filas da mesa.  
Copiloto consome fatos (fila de saída, stale, handoff) — ver audit `COPILOT_BOUNDARY.md`.
