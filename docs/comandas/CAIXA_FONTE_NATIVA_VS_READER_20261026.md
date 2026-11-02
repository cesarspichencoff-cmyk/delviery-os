# TATÁ Comanda — inspeção autorizada de fonte e revisão (26/10/2026)

**Situação:** leitura passiva concluída; validação de origem independente do Gestor iFood ainda NÃO comprovada. **DRAFT/HOLD, nenhuma escrita na operação.**

## Autorização e fronteira
César autorizou expressamente ampliar a inspeção **somente de leitura** na CAIXA_MOOCA, para verificar a origem de registros do Gestor iFood/Teknisa e comparar apenas campos necessários à identidade e composição de pedidos. A inspeção não concedeu licença para instalar, iniciar/reiniciar serviços, conceder SQL, ativar API, ler credenciais/cookies/cache/sessão, escrever sequência TATÁ, usar spooler, imprimir, alterar fiscal ou aplicar código.

Identidade do host confirmada diretamente: `[Environment]::MachineName` retornou exatamente `CAIXA_MOOCA`. Conexão SQL local pelo Windows Integrated Security, `ApplicationIntent=ReadOnly`, consulta parametrizada `SELECT`, `LOCK_TIMEOUT 1500`, `CommandTimeout 5–6s`, sem DML/DDL. Permissão de leitura confirmada para `TEKNISA.COMANDAVEN`, `TEKNISA.VENDAREST` e `TEKNISA.ITCOMANDAVEN`. As consultas não devolveram identificadores, nomes, produtos individuais ou textos de clientes ao relatório — somente contagens e provas booleanas.

## Fonte nativa Teknisa efetivamente acessada
O watcher V2 instalado consulta `TEKNISA.COMANDAVEN` + `TEKNISA.VENDAREST` + `TEKNISA.ITCOMANDAVEN` + `TEKNISA.PRODUTO`. Campos de ligação: `CDFILIAL,CDLOJA,NRVENDAREST,NRCOMANDA,NRCOMANDAEXT,IDORGCMDVENDA,DTHRABERMESA`; itens: `NRPRODCOMVEN,CDPRODUTO,CDARVPROD,QTPRODCOMVEN,IDSTPRCOMVEN`; notas: `DSOBSCOMANDA,DSOBSDESCIT,DSOBSPEDDIGCMD,TXPRODCOMVEN`.

Em uma consulta bounded dos **32 registros mais recentes** desde 25/10, todos do dia 25/10, 30 possuíam `IDORGCMDVENDA=DLV_IFO` e 2 possuíam `DLV_NMO`; **32/32** tinham os três identificadores externos/internos preenchidos. Distribuição dos códigos de situação (não interpretados): 25 `P`, 6 `X`, 1 `4`. Essas 32 linhas **não** são uma contagem exaustiva do dia ou prova de recebimento no Gestor.

## Prova cruzada de MESMA origem: SQL nativo ↔ eventos do leitor
As **cinco emissões mais recentes** de `state/reader-events-v1` eram de 25/10, todas com origem `DLV_IFO`, chave em quatro partes e `snapshot_hash` presente. Foi efetuada consulta SQL parametrizada por cada chave completa. A comparação em memória obteve:
- **5/5** registros nativos encontrados por `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`;
- **5/5** correspondências de `NRCOMANDAEXT` e `IDORGCMDVENDA`;
- **5/5** correspondências completas em número de itens, identificador da linha, código interno/canônico, quantidade e situação de cada item;
- **5/5** correspondências exatas da coleção de observações reconstruída da fonte (`source_field`, conteúdo textual, escopo, `item_index`, `CDPRODUTO` e ligação); as cinco tinham pelo menos uma observação e `observation_scan_complete=true`;
- **0/5** estavam `ready_for_downstream_shadow=true`.

**Controle de revisões/duplicidade:** as cinco emissões mais recentes abrangem **três pedidos distintos e cinco snapshots distintos** (cinco hashes). Uma segunda seleção das cinco revisões mais recentes com notas de item abrangeu **dois pedidos distintos e cinco snapshots distintos**, com **5/5 correspondências exatas** entre a coleção de observações por pedido/item no SQL e os eventos (`source_field`, texto, `item_index`, `CDPRODUTO`, escopo). Na amostra de 80 eventos mais recentes, 27 tinham notas de item e 76 tinham notas gerais; isso é distribuição de **revisões**, não quantidade de pedidos únicos. Nunca reportar `5/5` como cinco pedidos independentes.

Essa prova autentica a fidelidade dos dados do Reader **à mesma fonte SQL nativa**, NÃO a origem do Gestor iFood por evidência independente, nem snapshots completos de outros pedidos/revisões. Valores individuais, observações, PII e IDs não foram gravados ou exibidos.

## Estado da fonte independente Gestor
Processos `Gestor de Pedidos` e `Impressora GP iFood` observados em execução; ambos instalados em `C:\Program Files (x86)`. **Processo ativo ≠ pedido comprovado.**

O log próprio `C:\Users\Tata\AppData\Roaming\Gestor de Pedidos\log.log` foi verificado para **contagem de sinais textuais apenas**: ~150 KB, 1.791 linhas, modificado em 26/10, sem ocorrências de `orderId`, `displayId`, `shortCode` ou UUID estruturado. Não forneceu identificador para ligação exata. Outro diagnóstico `gestor-linx-app/logs/main.log` tinha 1.159 bytes, última alteração em junho, sem chaves/UUID de pedido; não serve à amostra de outubro. Nenhum log bruto foi reproduzido.

**Tentativa de contra-rota sem efeitos:** seis processos `Gestor de Pedidos` estavam ativos, mas nenhum expôs `MainWindowHandle` na sessão de execução remota (`windowed=0`); portanto não havia uma janela acessível para inspeção passiva do número de pedido por automação de acessibilidade. Nenhum clique, foco, captura de tela ou leitura da UI foi realizado. **Não repetir essa via na sessão remota atual sem mudança real de superfície.**

A integração separada `ifood-analytics-d1-status.json` estava em `BLOCKED_MISSING_AUTH_CONFIG`, sem qualquer snapshot na pasta prevista, desde inspeção anterior. **Não ativar API, criar sessão ou pedir credenciais**: César já havia definido a rota sem dependência de API/credenciais iFood. Pastas de `IndexedDB`, `Local Storage`, `Network`, `Session Storage`, `Cache`, `Preferences` não foram inspecionadas, pois podem conter credenciais/sessões e não constituem exportação autorizada de pedidos. Também não foram tocados spooler, filas ou impressoras.

## Critérios remanescentes antes de 10/10
1. Obter **uma fonte independente e autorizada do Gestor** com a mesma unidade, dia e ID curto, itens, quantidades e observações, por mecanismo de leitura/exportação legítimo já existente — sem API nova, scraping de sessão, spooler ou vazamento de dados pessoais. Se indisponível, `INDEPENDENT_IFOOD_JOIN=UNKNOWN`.
2. Reconciliar a identidade Gestor → Teknisa → Reader V2 → decisão V6.8 para a mesma revisão, recusando colisão, cancelamento, falta de notas e alteração concorrente. A prova SQL↔Reader acima é apenas uma seta dessa cadeia.
3. Demonstrar binding persistente, idempotente e não fictício da sequência TATÁ: fonte na operação em 26/10 continuava com `bindings=[]`, `next_value=1`. Simulação não autoriza escrita no caixa.
4. Resolver regras de produtos e destino A/B com fonte atual; não inferir impressora por almoço/jantar; nenhuma classificação de 14 itens promovida por nome ou rota histórica.
5. Validar candidato em CI do commit exato, implantação reversível, exclusividade de supervisor, prevenção de duplicidade com GP iFood e três vias físicas Epson em piloto específico autorizado.
6. Só após prova na realidade operacional e aceite humano, registrar `WORLD_PROVEN`/`HUMAN_ACCEPTED`. Até lá, manter PRs em **DRAFT/HOLD** e impedir alterações físicas.

## Veredito
`SQL_NATIVE_READ=PROVEN`; `READER_SQL_PARITY_SAMPLE_5=PROVEN`; `READONLY_EFFECTS=OBSERVED`; `GESTOR_INDEPENDENT_ORDER_SOURCE=UNKNOWN`; `SEQUENCE_BINDING=ABSENT_IN_OBSERVED_STATE`; `SHADOW_READY=0`; `PHYSICAL_PRINT=NOT_PROVEN`; **10/10 NÃO ALCANÇADO.** Não reiniciar caminhos de inferência de turnos rejeitados por César.
