# B8 — Multi-unit Read

Data: 2026-10-04
Branch: `tmp/multi-unit-read-b8-20261004`
Base: `8b82fe3e6a9488b65fee80b17f0c9573cd057596`

## Objetivo

Eliminar a limitação histórica em que o seletor preservava contexto, mas só tinha `demo-unit` e
trocar unidade não mudava uma fonte real.

## Implementação

- `src/platform/leitura/unidades-operacionais.ts` lê `identity.unit` em transação READ ONLY;
- apenas `active=TRUE`;
- `/api/navegacao` usa essa fonte quando existe PostgreSQL;
- banco real indisponível -> unidades vazias/indisponíveis, nunca fallback para demo;
- `unit_id` é propagado para Entregas, Operação Viva e Copiloto;
- Entregas filtra aparelhos/projeções pelo `unit_id` selecionado.

## Gates

- typecheck: PASS;
- `test:platform:multi-unit-read`: **6/6 PASS**;
- Product System: **54/54 PASS**;
- `test:platform:multi-unit-read:pg`: **14/14 PASS**.

## PostgreSQL/HTTP isolado

Banco descartável criado/migrado pelo harness:

- ITAIM: ativa, aparelho `dev-it`, fila offline pública = 4;
- PINHEIROS: ativa, aparelho `dev-pin`, fila offline pública = 13;
- HOUSE: inativa e excluída do seletor.

O Product System foi iniciado contra esse banco:

- `GET /api/navegacao` -> ITAIM + PINHEIROS, `fonte_unidades=identity.unit`, sem `demo-unit`;
- `GET /api/entregas?unit_id=ITAIM` -> somente `dev-it`;
- `GET /api/entregas?unit_id=PINHEIROS` -> somente `dev-pin`.

O banco da prova foi descartado pelo harness.

## Figma

`STATE-B8 · Multi-unit Read` — node `23:2`.

Mostra a troca de fonte e o estado fail-closed da lista de unidades.

## Fronteira

**B8 resolvido no escopo técnico/runtime local.** Não há afirmação de que a produção já tenha
duas unidades cadastradas, nem deploy/cutover.
