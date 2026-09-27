# Correção operacional — César · 2026-09-27

## Status

Fonte humana atual para embalagem física no DeliveryOS.

Esta correção complementa a revisão de 26/09/2026 e prevalece em conflito dentro deste escopo.

## 1. Agrupar a praça antes de escolher a caixa

César confirmou:

- itens fisicamente compatíveis da **mesma praça** devem ser agrupados antes da decisão de caixa;
- o sistema não deve criar caixas separadas só porque os itens pertencem a categorias diferentes;
- as categorias continuam servindo para medir capacidade;
- a caixa é escolhida para o grupo físico da praça.

Ordem correta:

`PRAÇA → COMPATIBILIDADE → GRUPO FÍSICO → CAIXA`

Exemplo explícito:

- **2 duplas + 1 sashimi**, todos na praça **Duplas** → juntos em **1 caixa 450**.

Isso corrige a leitura antiga que podia virar “categoria → caixa” e fragmentar artificialmente uma mesma praça.

## 2. Exceções

Não agrupar automaticamente:

- combinado fechado;
- caixa fixa;
- 650 selada quando a capacidade de compartilhamento não estiver provada;
- itens de praças diferentes;
- itens fisicamente/termicamente incompatíveis;
- qualquer item com regra explícita que determine embalagem própria.

Regra específica vence agrupamento genérico.

## 3. Grupos mistos

Para grupos mistos elegíveis da mesma praça:

- usar as capacidades documentadas das famílias;
- escolher a **menor caixa comprovadamente suficiente** para a ocupação combinada;
- não somar “uma caixa por categoria”;
- se a capacidade não fechar com segurança, preservar UNKNOWN em vez de inventar encaixe.

## 4. Sacolas

César confirmou:

> sempre usar a menor sacola que der.

Regra:

- entre P/M/G comprovadamente suficientes, escolher a menor;
- ordem: **P < M < G**;
- isso não autoriza inventar capacidade;
- sem tamanho comprovado, manter UNKNOWN.

Quantidade de sacolas e tamanho de sacola continuam decisões diferentes.

## 5. Kits

Atribuição atual de kits continua sendo governada pela fonte humana mais nova do TATÁ Academia:

`content-source/human-current/kits_2026-09-22_cesar.md`

Composição confirmada em 27/09/2026:

- **Kit Quente:** hashi + sachê de shoyu + guardanapo; sem shoyuzara.
- **Kit Kids:** hashi + sachê de shoyu + shoyuzara + guardanapo + adaptador.

O DeliveryOS não deve reintroduzir composição histórica conflitante.

## Governança

- FACT humano atual > documentação histórica > inferência;
- mesma praça é condição de agrupamento, não licença para ignorar incompatibilidade;
- nenhuma inferência de capacidade vira FACT sem prova;
- qualquer motor futuro deve carregar regressão explícita do caso 2 duplas + 1 sashimi → 450.
