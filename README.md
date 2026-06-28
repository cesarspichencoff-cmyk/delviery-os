# DeliveryOS — Camada 0

Motor de **escuta → memória append-only → projeções**. Sem tela, sem IA, sem tocar o chão.
Camada 1 (gesto físico do lacre) está **congelada** até validação operacional.

## O que prova
A partir do que a operação **já emite** (iFood + SAC/review), nascem sozinhos, sem ninguém
preencher: a **memória** (log de transições), o **estado** de cada pedido, o **erro** amarrado
ao pedido (o "fechamento ressuscitado") e a **disponibilidade** como risco.

## Estrutura
```
src/core/dominio.ts        # estados (conceituais, alguns não-observáveis), Transição (9 campos)
src/core/logTransicoes.ts  # memória append-only (JSONL / memória). Nunca sobrescreve.
src/core/adaptadores.ts    # iFood / pausa / SAC / review  → transições (escuta)
src/core/projecoes.ts      # estado atual, registro de erro, disponibilidade (derivados)
demo/camada0_demo.ts       # ponta a ponta, dados sintéticos, zero entrada manual
```

## Rodar
```
npm install
npm run demo        # build + executa a demonstração
npm run typecheck
```

## Invariantes (Contrato Operacional)
- Átomo = **transição de estado**; pedido = só a chave; memória = histórico.
- **Append-only**: nada de sobrescrever estado.
- Todo evento tem: pedido_id, tipo_evento, fonte, timestamp, payload_original,
  estado_anterior, estado_novo, confianca, procedencia (observado/inferido).
- Estados não-observáveis **existem no modelo** mas **nunca são preenchidos falso**
  (`producao_opaca`, `conferido_lacrado`).
- Disponibilidade = **risco** (pausado / crítico-do-pedido / consumo teórico / ritmo).
  **Proibido** "restam N unidades" sem contagem inicial.

## Fora desta camada
Camada 1 (lacre), tela/dashboard, IA, estoque contábil, maestro automático, previsão de colapso.
