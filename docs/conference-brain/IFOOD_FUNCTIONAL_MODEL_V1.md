# Modelo funcional oficial do Gestor de Pedidos iFood — Sprint 2.1

> **Separação obrigatória, sem exceção neste documento inteiro:**
> **Funcionalidade oficial documentada** (o que o iFood publica para parceiros)
> ≠ **hipótese de implementação** (o vocabulário que este projeto escolheu) ≠
> **comportamento observado no código** (o que roda hoje) ≠ **só sessão real**
> (seletor, layout exato da conta TATÁ, recursos habilitados — nada disto foi
> visto nesta missão). Cada afirmação abaixo é marcada com uma dessas quatro
> categorias.

## 1. Fontes consultadas

Domínio oficial `blog-parceiros.ifood.com.br`, consultado em **2026-07-21**.
Materiais públicos de marketing/suporte — **não são documentação de DOM**.

| Título | URL | Atualização | Categoria |
|---|---|---|---|
| Conheça a Nova jornada de Pedidos no Gestor | blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/ | 16/07/2026 | funcionalidade oficial |
| Gestor de Pedidos iFood: saiba como funciona | blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/ | 17/07/2026 | funcionalidade oficial |
| Botão Pronto: como otimizar a chegada do entregador | blog-parceiros.ifood.com.br/botao-pronto/ | 07/07/2025 | funcionalidade oficial |
| Confirmação de chegada QR Code | blog-parceiros.ifood.com.br/confirmacao-de-chegada-qr-code/ | 20/07/2026 | funcionalidade oficial (recurso **opcional**) |

Nenhuma dessas páginas expõe seletor, classe CSS ou estrutura de DOM da conta
TATÁ — isso só a sessão supervisionada (não realizada) pode confirmar.

## 2. Dois modos de visualização (funcionalidade oficial)

O Gestor de Pedidos tem **dois modos**: **Expedição** (alta densidade,
otimizado para operação corrida) e **Quadros** (colunas por etapa, estilo
kanban). Ambos mostram os mesmos pedidos — a alternância entre eles não cria
nem duplica pedido nenhum.

**Hipótese de implementação:** `LAYOUT_MODE.EXPEDITION` / `LAYOUT_MODE.BOARDS`
(`contracts/live-states.js`), com URLs candidatas `expedition`/`kanban`
(hipótese de rota, nunca confirmada).

## 3. Jornada e colunas (funcionalidade oficial)

Jornada: **Aceitar → Em preparo → Pronto(s) → Entregando → Finalizados**, mais
as abas **Agendados** e **Cancelados**.

**Hipótese de implementação:** `ORDER_STATE` (produção, sem logística) +
`VISUAL_LOCATION` (a coluna/seção onde o cartão apareceu — dimensão
SEPARADA, porque a coluna é fato de tela, não fato de produção).

## 4. Botão "Avisar Pedido Pronto" (funcionalidade oficial)

Ação disponível nos **detalhes do pedido**: "Avisar Pedido Pronto" — ao ser
acionada, notifica o entregador e alimenta o modelo de tempo de preparo do
iFood. **Não é o mesmo fato que "estar na coluna Pronto"** — um pedido pode
estar visualmente em Pronto com o botão ainda disponível (ninguém tocou nele).

**Hipótese de implementação:** `READINESS_STATE` + `available_actions[]`
(`ACTION_CODES.NOTIFY_READY`) — dimensão separada de `order_state` e de
`visual_location`. **Comportamento observado no código:** o observador NUNCA
clica neste botão — só registra se ele está presente/disponível/desabilitado
(`live/multidimensional-observation.js#buildReadinessDimension`).

## 5. Confirmação de chegada por QR Code (funcionalidade oficial, RECURSO OPCIONAL)

O iFood oferece confirmação de chegada do entregador por QR Code como
**recurso opcional** — com fallback por geolocalização quando não usado.
**Isso não prova que a conta TATÁ tem o recurso ativo.**

**Hipótese de implementação:** `courier.qr_code` com três valores —
`present` / `absent` / `unknown` — nunca dois. Ausência de QR nunca é lida
como ausência de entregador (`live/multidimensional-observation.js#buildCourierDimension`).

## 6. Pedidos agrupados (funcionalidade oficial)

Pedidos do mesmo entregador podem aparecer **agrupados**, com um ícone de
vínculo entre os cartões.

**Hipótese de implementação:** `live/grouping.js` — cada pedido mantém
identidade própria sempre; o grupo é uma referência, nunca um pedido "de
verdade" que substitui os membros.

## 7. Pedidos agendados (funcionalidade oficial)

Aba própria "Agendados" para pedidos com entrega futura marcada.

**Hipótese de implementação:** `live/schedule.js` — um pedido agendado não
conta como carga ativa até estar perto do horário (política do consumidor,
não do módulo); a transição para produção é detectável (`scheduleTransition`).

## 8. Loja aberta/fechada e conectividade (funcionalidade oficial)

O canto superior do Gestor mostra o estado da loja: aberta, fechada por
horário programado, ou problemas de conexão/atraso operacional.

**Hipótese de implementação:** `STORE_STATE`, **separado** da saúde técnica
da fonte (`LIVE_SOURCE_HEALTH`) — loja fechada não é "fonte indisponível";
zero pedidos com loja aberta não é "layout quebrado" (`live/store-state.js`,
`live/health.js` Fase 15).

## 9. Sinais operacionais nos cartões (funcionalidade oficial)

Tags de tempo de preparo restante, alerta de metade do tempo, atraso,
"procurando entregador", ETA, chat pendente, negociação — todos documentados
como recursos do painel de expedição.

**Hipótese de implementação:** `INDICATOR_CODES` + `live/indicators.js`, cada
um classificado corretamente (indicador/alerta/estado/atributo/evento) — nunca
convertido em `order_state` por atalho.

## 10. O que continua sem confirmação nesta missão

- se a conta TATÁ usa modo Expedição, Quadros, ou os dois;
- se o QR Code de chegada está habilitado;
- os seletores reais de qualquer elemento;
- os textos EXATOS que aparecem na tela (os usados no código são hipótese,
  ver `docs/conference-brain/STATUS_MAPPING_V1.md`);
- se a conta tem mais de uma unidade cadastrada.

Só uma sessão supervisionada (Modo de Mapeamento, Fase 14, não iniciado) pode
confirmar qualquer item desta lista.
