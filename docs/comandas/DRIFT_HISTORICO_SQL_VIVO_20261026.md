# TATÁ Comanda — divergência temporal entre relatório iFood, leitor e SQL vivo (26/10/2026)

**Escopo:** somente observação/engenharia offline. Nenhuma alteração de caixa, DB, sequência, spooler, impressoras, ERP ou credenciais. Dados de clientes, UUIDs e chaves de pedidos não reproduzidos aqui.

## Três superfícies diferentes do mesmo dia operacional (25/10)

1. **Exportação oficial iFood**, fornecida por César: 314 pedidos individuais, 313 CONCLUIDO e 1 CANCELAMENTO PARCIAL; contém número curto/UUID, mas não itens. Fonte historicamente congelada no arquivo.
2. **Leitor/histórico local**, que havia projetado 331 comandas das origens DLV no dia. Nova auditoria passiva de `state/reader-events-v1` encontrou **666 revisões associadas a 331 chaves compostas distintas** de 25/10. Snapshot histórico, não releitura atual do ERP.
3. **SQL Teknisa no caixa**, na primeira auditoria (26/10): 317 `DLV_IFO` +12 `DLV_NMO` +2 `DLV_FOS` = 331. Cruzamento por número curto, loja e dia com o arquivo iFood: 311 presentes em ambos, 3 apenas no iFood, 6 apenas na Teknisa. Somente correspondência candidata, não UUID autenticado.

**Releitura direta em 26/10 às 19h37 (-03:00):** 312 `DLV_IFO` (status P=283, X=25, 4=4), 12 `DLV_NMO` (P=11, X=1) e 2 `DLV_FOS` (P=2) = **326 comandas DLV**. Em comparação ao retrato anterior: `DLV_IFO/X` caiu de 30 para 25, todos os demais totais preservados no recorte. A consulta agregada em SQL confirmou 326. Não atribuir causa às cinco linhas sem evidência independente.

## Confronto de chaves, sem exportar IDs
Uma execução separada comparou **as chaves compostas em memória** dos 666 eventos arquivados com as chaves que a consulta SQL ainda retornava:
- leitor: 331 chaves distintas;
- SQL da unidade/data: 326 chaves distintas;
- **cinco chaves arquivadas já não apareciam no resultado SQL atual**;
- as cinco tinham registros históricos com os estados `3` e `X` (duas chaves com ambas as evidências numa ordem de leitura, três na inversa; a ordem de leitura de arquivos **não comprova** uma transição cronológica).
- nenhuma chave/UUID/cliente foi devolvida pela consulta de auditoria.

Isso comprova uma **divergência temporal observável de presença**, NÃO a causa de exclusão, mudança de status, migração, cancelamento, perda financeira ou falha de produção. Não alegar que o ERP apagou dados sem provar o mecanismo. A consulta de 25/10 executada no dia seguinte não é um snapshot imutável de 25/10.

### Restrição sobre os estados
Na exportação independente, 310 dos 311 pedidos originalmente coincidentes estavam CONCLUIDO e um CANCELAMENTO PARCIAL (ID curto 0502). Na releitura nativa, excluindo apenas as seis entradas conhecidas exclusivas da Teknisa, apareceram **306 registros (282 P + 24 X)**; o pedido correspondente à exportação parcial 0502 tinha estado nativo P. Assim, **X não pode ser automaticamente equiparado ao cancelamento no relatório iFood**. Essa análise segue baseada em chave curta+loja+dia, não autenticação de UUID no SQL. P, 3 e 4 também continuam semanticamente UNKNOWN.

## Falha de processo identificada e correção técnica
Falha: relatar `311 correspondências` sem vinculá-las ao **momento e conjunto exatos de cada captura**, assumindo implicitamente estabilidade do SQL vivo. Regra: para comparações de fontes independentes, distinguir fotografia imutável do relatório versus conjunto SQL consultado; registrar data-hora de captura e não declarar identidade perpetuamente estável.

A PR #127 atualiza `tools/comandas_reconciliacao_fontes_v1_offline.cjs`:
- requer `ifood_captured_at` e `native_captured_at` com fuso explícito;
- devolve a diferença temporal em minutos e motivo `SOURCE_CAPTURE_WINDOWS_NOT_CONTEMPORANEOUS` para intervalo maior que 15 min;
- nunca afirma `independent_snapshot_currency_proven`, mesmo que o horário declarado seja idêntico — timestamp inserido pelo chamador **não é assinatura de snapshot**;
- mantém todos os efeitos de SQL/print/sequence/fiscal desligados, e os IDs/UUIDs não são expostos;
- ao faltar metadado de captura, rejeita o lote com `SOURCE_CAPTURE_TIMESTAMPS_REQUIRED`.

**Verificação isolada:** 25/25 testes sintéticos PASS no Foxxy, incluindo ausência de timestamp, relógios divergentes e cenário histórico 314×317/311×3×6. O teste já está na workflow Linux/Windows da PR; aprovação hospedada só vale quando o **HEAD correspondente** estiver green.

## Recomendação de continuidade
Não forçar atualização da contagem histórica 331 para 326 como se fossem métricas equivalentes. O leitor preserva prova histórica que já não é igual ao SQL atual; o relatório oficial iFood contém outra seleção de pedidos. O próximo contrato operacional requer origem confiável, identidade forte ou aceitação humana do menor nível de autoridade, política nativa de estados provada, fontes atuais de praça/classificação, sequência idempotente com autorização separada, janela reversível e aceite físico.

**Estado:** DRAFT/HOLD, sem implantação. FACT (capturas anteriores) ≠ FACT (consulta atual); nenhuma delas isoladamente prova causalidade.
