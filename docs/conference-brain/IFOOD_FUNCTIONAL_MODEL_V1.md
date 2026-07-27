# Modelo funcional oficial do Gestor de Pedidos iFood — Sprint 2.1

> **Separação obrigatória, sem exceção neste documento inteiro:**
> **Funcionalidade oficial documentada** (o que o iFood publica para parceiros)
> ≠ **hipótese de implementação** (o vocabulário que este projeto escolheu) ≠
> **comportamento observado no código** (o que roda hoje) ≠ **só sessão real**
> (seletor, layout exato da conta TATÁ, recursos habilitados — nada disto foi
> visto nesta missão). Cada afirmação abaixo é marcada com uma dessas quatro
> categorias.

## 1. Fontes consultadas

Domínio oficial `blog-parceiros.ifood.com.br`. Materiais públicos de
marketing/suporte — **não são documentação de DOM**.

> **Correção (Sprint 2.2, bloqueador 15):** a versão anterior tinha uma única
> coluna "Atualização", sem dizer se era a data de PUBLICAÇÃO ou de
> ATUALIZAÇÃO do artigo — uma ambiguidade real, apontada pela rechecagem
> independente do Sprint 2.1. A tabela abaixo separa quatro coisas que nunca
> podem ser confundidas: a data DECLARADA na página como "Publicado" (mais
> estável), a data DECLARADA como "Atualizado" (campo dinâmico de CMS —
> nunca tratado como fato normativo do conteúdo, só como o que a página
> afirma no momento da consulta) e a data da CONSULTA de cada verificação
> independente já feita.
>
> **Correção (Sprint 2.3, bloqueador 7):** a rechecagem independente do
> Sprint 2.2, em consulta de 2026-07-24, registrou datas de "Atualizado"
> diferentes das do documento original para "Nova jornada de Pedidos"
> (05/05/2026, não 16/07/2026) e "Confirmação de chegada QR Code"
> (25/08/2025, não 20/07/2026). Esta correção refez a consulta às 4 páginas
> — de novo, de forma independente, em **2026-07-24** — e obteve o MESMO
> resultado do documento original nas 4, inclusive nas duas contestadas:
> `painel-de-expedicao-gestor-de-pedidos/` → 16/07/2026; `gestor-de-pedidos-
> ifood/` → 17/07/2026, sem redirecionamento; `confirmacao-de-chegada-qr-
> code/` → 20/07/2026. Contando a consulta original (Sprint 2.1) e a
> reverificação do Sprint 2.2 (2026-07-22), são **3 consultas
> independentes, em 2 dias diferentes, concordando entre si** contra **1**
> consulta (a rechecagem) com números divergentes. Isso não prova qual
> consulta está certa — datas de CMS podem mudar a qualquer momento — mas é
> evidência suficiente para não tratar a divergência como um erro deste
> documento sem mais indício. Nenhuma data de "Atualizado" é apresentada
> como fato normativo do conteúdo (a mission exige isso explicitamente):
> serve só de contexto sobre quando o artigo pode ter mudado, nunca como
> prova de que o CONTEÚDO funcional citado abaixo mudou.

| Título | URL | Publicado (declarado) | Atualizado (declarado, CMS dinâmico) | Consultas independentes concordantes | Categoria |
|---|---|---|---|---|---|
| Conheça a Nova jornada de Pedidos no Gestor | blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/ | 22/05/2025 | 16/07/2026 | 2026-07-21 (Sprint 2.1) · 2026-07-22 · 2026-07-24 (3/3) | funcionalidade oficial |
| Gestor de Pedidos iFood: saiba como funciona | blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/ | 30/06/2026 | 17/07/2026 | 2026-07-22 · 2026-07-24 (2/2) | funcionalidade oficial |
| Botão Pronto: como otimizar a chegada do entregador | blog-parceiros.ifood.com.br/botao-pronto/ | 19/12/2022 | 07/07/2025 | 2026-07-22 · rechecagem 2026-07-24 (2/2, sem divergência) | funcionalidade oficial |
| Confirmação de chegada QR Code | blog-parceiros.ifood.com.br/confirmacao-de-chegada-qr-code/ | 04/07/2025 | 20/07/2026 | 2026-07-22 · 2026-07-24 (2/2) | funcionalidade oficial (recurso **opcional**) |

Nenhuma afirmação de suporte funcional feita em §2 em diante depende da data
de "Atualizado" — todas se apoiam no CONTEÚDO lido em cada consulta, que
permaneceu consistente entre as verificações independentes deste worktree.

Nenhuma dessas páginas expõe seletor, classe CSS ou estrutura de DOM da conta
TATÁ — isso só a sessão supervisionada (não realizada) pode confirmar. Data
de implementação do modelo baseado nestas fontes: Sprint 2.1, 2026-07-22
(commits `4e29b25`..`0d2960f`).

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
