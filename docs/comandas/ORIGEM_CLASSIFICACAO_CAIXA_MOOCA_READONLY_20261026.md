# TATÁ Comanda — diagnóstico da origem das classificações na CAIXA_MOOCA
**Data de observação:** 26/10/2026, leitura estritamente passiva. **Estado:** REVIEW_ONLY / HOLD / nenhuma modificação na loja.

## Origem observada
Arquivos conhecidos em `C:\ProgramData\TataComandaReader\shadow`, consultados somente para contagens, campos estruturais, datas de atualização e hashes. Não foram extraídos pedidos, nomes de clientes, credenciais, banco de dados, spooler nem dados fiscais.

| Fonte | SHA-256 | Data da última alteração (UTC) | Cobertura |
|---|---|---|---|
| `product-identity-cache-v1.json` | `37E92FC87EA1D141CBACA32216564AC22EE469E6C3DDE478F10D8E0351DAF4F3` | 05/10 18:31 | 554 linhas de identidade |
| `product-aliases-v1.json` | `CB50D4BA19D6B91D6B6241D8043109A0C5317348A95EECA5A721EC552870C167` | 06/10 01:21 | somente 3 aliases |
| `routing.json` | `7084771026CA54F10069F02E0BABCAA00F9C7666484CBAF80EC1ECDCDCAA165D` | 05/10 18:40 | histórico de roteamento de 463 códigos |

A cache declarou captura em 05/10/2026, às 15h27 -03:00. A lista de aliases declara atualização em 05/10, às 22h13 -03:00. **Datas/hashes identificam esses artefatos, não comprovam que a fonte nativa permaneceu inalterada até 26/10.**

## Confronto de 14 códigos com CLASSIFICATION_UNKNOWN em 200 decisões recentes
- **14/14** possuem exatamente uma linha na cache de identidade local, com um nome nativo distinto por código. A comparação adicional do **nome observado** contra `NMPRODUTO` nessa cache de 05/10, com normalização de maiúsculas, acentos e espaços (sem fuzzy), deu **14/14 correspondências e 0 divergências**; é prova relativa à cache histórica, não ao cadastro de hoje.
- **0/14** possuem `canonical_code` no arquivo local de aliases; portanto nenhum desses 14 tem classificação validada por essa fonte específica.
- **13/14** possuem ao menos uma rota no `routing.json` histórico.
- **1/14** não possui rota na fonte: `8.20.11.002.00` (Cookie Pistache).
- Alguns códigos possuem dois destinos configurados; a análise independente V8.48 não comprovou que os pares A/B alternem por LUNCH/DINNER. A presença de destinos não os autoriza fisicamente.
- O código instalado do consumidor V1 consulta alias exato por nome+código; quando não encontra, tenta categorias específicas da Academia e só então bloqueia com `CLASSIFICATION_UNKNOWN`. A função `classificationFromPackagingFactStrict` não permite as categorias `selada_650` e `caixa_fixa`, apesar de o motor canônico reconhecê-las. Isso explica **parte** dos bloqueios de casos como Missoshiro e Carpaccio, mas não constitui prova de que todo item deva ser promovido automaticamente.

## Causa provável de reincidência
Artefatos de identidade e aliases fixados no início de outubro, regras da Academia alteradas depois, estado de turno legado vencido, e consumidor V1 ainda instalado (V714 candidato NÃO implantado). Teste sintético de 14 códigos não é prova de atualização das fontes da loja. **Cache válida ≠ classificação autorizada ≠ rota física comprovada.**

## Rota compatível com as decisões humanas V8.43/V8.48
1. Não renovar artificialmente o turno: César já declarou que o horário necessário vem na própria comanda; não criar aprovação diária nem selecionar destino A/B por hora.
2. Separar source-first: identificar produto pelo código+número de linha+revisão, vincular classificação e praça apenas por fonte humana/catálogo atual comprovado e rejeitar conflito/ambiguidade. Não promover somente pela similaridade de nome.
3. Testar no sandbox um adaptador do motor, sem tocar na V1 e sem reduzir travas: Carpaccio e Missoshiro como positivos só com prova da categoria/estação; nomes inventados, rota dupla ambígua e identidade conflitante como negativos.
4. Provar disponibilidade de pedido real e ligação da sequência TATÁ, hoje com zero bindings no estado local visto em 26/10; não executar binder na produção sem autorização e prevenção de duplicidade.
5. Exigir origem independente Gestor iFood/Teknisa e janela física supervisionada antes de liberar quaisquer três vias.

## Limites da prova
Leitura de código e agregados = `OBSERVED`. Regras de candidatura = `REVIEW_ONLY`. `WORLD_PROVEN`, `PHYSICAL_PRINT`, `SEQUENCE_BIND` e `HUMAN_ACCEPTED` permanecem abertos. Nada foi escrito, instalado, reiniciado ou impresso na CAIXA_MOOCA.
