# Auditoria revisada das impressoras e economia de papel — TATÁ Comandas

**27/10/2026 · ITAIM · PR #127 · revisão somente leitura · sem imprimir ou alterar a configuração**

## Correção da premissa

O pedido de gestão é **imprimir apenas nas praças que efetivamente trabalham aquele pedido e naquela janela**, sem enviar comandas a todas as impressoras cadastradas. O documento operacional de 30/09 `docs/Production_Ticket_Operational_Spec_V1.md` registra regra humana por horário e por tipo de preparo:

| Praça | Almoço | Jantar |
|---|---|---|
| Combinados | 00009 — BALCAOSUSHI1 | 00003 — DELIVERY SUSHI 1 |
| Enrolados | 00006 — BALCAOSUSHI2 | 00004 — DELIVERY SUSHI 2 |
| Enrolados quentes | 00006 — BALCAOSUSHI2 | 00006 — BALCAOSUSHI2 |
| Cozinha | 00002 — COZINHA | 00002 — COZINHA |
| Conferência | CAIXA | CAIXA |

Uma instrução humana adicional de 12/10 estabelece que **Delivery Sushi 1 e 2 ficam desligadas no almoço**, embora a integração anterior continue enviando trabalhos, que podem acumular. **Combinado dupla** foi explicitamente citado para Balcão Sushi 1, mas o escopo/horário da exceção não está suficientemente detalhado para aplicar como remapeamento automático de todos os combinados. Não generalizar classificação pelo nome ou sem catálogo aprovado.

Horários do delivery informados pela gestão: segunda a sexta, **11h–15h** e **18h–23h**; sábado/domingo, **11h–16h30** e **18h–23h**. São janelas do negócio, **não prova de minuto exato em que uma impressora física é energizada, desligada ou liberada**. O horário original já vem na comanda. Não criar aprovação diária de turno nem ler o relógio do computador para reescrever o horário do pedido. Caso não haja prova da janela operacional exata, conservar HOLD da impressão física, sem despejar a lista de rotas em todas as impressoras.

## Prova independente da configuração atual no Windows (somente leitura)

Em CAIXA_MOOCA, leitura do `Get-Printer` em 27/10 encontrou filas com estes nomes/portas: `BALCAOSUSHI1 → 192.168.0.142`, `BALCAOSUSHI2 → 192.168.0.110`, `DELIVERY SUSHI 1 → 192.168.0.153`, `DELIVERY SUSHI 2 → 192.168.0.4`, `COZINHA → 192.168.0.116`, `CAIXA → ESDPRT001`. Esses nomes/portas são compatíveis com `data/runtime_printer_map_v1.json`, extraído do Retail em 30/09, mas **não atestam condição física atual, janelas ativas nem papel impresso**. `PrinterStatus=Normal` não é teste de energia/papel real.

O Reader mantém `shadow/routing.json` com hash `7084771026CA54F10069F02E0BABCAA00F9C7666484CBAF80EC1ECDCDCAA165D`, inalterado desde 05/10. Essa matriz tem 463 códigos: 346 de um destino, 117 de dois destinos, dos quais **87 produtos têm o par `00003+00009` e 19 têm `00004+00006`**. Logo **106 dos 117** casos de dupla rota representam exatamente esses pares, deixando **11 outros pares de outra natureza**; não remover esses 11 nem reclassificá-los como alternativas de turno.

A cache nativa relaciona exemplos do primeiro par a sushi, sashimi, carpaccio, tataki e combinados; o segundo, a uramaki, batera, hossomaki e temaki. A presença simultânea dos dois destinos **não exige imprimir nas duas praças**. O código/rota original tampouco comprova, sozinho, que uma exceção de produto seja dispensável.

## Auditoria da fila real, com interpretação corrigida

Leitura do Windows `Get-PrintJob` para DELIVERY SUSHI 1 encontrou **1.086 registros retidos** do período de **22 a 26/10**, todos com estado `Printed`. O Windows confirmou `KeepPrintedJobs=true` **somente nessa fila**; os demais destinos examinados tinham `KeepPrintedJobs=false`. Portanto, **1.086 não são trabalhos comprovadamente pendentes**, e os zeros das outras filas **não significam ausência de impressões**.

Sem ler nomes, textos, IDs de pedido ou conteúdo, a distribuição por data/horário local de submissão na fila foi:
- **204** envios no intervalo de almoço informado, quando a gestão relata Delivery Sushi desligado;
- **870** no intervalo de jantar;
- **12** fora dessas duas janelas.

Detalhe por data: 22/10 jantar 116; 23/10 almoço 33, jantar 241, fora 1; 24/10 almoço 65, jantar 207, fora 1; 25/10 almoço 83, jantar 190, fora 8; 26/10 almoço 23, jantar 116, fora 2. Total 1.086.

**Conclusão suportada:** a fila do Windows recebeu trabalhos de DELIVERY SUSHI 1 também no almoço. **Não há prova** de 204 papéis desperdiçados, 204 pedidos distintos, causa exclusiva da Teknisa, fila ainda pendente, impressão acumulada liberada depois ou status de energia da Epson. A combinação da regra humana e dos horários observados exige investigar a origem e evitar submissões indevidas. **Nenhuma fila foi alterada ou esvaziada.**

## Leitura do código PHP instalado: a impressão pode percorrer vários destinos

O arquivo instalado `C:\TEKNISA\odhenPOS\backend_74000\vendor\odhen\api\src\Service\ImpressaoPedido.php` foi consultado **somente em leitura**. Nos trechos **214–230, 231–247 e 248–262**, existem laços separados que preparam impressões para `impressoraProducao`, `impressoraProducao2` e `impressoraPuxa`. Os testes presentes nesses trechos tratam tipo de dispositivo/parâmetros como `IDIMPPEDPROD`, **não exibem seleção por horário de almoço/jantar**.

Isso oferece um mecanismo **plausível**, mas não causa demonstrada, de envio a mais de um destino já configurado. O caminho PHP examinado **não foi provado como o emissor da primeira via do iFood/DLV_IFO**; tampouco os 204 jobs Windows foram causalmente ligados a esse laço. Não alterar o PHP como resultado desta leitura.

## Correção de arquitetura necessária

1. **Distinguir rota cadastrada, praça necessária e impressora elegível na janela do pedido.** O pedido deve carregar o horário original da Teknisa; o sistema não deve escolher pelo relógio atual ou turno expirado de 14/10.
2. **Uma única rota ativa por praça lógica**, com mapeamento por janela e categoria comprovada, respeitando exceções explícitas. Produção e cozinha independentes continuam independentes. Não criar duas saídas apenas porque o Retail lista dois destinos.
3. **Não enviar trabalho para Delivery Sushi 1/2 no almoço**, a menos que a regra atual de operação confirme explicitamente uma exceção; não basta deixá-las desligadas e permitir que o Windows acumule trabalhos.
4. **Não descartar trabalho de origem ou mexer em fila para esconder duplicidade.** Na candidata, registrar por pedido/linha/revisão o destino selecionado, o suprimido e a proveniência da decisão; em caso de ausência de prova da praça/horário/estado físico, bloquear a **emissão**, preservando conteúdo e trilha para revisão, sem enviar a todos.
5. **Separar sempre as duas vias de produção do cruzamento iFood**, que só ocorre na conferência do caixa. O total exato de vias por pedido depende das praças efetivamente necessárias; não imprimir papel vazio ou repetir ticket idêntico para forçar contagem.
6. Provar os casos de fronteira: 15h em dias úteis, 16h30 aos finais de semana, 18h, pedidos agendados, horários excepcionais, preparação quente no Balcão Sushi 2, combinado dupla, falha de energia, trabalhos retidos e reimpressão. Só uma fonte operacional atual e atestada pode desbloquear papel.
7. A PR #127 alterou o planejador para **HOLD indiscriminado** dos pares em outubro. Esse fail-closed protegeu contra duplicidade, mas **não resolve o objetivo operacional**, porque os pares podem ser alternativas verdadeiras conforme horário e preparo. **Não liberar todas** para contornar o HOLD; reimplementar seleção seletiva com prova de janela e praça em ensaio offline antes de qualquer integração real.

### Fronteira da prova e efeito

Esta é a **reavaliação da premissa** com dados da loja, não autorização para ligar, pausar, descartar, limpar, reiniciar fila, instalar, alterar Teknisa/GP, modificar SQL, impressão ou deploy. O alvo de economia é **zero envio desnecessário a praças inativas**, sujeito a validação de produto/horário/exceção. Consumo de papel evitado só poderá ser quantificado por comparação real e apropriada de trabalhos e papel, e não pela contagem bruta de jobs retidos.

**Estado: AUDITORIA DE ORIGEM MELHORADA / CORREÇÃO DO PLANEJADOR AINDA NECESSÁRIA / PR DRAFT-HOLD.**

## Progresso de implementação: prévia seletiva offline, sem envio

Foi acrescentado à PR #127 o adaptador opcional `tools/comandas_window_station_select_v1_offline.cjs`, documentado em [seletor por janela e praça](SELETOR_JANELA_PRACA_PREVIA_OFFLINE_V1_20261027.md). Em cópia descartável Foxxy, **28/28 testes** passaram, incluindo fronteiras de almoço/jantar, produto/categoria ligada por código exato, exceção dupla em HOLD, quentes no Balcão Sushi 2, cozinha independente e prévia com o planejador existente, sempre sem permissão de imprimir.

**Diferença decisiva:** a versão de laboratório seleciona apenas **candidatos** e pode retirar da prévia o membro errado de um par alternativo, mas **não foi conectada ao Reader ou ao emissor instalado**. O bloqueio original dos pares no planejador permanece intacto para caminhos sem o adaptador. A alegação de origem/hora/categoria fornecida pelo teste **não é atestação independente**: categoria homologada, fonte de hora e estado físico continuam requisitos abertos. Não declarar economia de papel real nem ativação de rota na loja.
