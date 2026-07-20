# DESIGN SYSTEM ALIGNMENT — ENTREGAS × DELIVERYOS

| Campo | Valor |
|---|---|
| Data | 2026-07-20 |
| Fase | Identidade soberana + simplicidade |
| Marca provisória | **TATA** |
| Módulo | **ENTREGAS** |
| DeliveryOS | reservado ao **COPILOTO** (não renomear worktrees) |

## 1. O que é compartilhado com DELIVERYOS (irmão, não clone)

| Token / regra | Valor canônico (app-v1 / identidade V3) | Uso no ENTREGAS |
|---|---|---|
| Papel (fundo) | `#F5F3ED` | Superfície operacional |
| Tinta | `#191813` | Texto principal |
| Tinta apoio | `#6C6759` | Secundário |
| Tinta sussurro | `#9C968A` / neutro `#A8A296` | Meta, trip_id discreto |
| Verde operacional | `#2E9E4F` | Ação principal / saúde |
| Atenção (âmbar) | `#9E5220` | Pendência, offline, sem GPS |
| Cartão | `#FFFFFF` | Painéis |
| Tipografia | system UI, display forte, letter-spacing negativo em títulos | Títulos de situação |
| Movimento | surge curto, reduce-motion | Feedback de ação |
| Princípios | serenidade, vazio ≠ erro, luz = informação, sem ranking | Operação de loja/motoboy |

### Comportamento herdado (não jargão Calmo/Ambiente/Foco na UI)

- **Uma ação principal por contexto**
- **Não dashboard de métricas**
- **Não semáforo vermelho/verde de pessoa**
- **Demo fora da gramática de produto** (banner DEMO)

## 2. O que é específico do ENTREGAS

| Específico | Justificativa |
|---|---|
| Densidade maior no console | Operador precisa ver vários pedidos e viagens |
| Lista + detalhe lado a lado (desktop) | Aproveitar horizontal sem mapa decorativo |
| Superfície **Expedição iFood** | Handoff ≠ viagem |
| App motoboy com CTA no polegar | Campo, uma mão, sol |
| Mapa só quando útil | Navegação / contexto de rota — adapter open source |
| Linguagem 100% operacional em PT | Público real da loja |

## 3. Tokens utilizados (ENTREGAS 3C+)

Arquivo: `src/entregas/ui/shared/tokens.css`

```css
--papel / --bg: #F5F3ED
--tinta / --ink: #191813
--tinta-2: #6C6759
--tinta-3: #9C968A
--verde / --accent: #2E9E4F
--atencao / --warn: #9E5220
--cartao: #FFFFFF
--line: #E4DFD4
```

## 4. Mobile vs web

| | Desktop console | Mobile motoboy |
|---|---|---|
| Densidade | Alta, organizada | Baixa, uma ação |
| Layout | Grid multi-coluna / split | Coluna única |
| CTA | Contextual no detalhe | Pílula grande inferior |
| Mapa | Opcional lateral | Só sob demanda / externo |

## 5. Componentes

### Comuns (família TATA)

- Banner DEMO  
- Chip de estado (texto + cor, nunca só cor)  
- Botão pílula verde (ação)  
- Painel branco sobre papel  
- Faixa de erro técnica (não culpa)  
- Estados: loading / vazio / erro / offline  

### Próprios do ENTREGAS

- Formação de viagem (checklist de pedidos)  
- Fila “Aguardando confirmação”  
- Lista de motoboys por estado funcional  
- Expedição iFood (pedido-centrada)  
- Adapter de mapa/navegação externa  

## 6. Diferenças justificadas vs Copiloto

| Não copiar | Motivo |
|---|---|
| Anel “Em fluxo” de produção | Metáfora de cozinha, não de viagem |
| body[data-mode] Calmo/Ambiente/Foco como labels | Jargão cognitivo confunde operação de entrega |
| Mapa de praças | Domínio produção |
| Sidebar de status SaaS | Ruído |

## 7. Linguagem humana (obrigatória)

| Técnico (proibido na UI) | Operacional |
|---|---|
| Trip / aggregate | Viagem |
| Evento de domínio | (omitir) ou “Registro” |
| Outbox / sync | “Aguardando sincronização” |
| delivery_unconfirmed | “Aguardando confirmação” |
| Handoff | “Entregar ao entregador do iFood” / Expedição iFood |

## 8. Critério “1000/10”

Bonito sem decoração · avançado sem dificuldade · inteligente sem ostentação · premium sem complicar · simples de usar · rigoroso por dentro · coerente com a marca · zero licença paga obrigatória de mapa · honesto sobre custo de infra.
