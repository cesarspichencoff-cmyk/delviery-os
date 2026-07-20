# Composições corrigidas — revisão pós-aprovação de direção

| Campo | Valor |
|---|---|
| Status | **AGUARDA APROVAÇÃO FINAL DO CÉSAR** |
| Data | 2026-07-20 |
| Direção visual | Aprovada (rodada anterior) |
| Redesign de código | **NÃO autorizado** |
| Artefato | [`composicoes-v2/CORRECOES_OBRIGATORIAS.html`](composicoes-v2/CORRECOES_OBRIGATORIAS.html) |

Apresentar **somente** as composições alteradas nesta rodada.

---

## Correções obrigatórias (checklist)

| # | Correção | Como aparece nas comps |
|---|---|---|
| 1 | Sem jargão técnico na UI | Zero “Handoff”, zero nomes de campo/domínio/contrato |
| 2 | Expedição iFood sem mapa decorativo | Pedido · entregador · volumes · responsável · liberar |
| 3 | Mobile por estado de domínio | A caminho → Abrir rota · No local → Cheguei · Chegada → Confirmar entrega · Problema secundário |
| 4 | Sync automática | Banner informativo; “Enviar agora” só secundário discreto |
| 5 | Sem inteligência simulada | Sem ordem por bairro, mapa vivo, tempo no endereço, posição como fato |
| 6 | Cartografia | Direção mantida; **pendente prova MapLibre real** |
| 7 | Escopo desta revisão | Só as 6 comps listadas abaixo |

---

## Composições desta revisão

### 1. Mobile — a caminho (antes da chegada)

| Campo | Conteúdo |
|---|---|
| Estado | A caminho |
| Ação soberana | **Abrir rota** |
| Não mostrar | Confirmar entrega · Cheguei |
| Mapa | Destino da parada; sem posição do motoboy |
| Problema | “Cliente não encontrado” / “Registrar problema” (secundário) |

### 2. Mobile — depois da chegada

| Campo | Conteúdo |
|---|---|
| Estado | Chegada registrada |
| Ação soberana | **Confirmar entrega** |
| Intermediário documentado | No local (sem registro) → só **Cheguei** |
| Sem evidência falsa | Sem “há X min no endereço” |

### 3. Mobile — offline

| Campo | Conteúdo |
|---|---|
| Sync | Automática (“sobem sozinhas quando a rede voltar”) |
| Ação soberana | A do estado da parada |
| Secundário | “Enviar agora (se a rede voltou)” — discreto |
| Proibido | Motoboy como administrador de sincronização |

### 4. Expedição iFood

| Campo | Conteúdo |
|---|---|
| Mapa | **Removido** |
| Blocos | Pedido · Entregador na porta (código) · Volumes · Quem libera na casa |
| Ação soberana | **Liberar pedido** |
| Linguagem | Humana; entregador iFood não é usuário do módulo |
| Jargão | Nenhum |

### 5. Console — sem GPS (produto de hoje)

| Campo | Conteúdo |
|---|---|
| Dados | Pedidos, ordem, estados, confirmações, motoboy da casa |
| Ausente | Posição, tempo no local, rota “ao vivo” |
| Mapa / superfície | Destinos da viagem como chips de endereço |
| Atenção | Parada aguardando confirmação |
| Ação soberana | Ver parada 2 |

### 6. Console — GPS futuro (marcado)

| Campo | Conteúdo |
|---|---|
| Status | **Visão futura · GPS** — selo sempre visível |
| Conteúdo | Posição, tempo no endereço, rota desenhada — todos rotulados futuro |
| Condição | GPS real + consentimento + MapLibre com skin aprovada |
| Proibido | Tratar como tela do produto atual |

---

## Fluxo mobile por estado (referência)

```text
a caminho        → Abrir rota
no local         → Cheguei
chegada reg.     → Confirmar entrega
problema         → Cliente não encontrado / Registrar problema
```

Nunca mostrar ação antes de ser válida no domínio.

---

## Cartografia

A linguagem (tiles quentes, rota com solidez, pins de estado) permanece a direção.  
**Ainda precisa ser comprovada em MapLibre real** antes da aprovação final da cartografia.

---

## Fora de escopo desta rodada

- Redesign de código  
- Domínio / contratos / persistência / ApplicationService  
- Shell, Copiloto, GPS real  
- Push / deploy  

## Após aprovação final

Só então: reconstruir a camada visual, preservando o núcleo operacional já aprovado.
