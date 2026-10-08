# Reconciliação do consumer shadow — Bar Retail exato — 2026-10-07

## Objetivo e fonte
Corrigir `CLASSIFICATION_UNKNOWN` de bebidas já reconhecidas pelo Retail e roteadas ao Bar, sem transformar `UNKNOWN` em nova pergunta ao gestor e sem substituir o consumer do caixa por uma versão GitHub incompleta.

A referência canônica do VÉRTICE foi revalidada no branch `vertice-active`; o consumer instalado no CAIXA_MOOCA foi lido diretamente com a conexão autorizada. O SHA256 verificado no dispositivo para esse **baseline ativo** foi `57586FFDA73904B06D8C2C28AAA47E13A6BAD4B6734C3CECC22ACDB8D16C0503`.

## Resultado: candidato isolado
Arquivo de teste, **NÃO instalado**:
`runtime/shadow/candidates/CAIXA_MOOCA_consumer_bar_exact_20261007.cjs`

O candidato foi produzido a partir do código do consumer **instalado**, não a partir da versão de referência materialmente diferente. Uma checagem estrutural confirmou que o texto difere do arquivo lido somente por **duas inserções**:
1. Função pura `classifyRetailBarExact`, que exige nome normalizado, código canônico e rota exclusiva de Bar `00007`;
2. Aplicação dessa função à classificação, apenas quando `routingStatus === "ROUTED"`, sem mudar roteamento.

Itens habilitados:
- `COCA COLA 350ML - UN` / `8.00.05.000.00` — refrigerante;
- `AGUA MINERAL S/GAS - UN` / `8.00.00.000.00` — água;
- `AGUA MINERAL C/GAS - UN` / `8.00.00.010.00` — água.

A classificação existente de Coca-Cola Zero `8.00.05.010.00`, as observações, aliases humanos, bridge de combinados, classificação source-first, regras de kits, overrides e bloqueios por alergias permanecem preservados.

**Não incluir automaticamente** `CHA GELADO DE LIMAO ICE TEA 450ML - UN` / `8.00.05.100.00`: o produto de referência encontrado na Academia registra volume de 300 ml, não equivalência específica do SKU de 450 ml.

## Testes — separação de provas
- Validação estrutural da derivação do baseline: apenas as duas inserções mencionadas, sem outras diferenças;
- Sintaxe do candidate avaliada em ambiente JavaScript isolado;
- `tests/shadow-bar-reconciled-candidate.test.cjs`: **10/10** verificações exatas de nomes/códigos/rotas e **11 marcadores** de comportamento do consumer preservados, executadas em harness JavaScript equivalente às APIs Node necessárias para o teste;
- Diferencial offline **10/10** usando snapshots de eventos reais do CAIXA_MOOCA e dependências operacionais lidas somente em modo leitura; versão antiga e candidate executados no mesmo ambiente V8 isolado. `crypto.createHash` foi simulado apenas para o `fingerprint`; **não** comprova paridade criptográfica com Node, nem first-pass live.

| iFood | Mudança observada no replay offline | Resultado seguro |
|---|---|---|
| 0292 | Água com gás classificada | Continua `BAG_SIZE_NOT_FACT` após inclusão da bebida no agrupamento; **não ready** |
| 8933 | Água sem gás classificada | `BAG_SIZE_NOT_FACT` preservado |
| 4459 | Coca-Cola classificada | `BAG_COUNT_NOT_FACT`, `BAG_SIZE_NOT_FACT`, `KITS_NOT_FACT`, `PACKAGING_UNKNOWN` preservados |
| 5192 | Coca-Cola classificada | `BAG_COUNT_NOT_FACT` e `KITS_NOT_FACT` preservados |
| 2666 | Coca-Cola classificada | `BAG_SIZE_NOT_FACT` preservado |
| 0832 | Chá gelado não equiparado ao SKU de 300 ml | Classificação permanece UNKNOWN |
| 6407 e 1577 | Sem mudança de bebida | Travas de alergia preservadas |
| 7491 e 0470 | Sem mudança | Aprovações anteriores preservadas |

**Total: 5 classificações recuperadas, zero novos pedidos `ready` e nenhuma regressão detectada nas invariantes testadas** (rota/alvos, efeitos, aprovações antigas, alergias).

## Limites e próxima prova
Os controles de segurança anteriormente barraram a preparação de escrita do consumer no dispositivo. **Não usar outro procedimento equivalente para contornar esse bloqueio.** Nenhum novo arquivo foi escrito no CAIXA_MOOCA nesta etapa. O código ativo permanece na versão de hash supracitada, com impressão e fiscal em `false`.

O arquivo `runtime/shadow/live_shadow_consumer_v1.cjs` do mesmo branch é uma referência anterior e **não deve sobrescrever o runtime real**, pois omite comportamentos materiais. O candidato é artefato de reconciliação, não autorização de deploy.

A etapa de implantação requer canal permitido, teste nativo Node, checagem de hashes/diff, backup atômico e replay de regressão no dispositivo antes da instalação, mantendo `print=false`, `fiscal_action=false` e proteção de alergias. Ainda é necessário comprovar **primeira passagem** em novas comandas, não apenas replay.

Para os pedidos em que a identificação da bebida agora permite reconhecer mais um item, **não inferir** nova sacola ou quantidade: o caso 0292 demonstrou que uma classificação correta pode expor bloqueio real de embalagem que ficava escondido.
