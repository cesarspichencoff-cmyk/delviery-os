# Triagem de bloqueios — consultar fontes antes de pedir confirmação

**Vigência:** 2026-10-07. **Escopo:** shadow de comandas, kits, caixas e sacolas TATÁ. Não autoriza impressão, fiscal, gravação produtiva nem aprovação de alergias.

## Regra obrigatória antes de qualquer pergunta operacional

**Um `UNKNOWN` no motor ou em um replay não prova que a regra operacional é desconhecida.** Significa apenas que a cadeia executada não produziu uma decisão FACT naquele momento.

Ordem de investigação:
1. Revalidar o HEAD/ref real da TATÁ Academia (`evolucao/v33-product-pass`) e do DeliveryOS (branch de execução em uso); não confiar em lista de pendências antiga.
2. Consultar primeiro **TATÁ Academia**: `PACKAGING_RULES_CURRENT_2026-09-10.md`, `content-source/human-current/kits_2026-09-22_cesar.md`, `content-source/human-current/operational_truth_2026-09-27_cesar.md`, `content-source/human-current/operational_truth_2026-10-05_cesar.md`, `content-source/human-current/operational_truth_2026-10-07_cesar.md` e demais provas humanas específicas posteriores.
3. Consultar **DeliveryOS**: `docs/Correcao_Operacional_2026-09-27.md`, `docs/Logica_Embalagens_DeliveryOS_V0.md`, aliases homologados, código canônico do produto, praça, mapa de roteamento e consumidor instalado. Os itens da antiga seção 15 de `Logica_Embalagens_DeliveryOS_V0.md` são **fotografia histórica**, não um formulário de perguntas atualmente abertas. Verificar se já foram resolvidos depois.
4. Comparar **regra vigente vs. implementação vigente**. Localizar o gargalo: leitura de arquivo, código, nome/código/alias, classificação, agrupamento físico, capacidade de caixa, kit, sacola, prova de primeira passagem, observação de segurança ou efeito não autorizado.
5. Se a fonte já contém o FACT, **não perguntar**: corrigir a integração/lookup/motor ou documentar a diferença com testes negativos e rollback. Se a fonte não foi completamente investigada, classificar como `SOURCE_NOT_YET_EXHAUSTED`, não como lacuna humana.
6. Só considerar pergunta se houver conflito humano atual comprovado ou `TRUE_HUMAN_GAP_AFTER_SOURCE_AUDIT`. Reunir casos equivalentes numa única questão, mostrando fontes verificadas e a consequência material. Não convocar o gestor para escolher manualmente cada pedido.

## Índice mínimo de fatos já decididos

| Assunto | Fato operacional confirmado | Fonte principal |
|---|---|---|
| Caixas vs. sacolas | 240/450/650/750/1.000/1.500/1.600 = caixas; P/M/G = sacolas | `PACKAGING_RULES_CURRENT_2026-09-10.md` |
| Agrupamento | Praça, compatibilidade e grupo físico antes da caixa; 2 duplas + 1 sashimi em Duplas = 1 caixa 450 | `operational_truth_2026-09-27_cesar.md` |
| Combinado 1 pessoa | 1 caixa interna 750 | `PACKAGING_RULES_CURRENT_2026-09-10.md` |
| Combinado 1 pessoa **sozinho**, 1 un. e caixa 750, exceto Kids | 1 Sacola M independentemente do sabor | `operational_truth_2026-10-07_solo_1p_750_bag_cesar.md` |
| Combinado 1 pessoa | 1 Kit p/1; outras quantidades seguem a matriz de pessoas | `kits_2026-09-22_cesar.md` |
| Combinado Kids | Caixa 750, Kit Kids por unidade; **não** herdar Sacola M genérica de combinado 1P | `operational_truth_2026-10-05_cesar.md`; `kits_2026-09-22_cesar.md` |
| Temakis | 1 = 450; 2–3 = 750; 4–6 = 1.500; kits por quantidade | `PACKAGING_RULES_CURRENT_2026-09-10.md`; `kits_2026-09-22_cesar.md` |
| Enrolados | 1 = 450; 2 = 750; 3+ = 1.500; kits por quantidade | Mesmas fontes |
| Sacola P/M/G | Capacidades documentadas, exceções específicas e **menor sacola comprovadamente suficiente** | `PACKAGING_RULES_CURRENT_2026-09-10.md`; `operational_truth_2026-09-27_cesar.md` |
| Quente + frio | Segregação física interna; não implicar duas sacolas externas sem prova de encaixe | `operational_truth_2026-10-05_cesar.md` |
| iFood 1161 | Uramaki de Salmão Especial + Temaki de Barriga de Salmão, 1 de cada: Kit p/1; caixa 750; Sacola M | `operational_truth_2026-10-07_order_1161_cesar.md` |
| iFood 2937 | Combinação exata: Kit p/1; sacola P previamente validada | `operational_truth_2026-10-07_order_2937_cesar.md` |
| iFood 6407 | Combinado sushi + sashimi especial 1P + 1 gengibre: Kit p/1; Sacola M; **observação de alergia exige revisão humana no shadow** | `operational_truth_2026-10-07_order_6407_cesar.md`; `SHADOW_ALLERGEN_GUARD_20261007.md` |
| iFood 7491 e 2103 | Sozinhos, 1P, caixa 750: 1 Sacola M; o 2103 foi aprovado em replay após aplicação da regra geral | `operational_truth_2026-10-07_solo_1p_750_bag_cesar.md` |

**Não confundir caixa 750 com Sacola M universal.** Kids, temaki em 750 e enrolados em 750 não são cobertos pela regra do combinado 1P. Para eles, procurar regras explícitas e provas de suficiência existentes; preservar UNKNOWN somente depois dessa auditoria.

## Critério prático de encaminhamento

| Sinal no shadow | Primeira providência | Perguntar a César? |
|---|---|---|
| `CLASSIFICATION_UNKNOWN_...` | Ver código canônico, rota, alias EXATO homologado e categoria em fontes atuais; distinguir produto conhecido de variante não comprovada | **Não**, antes da reconciliação |
| `KITS_NOT_FACT` | Consultar `kits_2026-09-22_cesar.md` e provas mais recentes; confrontar algoritmo com assinatura/quantidade | **Não**, enquanto houver regra escrita não aplicada |
| `BAG_SIZE_NOT_FACT` | Conferir grupo, caixa, itens, capacidade de sacola e fatos humanos mais recentes | **Não**, apenas por existir UNKNOWN |
| `PACKAGING_UNKNOWN` | Ver se o erro é falta de classificação, capacidade de grupo ou incompatibilidade física ainda sem medição | Somente lacuna humana comprovada e material |
| `ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW` | Preservar revisão humana de segurança; shadow não comunica à cozinha | **Não** para definir embalagem; alertar operação em canal autorizado |
| `UPSTREAM_...` | Diagnosticar serviço/estado de origem, não inventar regra de embalagem | **Não** |

## Correção de rota / prevenção de repetição

**Falha identificada em 07/10/2026:** usar um resultado `UNKNOWN` e um checkpoint antigo como justificativa para interrogar o gestor, mesmo quando existe regra canônica. **Rota bloqueada:** `UNKNOWN -> pergunta imediatamente` e `pedido isolado -> nova pergunta`.

**Rota obrigatória:** `UNKNOWN -> verificação de fontes vigentes -> confronto motor/fonte -> reparo técnico ou lacuna verdadeira documentada -> só então pergunta mínima`.

**Teste futuro verificável:** um novo pedido do tipo 2103/7491 não pode gerar pergunta sobre sacola; o sistema deve localizar a regra geral existente. Em uma comanda fora do escopo da regra, não herdar Sacola M indevidamente e não presumir que a fonte humana falhou sem buscá-la. Preservar impressão, fiscal e preparação real separados do shadow.

**Fronteira:** este documento organiza consultas e evita perguntas redundantes; não altera sozinho o motor, nem prova que todos os pedidos podem ser automatizados.
