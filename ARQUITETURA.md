# Arquitetura conceitual — DeliveryOS

> Régua única de toda decisão: **isso respeita ou contradiz a tese?**
> Tese: em operação de alta rotatividade e tempo real, memória que exige ato separado decai e
> não se auto-restaura. Só sobrevive a memória que nasce como **subproduto do trabalho**.

## Cortar imediatamente se
- contradiz a tese;
- depende de **preenchimento manual**;
- depende de **disciplina constante** da equipe para sobreviver;
- é bonito mas **não nasce do trabalho real**.

Toda ideia nova é comparada com a fundação e declarada como **fortalece** ou **enfraquece** a tese.
Entre duas soluções, escolhe-se a **menor e mais alinhada**. Objetivo: **nova categoria**, não um ERP.

## Camadas (separação inegociável)

| Camada | O que é | Status |
|---|---|---|
| **0 — Memória passiva** | derivada de eventos **já emitidos** (iFood, SAC, review). Escuta → transição append-only → projeções. Nada toca o chão. | **APROVADA** (`src/core`) |
| **1 — Primeiro evento físico** | um gesto do trabalho real (lacre/conferência) que **emite** estado, fundido a um ato já existente, nunca formulário. | **CONGELADA** (espera validação do chão) |
| **2 — Disponibilidade precisa** | risco operacional mais fino, ainda sem estoque contábil. | depois |
| **3 — Orientação / maestro** | apoio ao julgamento humano (ler gargalo). Mostra estado; nunca decide. | depois |

Regras estruturais do código:
- átomo = **transição** (`Transicao`); pedido = só a chave; memória = histórico append-only.
- **replay-safe**: dedup por `event_id` determinístico. Nunca sobrescrever estado.
- dimensões separadas: **estado_fluxo × estado_desfecho** (desfecho não apaga fluxo).
- disponibilidade = **risco** (pausado / crítico-do-pedido / consumo teórico / ritmo / impacto).
  **Proibido** "restam N unidades" sem contagem inicial.
- nada de Camada 1/2/3 misturado na Camada 0.

## Antes de descongelar a Camada 1 (validação do chão — pendente)
1. Quem dá o "pronto" no iFood?  2. Onde?  3. A conferência é rotina hoje?
4. O ponto do lacre comporta leitura (tela/leitor)?
O gesto do lacre só nasce se **substituir** um ato já existente (não virar pedágio).
