# TATÁ Comanda — conciliação iFood × Teknisa, 25/10/2026 (fonte independente)

**Data da conciliação:** 26/10/2026. **DRAFT/HOLD / LEITURA SOMENTE**. O arquivo oficial de pedidos foi fornecido diretamente por César na conversa; os IDs completos, nomes e valores individuais NÃO foram incorporados a este repositório.

## Correção humana obrigatória sobre a impressão (César, 26/10)
> Em **25/10/2026, a saída de comandas do Gestor iFood estava DESATIVADA**. A impressão de comandas por duas origens ocorreu somente em dias anteriores específicos como contingência durante erro; **não é o modo normal da loja**.

Essa informação corrige documentos antigos que diziam que o Gestor iFood já estava imprimindo no caixa no dia da amostra. **Não presumir duplicidade ativa em 25/10.** Para qualquer ativação futura, ainda é necessário identificar o emissor físico real, evitar vias duplicadas e respeitar autorização humana específica. Não inferir que outra aplicação imprimia só porque o Gestor estava desativado.

Failure class: hipótese histórica de emissão simultânea perpetuada como estado atual. Regra: **antes de propor prevenção de duplicidade como defeito corrente, revalidar o dia e a fonte efetiva de emissão; diferenciar contingência passada de operação normal**. Teste futuro: conferir a posição do Gestor por data no piloto e procurar prova nativa independente, sem usar suposições ou logs genéricos.

## O máximo que o relatório iFood permite
O novo relatório individual recebido contém **314 pedidos únicos**, todos em 25/10, loja Tatá Sushi/ID iFood 53069, `ENTREGA PARCEIRA IFOOD`, canal iFood, 313 `CONCLUIDO` e 1 `CANCELAMENTO PARCIAL`. Cada pedido tem **UUID completo e ID curto únicos no arquivo**, além de hora, totais e situação. **Não contém linhas de produtos e respectivas quantidades.** Não solicitar repetidamente outra exportação mais detalhada como pré-requisito presumido; César explicou que esta é a máxima granularidade disponível.

## Consulta do sistema nativo (somente leitura, unidade 0001/01)
TEKNISA.COMANDAVEN+VENDAREST para 25/10, com `ApplicationIntent=ReadOnly` e sem DML/DDL:
- 317 `DLV_IFO`; entre estes, 283 com código de situação `P`, 30 `X`, 4 `4`.
- 12 `DLV_NMO`, 2 `DLV_FOS`, somando **331** fluxos `DLV_*`, exatamente o total do relatório projetado pelo leitor. Há mais 1 `MES_FOS` fora desse recorte, total nativo bruto 332.
- Não interpretar `P/X/4` como cancelado/concluído sem documentação ou semântico validado.

## Conciliação individual POR CÓDIGO CURTO, mesma data/unidade
Comparação conservadora do conjunto de 314 códigos curtos distintos iFood com 317 códigos curtos distintos `DLV_IFO`:
- **311** códigos presentes nas duas fontes (311 candidatos únicos por ID curto no dia; isso **não** autentica UUID completo no SQL).
- **3** códigos presentes no relatório iFood e ausentes de `COMANDAVEN` naquela unidade mesmo após consulta limitada de 23–26/10: os três têm situação `CONCLUIDO` na exportação.
- **6** códigos presentes em `DLV_IFO` e ausentes da exportação iFood (4 registros situação `4`, 1 `P`, 1 `X`).
- Equação **317−314=6−3=3**. São **nove casos de divergência de presença**, não “três pedidos perdidos” nem “17 pedidos ausentes”.
- O 331 do relatório interno é `317+12+2` por origens; o total da exportação iFood é recortado a `ENTREGA PARCEIRA IFOOD`. A coincidência por volume **não** garante cobertura da mesma seleção de pedidos.
- Faixas de 2 horas apresentam divergências em 12h–14h (-1 na Teknisa), 20h–22h (+2) e 22h–24h (+2); os outros quatro intervalos conferem.

A planilha de conciliação dos **314 registros**, contendo somente ID curto, situação, horário, valores e a indicação de correspondência, foi produzida na conversa para o usuário. O repositório armazena apenas resultados agregados por privacidade. Os códigos de exceção específicos permanecem na planilha entregue, não neste documento público.

## O que esta prova encerra e não encerra
**PROVEN:** relatório iFood fornecido como fonte independente de contagens/identificadores; 311 candidatos de associação por ID curto único e dia; discriminação das 9 exceções; evento Reader↔SQL no mesmo sistema (amostras 5/5 de conteúdo/notas, revisões ≠ pedidos distintos).

**UNKNOWN:** ligação autenticada de UUID iFood completo aos registros nativos; correspondência dos produtos/quantidades entre iFood e Teknisa (colunas indisponíveis neste export); interpretação nativa de situações; integridade de 9 divergências; sequência TATÁ persistida (arquivo observado `bindings=[]`); impressor ativo/rota física em 25/10; aceite físico.

**INVARIANTES:** não presumir impressão simultânea, não tentar ligar 3 ausentes por horário/fuzzy, não afirmar que status `4` equivale a cancelamento, não ativar API/credenciais iFood, não forçar `READY`, não reservar sequência nem escrever, não instalar/reiniciar/abrir spooler/fiscal/imprimir. PR #127 e PR #107 permanecem DRAFT/HOLD até prova da revisão correta e aprovação específica de efeitos.
