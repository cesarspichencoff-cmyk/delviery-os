# TATÁ Comandas — G2: lacunas de classificação e proveniência
**Data:** 26/10/2026. **Escopo:** diagnóstico de fontes versionadas, sem reconhecimento automático de produtos. **Status:** REVIEW_ONLY / DRAFT / HOLD.

## Proveniência e limite
A auditoria de 26/10 do shadow registrou 14 códigos com CLASSIFICATION_UNKNOWN, em 200 decisões recentes que podem conter revisões do mesmo pedido. As contagens não são pedidos únicos.

Foi cruzado o mapa de roteamento de 463 códigos do Retail com o diagnóstico histórico de praças de 30/09/2026. Esse diagnóstico aponta 199 produtos de seed, 94 correspondências determinísticas únicas, uma ambiguidade nominal e 104 sem associação; método explicitamente conservador, sem matching fuzzy promovido.

O teste offline agora compara os 14 códigos com essas duas fontes sem copiar nome de produto para identidade autenticada e sem criar classificação operacional.

## Resultado reproduzido
- 14 códigos examinados.
- 4 códigos possuem menção direta por código em auditoria histórica (Tuna Shisso Tartar, Tartar de Atum Spicy, Ceviche e Tartar de Salmão).
- Missoshiro possui dois candidatos de código na auditoria histórica; o código 9.75.00.020.00 não é singularmente autenticado apenas pelo nome.
- Cookie Pistache, código 8.20.11.002.00, não possui rota no mapa de 463 produtos; o shadow já havia emitido ROUTE_NOT_FOUND para ele. Permanece HOLD_ROUTE_MISSING, não recebe destino inventado.
- Os demais continuam sem prova de associação atual suficiente na fonte consultada.
- **0/14 autorizados a classificação automática pelo teste.** Conhecimento da embalagem no motor da Academia não prova identidade atual de CDPRODUTO nem estação/turno.

## Mecanismo preventivo
Ferramenta: tools/verificar_comandas_classification_gap_v1.cjs, estritamente offline, sem SQL, rede, impressora ou escrita de estado. Ela exige código canônico presente na fonte ou registra ausência de rota, relata prova histórica separada da atual, e mantém 14 decisões em HOLD até nova evidência. Negativos rejeitam extrapolação por variante de código.

A verificação foi adicionada ao workflow Linux e Windows, mas a execução na CI hospedada do commit exato permanece a comprovar. Teste publicado executado no Foxxy isolado, com saída: 14 códigos; 1 rota ausente; 4 evidências históricas diretas; 1 ambiguidade; 0 autorizações.

## Fronteira de conclusão
Para cada código, exigir prova atual de produto Retail por CDPRODUTO+código+nome+quantidade+praça/rota, ligação autenticada ao item da Academia, regra humana vigente e teste positivo/negativo. Não aceitar o nome, horário, SENHA, número aproximado ou posição da impressora como substituto de identidade.

Não aplicar correções diretamente no consumidor Windows V1/V2, publicar regra, instalar, mudar turno, imprimir ou mesclar sem os portões correspondentes.