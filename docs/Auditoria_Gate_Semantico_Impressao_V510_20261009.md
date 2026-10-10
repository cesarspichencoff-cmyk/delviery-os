# Auditoria de integridade semântica das comandas térmicas — SHADOW

Data: 2026-10-09 (America/Sao_Paulo)
Repositório: `cesarspichencoff-cmyk/delviery-os`
Branch de prova: `feat/thermal-v54-caixa-photo-visual-qa-20261008`
PR: [#21](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/21) (DRAFT)
Escopo: geração de comprovantes **exclusivamente offline**. Não é liberação de impressão operacional.

## 1. Resultado verificável

**TEST_PASS para as proteções semânticas em SHADOW**, não para o workflow inteiro:
- [GitHub Actions 37908424926](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37908424926): `operational-tickets-v45: 26/26 shadow tests PASS` e `thermal-semantic-gate-v510: 12/12 PASS; SHADOW ONLY` nos logs do job `113747443942`.
- Typecheck, quantidade V5.9, comandas históricas V4.6, divisão de cozinha V4.7, replay V4.8, roteamento V4.9, comandos Epson V5.1, limitações CAIXA V5.3, comparativo V5.4, tipografia V5.5, observações V5.6, controles invisíveis V5.7, integridade de recursos e política de sequência: PASS na mesma execução.
- A etapa final adversarial **continua FAIL** pela [Issue #22](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/22): o inspetor V5.1 aceita `GS ! 0x22` (ampliação 3×3) fora do perfil aprovado. Este teste não foi removido, alterado nem mascarado.
- `READY_FOR_OPERATIONAL_PRINT=false` e `effects.print=false` no fluxo SHADOW. Nenhuma prova de papel real adicional, spooler, driver, gaveta, corte ou implantação.

## 2. Mudanças e prova adversarial RED → GREEN

| Compromisso | Regressão executada | Correção isolada | Resultado |
|---|---|---|---|
| Motivos de bloqueio no resumo por canal | `496fb784`; run `37907367682` acusou ausência de `KITCHEN_DISHES:STATION_SEMANTIC_NOT_READY:COZINHA` | `ce146ef5` no bundle; run `37907508151` | Verde |
| Bloqueios declarados pelo planejador não viram só avisos | `ae9671f0`; run `37907709715` acusou aprovação semântica indevida | `74cb2c8c` na projeção; run `37907832736` | Verde |
| Embalagem ausente, desconhecida ou com item não alocado invalida conferência, sem bloquear outras estações comprovadas | `8347428a`; run `37908086772` encontrou conferência indevidamente pronta | `066e2f6e`; run `37908282483` | Verde |
| Suíte independente do projetor V4.5 passa a ser obrigatória no CI | `f6bfdd01`; run `37908424926` | 26/26 testes do projetor, mais 12/12 semânticos | Verde |

### Invariantes mantidas

- `bundle.jobs` recebe somente provas sem bloqueio global, bloqueio semântico local nem problema de geometria/encoding.
- `bundle.blocked_proofs` conserva `text_trace` para diagnóstico, com bytes vazios, `byte_count=0` e `ready_for_offline_preview=false` após veto semântico.
- Erros globais bloqueiam exportação offline; erros de estação bloqueiam apenas o canal atingido; conferência inválida bloqueia somente conferência se as outras estações continuarem comprovadas.
- Regras parciais de componentes HOT/EBITEN/SHISO não fazem surgir comandas especulativas e não anulam pratos comprovados.
- O replay de referência preserva os tamanhos históricos de **332, 349 e 665 bytes** nos cenários válidos. Os negativos são sintéticos e não alteram a fonte arquivada.
- `ready_for_automatic_operational_print=false` em todos os cenários de saída.

## 3. Portões materiais ainda abertos

1. [Issue #22](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/22): inspetor ESC/POS RED. A edição desse inspetor e do teste original havia sido impedida pela segurança da ferramenta; **não contornar o bloqueio**. Resolver exclusivamente por caminho de edição permitido, com o contrato adversarial completo aprovado.
2. [Issue #23](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/23): CI executa realmente e detecta o problema; porém *required check* / proteção administrativa da branch-base não está comprovada. Rulesets de repositório retornaram `[]`; leitura de branch protection pelo conector retornou 403, sem permissão administrativa.
3. [Issue #24](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/24): validação de quantidades V5.9 aprovada em SHADOW; aceitação da integração produtiva não foi feita.
4. [Issue #25](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/25): correção semântica aprovada em CI, mas **não WORLD_PROVEN** em impressão real, integração ou aceite humano.
5. Comparativo físico V5.4: só a primeira amostra V5.3 teve fotografia; segunda folha ainda não comprovada. Qualquer impressão futura exige autorização separada e só poderá atingir a fila **Epson TM-T20X CAIXA** do TATÁ Itaim. Cozinha, Bar, Sushi e Delivery são proibidas para esse teste.

## 4. Estado de entrega

- **CODE_READY:** sim, mudanças semânticas em branch SHADOW.
- **TEST_PASS local/remoto das suítes semânticas:** sim, conforme run `37908424926`.
- **INTEGRAL_CI_PASS:** não, porque #22 está RED.
- **DEPLOYED / MERGED:** não; PR #21 permanece DRAFT.
- **PHYSICAL_PRINTER_QA / WORLD_PROVEN / HUMAN_ACCEPTED:** não comprovados.
- **10/10:** não declarable enquanto qualquer bloqueio material acima estiver aberto.

Este registro documenta o que foi realmente testado e os limites da prova; não autoriza efeitos produtivos.

## 5. Adendo — identidade entre pedidos e proteção administrativa (09/10/2026)

**Novas falhas reproduzidas e depois corrigidas** no fluxo SHADOW, após a auditoria anterior:

| Controle | Prova inicial RED | Correção | Prova posterior |
|---|---|---|---|
| Impedir que `KITCHEN_DISHES` de outro pedido entre em `bundle.jobs` | `17624b2f`, [run 37909583795](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37909583795), teste 13 falhou | `ef66b15b`: identidade, fingerprint e conteúdo da fonte dos pratos | [run 37909755522](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37909755522), testes 13–14 verdes |
| Impedir que `KITCHEN_COMPONENTS` incorretos entrem em exportação | `7b507428`, [run 37909917364](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37909917364), teste 15 falhou | `91f8224d`: identificadores de componentes devem coincidir com **todas** as produções e a conferência | [run 37910080802](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37910080802): **15/15** semânticos e **26/26** do projetor V4.5 verdes |

Não houve acesso a impressoras. Os testes não provam integridade criptográfica da fonte de componentes: `KitchenPrepV47` ainda não possui campo próprio de fingerprint. A checagem de identificadores elimina a mistura evidente entre pedidos, mas **não autoriza declarar que qualquer dado recebido com os mesmos identificadores é confiável**.

### Proteção do PR — evidência mais precisa

Revalidado em 09/10:
- `GET /repos/cesarspichencoff-cmyk/delviery-os/rulesets` → `[]`.
- `GET /repos/.../branches/feat/thermal-quality-v51-epson-official-fontqa-20261008` → `protected:false`. Essa é a **branch-base do PR #21**.
- O check `Offline thermal proof (fail closed)` é executado e falha de forma real. Contudo, **a exigência administrativa do check antes de merge não está demonstrada**, e o indicador `protected:false` não permite tratá-la como configurada. Verificar branch protection / rulesets com credenciais administrativas apropriadas antes de promover PR para READY.

**Última fronteira técnica:** até corrigir por meio permitido o inspetor `tools/escposByteInspectorV51.js`, o teste adversarial obrigatório termina vermelho em `GS ! 0x22`. Não alterar o teste para mascarar a falha nem contornar o bloqueio anterior de edição.

**Estado neste adendo:** a segurança semântica da exportação offline foi melhorada e comprovada no GitHub; CI integral, política obrigatória de merge e aceite físico permanecem **não comprovados**.
