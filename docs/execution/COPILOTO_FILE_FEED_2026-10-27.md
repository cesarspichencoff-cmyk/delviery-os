# Leitura limitada de eventos TATÁ para o copiloto

## Entrega

Biblioteca de servidor `runtime/reporting/copiloto_tata_file_feed_v1.cjs`: diretório de eventos → adaptador nativo → política temporal explícita → motor TATÁ existente → projeção minimizada do copiloto. Está em revisão; não instalada no caixa nem ligada a rota HTTP. Não implementa autenticação, não atribui modo real à fonte e não publica pedidos.

O chamador deve fornecer raiz absoluta confiável, escopo autorizado com procedência e relógio/política de atualização. O objeto de escopo não é prova de login. A configuração não pode ser derivada de parâmetros enviados pelo navegador. O contrato de autenticação humana do projeto permanece necessário antes de qualquer rota real.

## Comportamento comprovado

- Limite padrão de 250 entradas e 8 MiB totais; máximo configurável de 1.000 entradas/32 MiB, 1 MiB por arquivo. A leitura usa buffer limitado mesmo se um arquivo crescer durante a consulta.
- Diretório com excesso, entrada inesperada, link simbólico, JSON corrompido, identidade ausente ou arquivo inacessível retorna indisponível. Não devolve resultado parcial como inventário completo.
- Confere identidade/tamanho/mtime dos arquivos abertos e novamente ao final, além de mudança do diretório. Isso detecta as alterações exercitadas nos testes; não é snapshot transacional do sistema de arquivos nem defesa contra administrador malicioso que restaure metadados.
- Registros fora da unidade/loja são excluídos. Observações históricas fora da janela são ignoradas; não são reemitidas como atuais. Data futura na fonte correspondente interrompe a leitura.
- Um evento atual bloqueado pelo produtor interrompe a resposta, evitando manter uma versão antiga daquele pedido como se a revisão nova não existisse. Um evento histórico bloqueado não é reativado pela biblioteca.
- Conflitos de mesma data são preservados pela projeção. Nome de cliente, observações e coordenadas não são retornados. Nenhum arquivo é alterado, nenhum checkpoint é reiniciado e não há associação automática a viagem/GPS.
- Diretório vazio significa ausência de evidência. `operational_order_total` permanece null, `live_source_verified` false e a cobertura é declarada como observações limitadas, não inventário de pedidos ativos.

## Provas

- `node tests/tata-reader/run-file-feed-tests.cjs`: 19 cenários PASS com arquivos sintéticos temporários, incluindo cadeia completa de leitura, limites, corrupção, conflito e mudanças durante leitura.
- `node tests/tata-reader/run-copilot-reader-adapter-tests.cjs`: 15 famílias PASS.
- `node tests/tata-reader/run-copilot-orders-tests.cjs`: 9 famílias PASS.
- Nova suíte registrada no CI de produto, junto às duas existentes.
- Commit anterior b58c48aa: CI de produto 40455916162 e Android 40455915994 concluídos com sucesso. Não equivalem à validação remota deste delta.

## Próxima integração

A seleção padrão usa o checkpoint nativo, limitado pelo próprio produtor a 250 entradas. Ela valida schema/bootstrap, unidade/loja, igualdade entre snapshot_hash e emitted_hash e estabilidade. Deriva o nome do evento pelo mesmo algoritmo observado no watcher; confere order_key, hash e as quatro identidades do evento. Arquivo faltante, revisão pendente, duplicação conflitante e checkpoint alterado durante a leitura retornam indisponível. Não há escrita no checkpoint. O modo directory permanece apenas uma alternativa explícita para ensaios pequenos.

Inspeção somente de metadados no Caixa Mooca em 27/10: varredura limitada encontrou pelo menos 1.001 arquivos históricos (parou nesse limite; não é contagem total). Checkpoint: 250 entradas, bootstrap completo; 250 vínculos à fonte 0001/01, 250 arquivos referenciados existentes, zero ausentes e zero revisões pendentes na observação. Não foram exportados identificadores ou conteúdos de pedidos. Esse resultado confirma a viabilidade de localizar arquivos pelo checkpoint, não valida seus conteúdos nem prova inventário ativo completo.

A suíte inclui mais de mil arquivos históricos sintéticos inválidos e comprova leitura apenas do evento referenciado; também recusa revisão pendente, identidade divergente, arquivo faltante, checkpoint duplicado e mudança durante a leitura. O checkpoint conserva somente as últimas 250 entradas por abertura: portanto a cobertura nunca deve ser anunciada como todos os pedidos ativos. Seu mtime recente não renova observed_at de pedidos antigos.

A próxima entrega de produto continua sendo leitura autenticada na tela: identidade individual e vínculo Itaim comprovados, configuração confiável da fonte/tempo, evento nativo novo válido e validação de conteúdo/atualização. Não duplicar o leitor SQL já existente. Depois, recibos por unidade e ensaio físico Android. Backup recorrente e cópia criptografada fora do host continuam requisitos para operação, sem bloquear esta preparação de código.
