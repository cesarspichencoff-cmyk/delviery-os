# TATÁ Comandas — protocolo de observação física do papel iFood no Itaim

**Autorização:** César aprovou em 02/11/2026 **somente a observação das comandas que já saem naturalmente**, em uma amostra no almoço e outra no jantar, sem novos impressos ou alterações. Este documento prepara a observação; **nenhum resultado físico foi coletado** por esta execução.

**Estado inicial:** `PAPER_CENSUS_AUTHORIZED_NOT_OBSERVED` · PR #130 Draft/HOLD · produção nativa não substituída · conferência TATÁ independente não ativada. O computador Windows chama-se `CAIXA_MOOCA`, mas César confirmou que pertence ao **Itaim**. Isso não identifica o caixa lógico `IFO`.

> **Revisão de 05/11/2026 (PR #135, ainda DRAFT/HOLD):** a classificação abaixo foi alinhada ao classificador offline v2. O documento original foi criado durante a PR #130; sua referência histórica permanece, mas a PR vigente é a #135. Nenhuma observação física foi recebida.

**Ficha curta de campo (20 pedidos por turno, sem PII):** [FICHA_CAMPO_CENSO_PAPEL_ITAIM_ALMOCO_JANTAR_20261108.md](FICHA_CAMPO_CENSO_PAPEL_ITAIM_ALMOCO_JANTAR_20261108.md). O material é para observação passiva já autorizada; nenhuma amostra física foi coletada ou classificada automaticamente.

## Objetivo
Decidir por evidência visível se as vias nativas já produzidas para pedidos iFood são suficientes, corretas e recebidas nas **praças efetivamente necessárias**. Se forem, avaliar preservar a produção nativa e desenvolver **apenas a conferência independente**; se não, manter o sistema shadow/HOLD e reabrir a investigação causal. **Um censo nunca autoriza imprimir, desativar, apagar, reprocessar ou modificar a origem.**

## Observadores e recorte mínimo
- Registrar até **20 pedidos iFood consecutivos no almoço e 20 no jantar**, sem escolher só os pedidos que deram certo. Para emitir uma classificação conjunta **D1 de um dia operacional**, ambas as fichas devem ter a **mesma data local**; almoço e jantar de datas diferentes não podem ser agregados como se fossem um único dia (D0). Uma anomalia testemunhada permanece D2, mesmo que as datas sejam diferentes. Se houver menos, declarar o total efetivo; não inventar ocorrências.
- O responsável em cada impressora já atendida pela equipe observa visualmente papel que sai **sem acionar qualquer botão**. Um coordenador junta os registros por alias `A01…A20` no almoço e `J01…J20` no jantar. Se uma praça não puder ser acompanhada, marcar **cobertura parcial**, jamais lançar zero presumido.
- Amostrar tanto pedidos simples quanto pedidos que exigem mais de uma praça. Registrar quais categorias efetivamente apareceram; a ausência de uma categoria impede concluir sobre ela. Almoço de segunda a sexta normalmente 11h–15h; fim de semana até 16h30; jantar 18h–23h. Essas são **janelas informadas da operação**, não prova de que uma impressora esteja ligada.
- A identidade `A01/J01` é **um apelido local criado para o censo**, não número TATÁ 001–999, não chave iFood e não ligação certificada ao pedido. A equipe faz a associação visual no momento, por identificador já impresso e conferência local; não compartilhar esse identificador fora da operação. Se não conseguir verificar o vínculo, marcar **`UNKNOWN`**. Reservar **`NO`** para quando o observador constatar que a via pertence a **outro pedido**; esse conflito é anomalia `ORDER_IDENTITY_MISMATCH`, mesmo que o campo de categorias não seja preenchido.
- Não registrar nome, telefone, endereço, CPF, número NFC-e, código de acesso fiscal, foto de cliente nem conteúdo integral do pedido. Compartilhar só observações agregadas e diferenças genéricas por praça; não subir dados de pedidos reais ao Git.

## Mapa a usar como hipótese operacional — validar no papel, não assumir
| Família de preparo | Almoço documentado | Jantar documentado |
|---|---|---|
| Combinados / sushi 1 | `BALCAOSUSHI1` | `DELIVERY SUSHI 1` |
| Enrolados / sushi 2 | `BALCAOSUSHI2` | `DELIVERY SUSHI 2` |
| Enrolados quentes | `BALCAOSUSHI2` | `BALCAOSUSHI2` |
| Cozinha | `COZINHA` | `COZINHA` |
| Conferência existente | `CAIXA`, se houver papel nativo | `CAIXA`, se houver papel nativo |

Referência: `docs/comandas/AUDITORIA_REVALIDADA_IMPRESSORAS_E_JANELAS_20261027.md`. Não considerar `00009/00003` e `00006/00004` como duas vias obrigatórias do mesmo item. Existe exceção não totalmente definida para **combinado dupla**; marcar como incerta quando ela afetar a praça. `DELIVERY SUSHI 1/2` foram informadas como desligadas no almoço; verificar também se surge **papel tardio**, sem tocar na fila.

## Registro mínimo por pedido, no momento da saída normal
| Campo | Preenchimento |
|---|---|
| Turno, data e alias | `ALMOCO`/`JANTAR`, data local, `A01/J01...` |
| Hora de observação | Hora aproximada visível, nunca usar como única associação entre pedidos |
| Praças necessárias | Seleção pelas **linhas/itens do próprio pedido**, testemunhada pela equipe; `DESCONHECIDA` se não puder comprovar |
| Quantidade de papéis por impressora | `BALCAOSUSHI1`, `BALCAOSUSHI2`, `DELIVERY SUSHI 1`, `DELIVERY SUSHI 2`, `COZINHA`, `CAIXA` e origem GP/Gestor (se identificável) |
| Tipo de papel | Produção, entrega, conferência existente, fiscal, outro/desconhecido; **nunca somar fiscal como via de produção** |
| Conteúdo e observações | `CONFERE`, `DIVERGE` ou `NÃO VERIFICADO`, apenas após comparação local com o pedido |
| Ligação do impresso ao pedido | `SIM`, `NÃO`, `INCERTA` |
| Faltou/duplicou/desviou? | `NÃO`, `SIM`, `INCERTO`, com tipo de anomalia sem dados pessoais |
| Cobertura | `COMPLETA`, `PARCIAL` ou `AUSENTE` |
| Saída tardia / reimpressão | `SIM`, `NÃO`, `INCERTA` e fonte identificável, se possível |

### Regras anti-falso-positivo
1. **Zero não é vazio**: só preencher 0 para impressora observada durante todo o intervalo relevante e para o pedido corretamente identificado. Em caso contrário, deixar vazio e classificar `INCOMPLETO`.
2. **Número de papéis não é número de pedidos**: uma via pode consolidar itens de mesma praça; duas vias não são automaticamente duplicata se correspondem a praças/funções diferentes. Não validar duas vias sem comparar conteúdo e destino.
3. **Fila Windows não é papel**: estado `Printed`/evento 307 não comprova saída física; ausência de papel visível não descarta submissão atrasada. Não mexer em filas/reiniciar impressoras para testar.
4. **GP/Gestor**: observar eventual papel normal, sem ativar sua impressão. `Gestor` e `Impressora GP iFood` podem estar abertos sem terem enviado papel; contagem de processos não é evento de impressão.
5. **Não imprimir folha de teste nem reimprimir comanda para completar amostra.** Não alterar energia, configuração, driver, porta, serviço, SQL, fiscal ou Retail.
6. **Não atribuir resultado conforme a turno inteiro se faltar praça, observador, identidade ou categoria na amostra.**

## Resumo seguro por turno — preencher somente após observação
Usar o registro local por aliases `A01…A20` ou `J01…J20` enquanto a saída normal acontece; **não** publicar IDs reais, fotos, nomes, itens, notas nem dados fiscais. Ao terminar, comunicar somente este resumo agregado, com testemunhas identificadas **localmente**, sem dados pessoais no repositório:

| Campo por turno | Almoço | Jantar |
|---|---|---|
| Data local (AAAA-MM-DD) | Não observado | Não observado |
| Pedidos disponíveis na janela | Não observado | Não observado |
| Pedidos consecutivos acompanhados (máx. 20) | Não observado | Não observado |
| Amostra consecutiva? (`YES/NO/UNKNOWN`) | UNKNOWN | UNKNOWN |
| Vínculo visual das vias ao mesmo pedido confirmado? | UNKNOWN | UNKNOWN |
| Todas as praças necessárias acompanhadas? (`ALL_REQUIRED/PARTIAL/UNKNOWN`) | UNKNOWN | UNKNOWN |
| Itens/quantidades conferidos? (`YES/NO/UNKNOWN`) | UNKNOWN | UNKNOWN |
| Observações do pedido conferidas? (`YES/NO/UNKNOWN`) | UNKNOWN | UNKNOWN |
| Saída tardia verificada até o fim do intervalo relevante? | UNKNOWN | UNKNOWN |
| Pedidos de uma praça / várias praças / praça desconhecida | Não observado | Não observado |
| Famílias efetivamente vistas (`SUSHI_1`, `SUSHI_2`, `HOT_ROLL`, `KITCHEN`) | Não observado | Não observado |
| Exceção de combinado dupla sem ambiguidade? | UNKNOWN | UNKNOWN |
| **Categorias** de anomalia observadas (sem repetir tipo) | Não observado | Não observado |

Esse quadro é **modelo**, não uma observação. `Não observado` e `UNKNOWN` jamais equivalem a zero ou a conformidade. O campo de tipos de anomalia agrupa **categorias distintas por turno**; ele não mede a quantidade de ocorrências nem de papéis. Um campo `content_compared=NO` conta como `CONTENT_MISMATCH`, `notes_compared=NO` como `NOTE_OMITTED` e **`identity_confirmed=NO` como `ORDER_IDENTITY_MISMATCH`**, **uma vez por tipo no turno**, mesmo que o mesmo tipo já esteja listado em `anomalies`. `identity_confirmed=UNKNOWN` continua insuficiência de observação (`D0`), nunca anomalia inventada. A contagem resumida não substitui o registro local de quantas ocorrências houve. Conservar a contagem e o vínculo individual **somente no acompanhamento presencial**. A informação agregada pode ser avaliada offline pelo classificador `tools/comandas_passive_paper_census_review_only.cjs`, cujo contrato aceita apenas dois turnos, campos fechados e nenhum identificador pessoal.


## Recorte adicional para censo presencial de domingo — evidência de metadados de 08/11

Os arquivos específicos de bridge `IMP` para `DELIVERY SUSHI 1` e `DELIVERY SUSHI 2` foram **modificados** por volta de **15h01** e **15h14 BRT** em 08/11/2026, dentro do almoço de domingo, embora essas impressoras tivessem sido informadas desligadas no almoço. A constatação é de **metadados de arquivo**, não de envio de `DLV_IFO`, papel físico ou estado de energia. Detalhamento com os tamanhos de seis destinos: [Matriz de proveniência de impressão](MATRIZ_CAMPOS_PROVENIENCIA_IMPRESSAO_ITAIM_20261102.md).

**Roteiro de observação já autorizada:** se o papel surgir naturalmente nesses destinos, conferir **qual pedido/praça**, atraso, duplicação e conteúdo pela equipe já presente, usando apenas alias local. Se não houver pessoa acompanhando a impressora ou o eventual retorno natural do equipamento, registrar `PARCIAL/UNKNOWN`; **não marcar zero**. Não energizar, reativar, reiniciar ou configurar impressora para produzir uma prova. Não contam fiscal, relatórios de entrega ou log de bridge como via de produção física.

## Classificação ao final — alinhada ao classificador offline da PR #135
- **`D1_SAMPLE_CONFORME_RELATADA_NAO_AUTENTICADA`**: em **ambos os turnos**, foram relatados todos os pedidos consecutivos disponíveis até o máximo de 20, vínculo visual, cobertura de todas as praças necessárias, comparação de itens e notas e verificação de papel tardio. **Além disso**, cada turno deve incluir amostras de **uma e múltiplas praças**, todas as quatro famílias (`SUSHI_1`, `SUSHI_2`, `HOT_ROLL`, `KITCHEN`) e nenhuma ambiguidade sobre combinado dupla. Sem categorias de anomalia relatadas. **É somente classificação provisória do relato**, não prova autenticada de papel, de ausência global de duplicações ou de correção operacional; o sistema permanece `HOLD`.
- **`D2_ANOMALIA_RELATADA_REQUER_APURACAO`**: qualquer categoria de falta, duplicação, praça errada, conteúdo/observação divergente, saída tardia, papel inesperado GP/Gestor, ilegibilidade ou origem desconhecida **relatada**. A ligação contraditória comprovada visualmente (`identity_confirmed=NO`) também é D2 sob `ORDER_IDENTITY_MISMATCH`, sem confundi-la com vínculo não verificado (`UNKNOWN`/D0). A divergência explícita `NO` em conteúdo ou observações também é D2 mesmo que a lista de categorias esteja vazia. Investigar localmente sem reimprimir, limpar fila ou expor dados. D2 **não autentica a causa física ou a origem**.
- **`D0_EVIDENCE_INSUFFICIENT`**: não houve observação ou faltou um dos turnos, almoço e jantar têm datas locais distintas, a amostra de pedidos disponíveis não foi consecutiva/completa até 20, alguma conferência está `UNKNOWN`, falta uma família ou um dos tipos de composição, houve ambiguidade, ou o registro não atende o esquema seguro. **D0 não significa que a impressora falhou**. Quando houver menos de 20 pedidos disponíveis, observar todos é permitido; ainda assim, faltando cobertura de famílias/rotas o resultado fica D0.
- **`PAPER_CENSUS_NOT_YET_COLLECTED`**: estado factual da operação enquanto nenhuma testemunha informar observações, independentemente de resultados de teste sintético.

O classificador só produz rótulos `D0/D1/D2` sobre dados *declarados*, sempre com `review_status=HOLD`, `native_paper_sample_proven=false` e sem qualquer permissão de impressão, reimpressão, SQL, sequência, serviço, deploy ou transição de etapa. O protocolo humano e a revisão da prova física são etapas **externas** ao classificador.
## Fronteira de autorização e futuro
A autorização humana permite **organizar e realizar observação visual passiva**; não autoriza emissão de ticket adicional, acesso SQL, obtenção de token, mudanças de impressão, deploy, merge nem automação física. A consulta agregada `DLV_IFO→CDCAIXA` permanece **não autorizada** e é uma decisão separada. Não declarar `FIRST_NATIVE_DISPATCH=PROVEN` apenas pelo censo — mesmo com D1, o callsite continua desconhecido, apenas deixa de ser obrigatório **se** a arquitetura preservar integralmente a via nativa.

**Prova posterior indispensável para 10/10:** conferência independente alimentada pela mesma revisão, número TATÁ persistente e exclusivo, destino único para papel de conferência, não duplicidade, validação de exceções/cobertura em outros dias, aceite humano e regressão operacional. Sem efeito físico executado agora.
