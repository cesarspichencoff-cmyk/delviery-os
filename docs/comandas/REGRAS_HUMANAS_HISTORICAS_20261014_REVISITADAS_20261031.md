# TATÁ Comandas — recuperação de regras humanas históricas (Itaim)

**Data de leitura:** 31/10/2026. **Registro original:** 14/10/2026. **Status:** REVIEW_ONLY / HISTÓRICO / HOLD.

## Fonte e integridade

A conexão autorizada de somente leitura com CAIXA_MOOCA permitiu consultar o arquivo já existente
`C:\ProgramData\TataComandaReader\pilot-readonly-20261013\human-validations-cesar-20261014.review.json`.

- `schema: deliveryos.cesar-exact-human-validation.v1`
- `source: CESAR_DIRECT_CHAT_2026_10_14` (campo **declarado** no arquivo, não assinatura independente)
- `status: HUMAN_APPROVALS_CAPTURED_NOT_CONSUMER_INTEGRATED`
- SHA-256 lido do arquivo local em 31/10: `7fdf9513d6979c28e640045f861d64513d7e563c20307fa6e70a6f13f7ac072d`.
- Conteúdo existente: 10 registros de produtos, 15 de sacolas, 13 de kits, 4 de realidade física e 6 pendências.
- Todos esses 42 registros têm `print_authorized=false`; a leitura não altera nenhum deles.

**Atenção:** a correspondência feita abaixo é por **nome exato entre dois arquivos históricos**. Não prova `CDPRODUTO`, código de árvore atual, praça de produção em 2026-10-31, configuração física nem instalação. O catálogo atual continua sem acesso comprovado. Não transportar uma regra nominal para outra variante, para outro código ou para outro pedido.

## Oito correspondências nominais entre 14 produtos pendentes

| Produto observado no Reader (26/10) | Registro humano (14/10) | Regra histórica restrita — não homologação atual |
| --- | --- | --- |
| Carpaccio de Salmão | A2 | Entrada fria, caixa 750 para até 3 unidades; acima disso não decidido |
| Missoshiro | A4 | Sopa/acompanhamento quente em isopor; não declarar caixa 650 nem exibir recipiente no ticket |
| Tuna Shisso Tartar | A3 | Entrada fria, caixa 650 selada até 3 unidades; não generalizar para misturas/4+ |
| Salmão/Atum 1 Pessoa | A5 | Combinado 1 pessoa, caixa 750, 1 Kit p/1 |
| Coca Cola 350ml – Un | A1 | Bebida / bar, sem caixa de comida e sem kit próprio; quantidade/escopo do canudo pendente |
| Mochi Individual | A6 | Recipiente de isopor, sem kit de sobremesa; quantidade de recipientes não deduzida |
| Tartar de Atum Spicy | A3 | Mesma referência A3 de caixa 650 selada até 3, sem inferência entre produtos |
| TATÁ Chocolate | A8 | Caixa 450, 1 Kit Sobremesa |

**Seis sem correspondência exata na lista `products` do arquivo:** Shimeji e Shitake, Ceviche, Água Mineral com Gás – Un, Tartar de Salmão, Salmão/Atum 2 Pessoas e Cookie Pistache.

O arquivo possui decisão para **Cookie Três Chocolates**, mas não para **Cookie Pistache**. Não usar a regra do primeiro como rota ou embalagem do segundo. O Cookie Pistache continua sem rota no mapa histórico de 30/09, questão distinta da existência de regra humana para outros cookies.

## Pendências e riscos mantidos

O próprio registro histórico conserva seis pontos `pending`: contradição de kit Kids com bebida, caixas físicas de combinado executivo sem quantidade/distribuição, escopo de canudos, distribuição de caixa 650 para tartares, rota do Cookie Três Chocolates e prova física final não concluída. A decisão humana salva em 14/10 é útil **para não repetir perguntas respondidas**, mas não é licença para inferir além dos casos especificados.

A matriz minimizada `data/comandas_historical_human_scope_overlap_20261014_review_only.json` preserva os 14 códigos da fila e somente os identificadores A* das oito correspondências nominais. O teste de regressão confirma 8/14, seis ausências, bloqueio do Cookie Pistache e todos os campos de aprovação operacional falsos. A SHA local serve como referência para futura comparação de fonte, não como assinatura da origem.

## Próximo portão

1. Obter **fonte vigente do catálogo por leitura legítima**, com `CDPRODUTO`, código canônico, nome e ativo, mesma unidade e revisão.
2. Cruzar as correspondências históricas com identidade exata e confirmar a vigência da regra — não pedir novamente a César os detalhes já registrados sem detectar diferença material.
3. Conciliar a versão pinada do motor, praça, embalagem e distribuição de caixas/sacolas/kits; testar cancelamento, duplicidade de linha, observações e troca de revisão.
4. Só considerar efeito físico em operação após autorização específica e evidência de primeiro despacho/rota, impressão e sequência reais.

**Restrições permanentes:** PR DRAFT; sem contato com a Teknisa; sem bypass de ACL, instalação, deploy, merge, impressão, spooler, escrita SQL ou alteração do leitor. As pastas `shadow` e `state` seguem protegidas; este arquivo foi obtido numa área separada já acessível ao conector.

## Segunda fonte local — identidade nativa de 05/10

A investigação autorizada e somente em leitura encontrou, na área de piloto do CAIXA_MOOCA, o arquivo `shadow-v2/product-identity-cache-v1.json`, com schema `deliveryos.product-identity-cache.v1` e data interna de captura `2026-10-05T15:27:33.4357828-03:00`. O arquivo contém 554 linhas de catálogo e SHA-256 `37e92fc87ea1d141cbaca32216564ac22ee469e6c3dde478f10d8e0351daf4f3`.

A conferência local cruzou os 14 códigos canônicos do arquivo de pendências de 26/10, verificando `canonical`, `CDPRODUTO` e `NMPRODUTO`, **sem exportar os IDs**. Resultado: **14/14 códigos com exatamente uma linha**, **14 IDs nativos distintos entre os selecionados**, **14/14 nomes equivalentes após normalização de acentos/espaços/caixa**. A fonte original foi lida no computador, não reconstruída a partir da lista do projeto.

A evidência minimizada está em `data/comandas_historical_native_identity_lineage_20261005_review_only.json`. Associando apenas os nomes dos oito casos já validados historicamente em 14/10, identificam-se 62 de 82 ocorrências históricas de bloqueios; as seis ausências nominais somam 20. **Ocorrências são motivos de bloqueio em revisões, não pedidos únicos.**

Limite incontornável desta fonte: o cache de 05/10 **não traz campo de situação ativo/inativo**, não prova a atualização dos IDs em 31/10 nem atesta a autenticidade de origem independente. O verificador atual de catálogo exige `active` explícito e não deve receber `true` inventado para fazer a amostra passar. Também não há homologação de praça, embalagem, distribuição de caixas/sacolas/kits, primeira impressão ou destino de impressora. O novo registro mantém esses estados falsos ou `UNKNOWN`.

**Próximo portão com maior valor:** obter legitimamente uma captura atual com revisão, unidade, vínculo código→ID e situação ativa; comparar com a linha-base de 05/10. Mudança de ID, código, nome ou estado deve bloquear e demandar revisão, sem inventar alias. Não repetir a César os ajustes de ACL já tentados; não contornar as pastas protegidas.
