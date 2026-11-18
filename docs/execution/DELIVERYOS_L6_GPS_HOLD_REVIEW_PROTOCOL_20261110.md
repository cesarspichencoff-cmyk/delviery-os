# Delivery OS Itaim — revisão segura de GPS retido (L6)

**Data:** 10/11/2026  
**Escopo:** Entregas Android, PR #137, apenas desenvolvimento e provas isoladas.  
**Estado:** `PROTOCOL_DEFINED / REMOTE_RECONCILIATION_NOT_IMPLEMENTED / FIELD_HOLD`.  
**Sem efeito:** não altera SQL, caixa, aparelhos, backend, dados de clientes, GPS real, impressoras, instalação, merge ou deploy.

## 1. Por que existe

O aplicativo guarda cada ponto em SQLite Room com `pointId`, `idempotencyKey` e `sequenceLocal` estáveis. O lote GPS usa `POST /api/gps/batch` na plataforma. Para respostas **409/422 sem recibo individual**, `SyncWorker` preserva a amostra como `failed`. Após **três tentativas totais** de envio, `GpsPointDao.nextBatch()` deixa de selecioná-la para reenvio automático. `reviewRequiredCount()` continua contabilizando-a; a tela avisa ao motoboy que deve procurar o responsável.

**Não inferir:** HTTP 409 ≠ confirmação de duplicata; HTTP 422 ≠ prova de rejeição de uma amostra específica; HTTP 200 sem contagem/identidades válidas ≠ recibo; `Result.failure()` não é recibo do servidor. Um lote pode ter sido parcialmente persistido antes de retornar erro. Uma nova requisição sem prova pode duplicar efeitos ou esconder uma divergência de identidade.

O cliente Android atualmente expõe `sendPoints()` e **não contém uma chamada de leitura de recibo por `idempotencyKey`**. Esta constatação é sobre o código do cliente, não garante que o backend não tenha uma consulta privada equivalente. Portanto, **não há procedimento automático de desbloqueio implementado**.

## 2. Orientação para operação (hoje)

Quando o aviso aparecer, o motoboy **não** deve excluir dados, limpar armazenamento, reinstalar o aplicativo, trocar o aparelho, forçar o GPS ou insistir repetidamente em sincronizar a mesma amostra. Ele pode continuar as entregas e registrar novos pontos conforme a política de captura autorizada. Deve comunicar ao responsável que há registros guardados, sem copiar coordenadas ou identificadores para mensagens.

O responsável confirma o número agregado no próprio dispositivo, o horário aproximado da ocorrência, o estado de rede e se o uso normal continua. Não altera uma linha do Room e não executa `POST /api/gps/batch` por fora. Se a falha for recorrente, registra um incidente com **quantidade**, categoria `409/422` quando verificada por canal autorizado, versão de software e janela de tempo aproximada; não inclui corpo bruto de pedido, token, localização, `device_secret`, `idempotencyKey` ou `pointId` em e-mail, chat ou issue pública.

**Acesso a dados de linha:** requer canal técnico autenticado, autorizado para aquele dispositivo e unidade, com custódia, minimização e auditoria. O `status()` entregue ao Rider possui **somente contagem**, não detalhes dos pontos. Não adicionar à ponte JavaScript método que exporte linhas/coordenadas para facilitar suporte.

## 3. Matriz de decisão — nenhum atalho

| Evidência independente obtida no servidor | Classificação | Ação permitida hoje |
| --- | --- | --- |
| Não há consulta, consulta falhou, timeout, HTTP 409/422 ou relatório sem identidade individual | `UNKNOWN` | **Manter HOLD**, preservar o Room e escalar para responsável |
| Plataforma informa `NOT_FOUND` para uma chave, sem prova de cobertura/transação/identidade | `UNKNOWN` | **Manter HOLD**; ausência de leitura não comprova que o primeiro envio não foi persistido |
| Evidência de objeto diferente, dispositivo/unidade divergente, credencial revogada, recibo sem origem ou identidade não conferível | `CONFLICT` | **Manter HOLD**, incidente de segurança/integração |
| Confirmação autenticada de persistência com `pointId + idempotencyKey + deviceId + unitId` correspondentes, vinculada a registro durável e emitida por canal autorizado | `RECEIVED_PROVEN_CANDIDATE` | **Ainda HOLD no aplicativo atual**; só um reconciliador futuro validado poderá executar transição condicional, mediante autorização |
| Recusa definitiva por **aquele ponto** com identidade e motivo categórico verificáveis, sem dúvida sobre parcialidade | `REJECTED_PROVEN_CANDIDATE` | **Ainda HOLD no aplicativo atual**; só transição futura, autorizada e testada, pode marcar `rejected` |
| Operador viu “sucesso” no painel, contador de lote fechou, lote não aparece em dashboard ou servidor diz “pode reenviar” sem chave | `INSUFFICIENT` | **Manter HOLD**; nenhuma decisão terminal |

A coluna de evidência descreve **requisitos para uma capacidade futura**, não uma API ou recibo que já tenha sido comprovado. Até a reconciliação existir, **NÃO** chamar diretamente `GpsPointDao.markSent()`, `markRejected()`, `markFailed()` com erro artificial, manipular `attempts` nem zerar `lastError` para desbloquear.

## 4. Contrato mínimo para futura reconciliação — ainda não autorizado

1. **Leitura independente e autenticada** de um registro persistido por chave de idempotência, com escopo `unitId = ITAIM`, `deviceId` e `pointId`. Comprovar procedência, integridade, frescor, estado terminal e se a leitura cobre o registro procurado; `NOT_FOUND` sozinho nunca dá autorização de reenviar.
2. **Correspondência exata** entre o registro Room e o registro persistido: dispositivo, unidade, chave, identificador, sequência e versão do contrato. Um resultado de lote com contagens agregadas, sem mapeamento fechado de rejeições por chave, não substitui evidência individual para resolver um HOLD antigo.
3. **Canal técnico privilegiado**, separado da tela do motoboy e sem exportar coordenadas/PII. Ações condicionadas a sessão de suporte autorizada, justificativa, correlação, registro de auditoria e aprovação humana explícita para qualquer efeito sobre amostras reais.
4. **Transição atômica e conservadora**, só no banco **do mesmo aparelho**, para o mesmo `pointId + idempotencyKey`, quando o estado ainda for `failed` com `attempts >= 3` e erro exato `lote_gps_sem_recibo_http_409` ou `..._422`. Se o estado mudou após a leitura, abortar; nunca atualizar uma lista inteira por contagem.
5. **Retenção da prova mínima**: identidade técnica mascarada/atestado interno, classe de decisão, horário e identificador do recibo em registro de auditoria protegido; não colar dados brutos em issue GitHub. Não modificar dados da amostra GPS nem `sequenceLocal`.
6. **Ensaios negativos antes de campo**: recibo adulterado, atraso e corrida NOW/PERIODIC, chaves trocadas, dois dispositivos, outra unidade, chave reaproveitada, `NOT_FOUND`, reabertura Room, falha após commit e duplicatas concorrentes. A recuperação deve ser repetível sem marcar nada como recebido sem prova.
7. **Rollback que preserva amostras**: desligar a função de reconciliação não apaga `gps_point`; pontos antigos continuam retidos. Nenhum botão de “liberar todos”.
8. **Gate de campo separado**: provas de laboratório não autorizam testes em Xiaomi nem backend real. Exigir consentimento, aparelho/ator/ambiente identificados e autorização delimitada para qualquer operação real.

## 5. Ameaças e falhas que não podem reaparecer

- **Reenvio infinito:** `nextBatch()` filtra especificamente 409/422 retidos após três tentativas totais; reinício de Activity não desfaz o bloqueio.
- **Falso OK:** `SyncWorker` verifica `reviewRequiredCount() > 0` ao decidir o resultado. Mesmo com fila elegível vazia, não devolve sucesso global se houver HOLD.
- **Bloqueio total da fila:** um ponto novo continua elegível e pode avançar enquanto o antigo segue retido.
- **Corrida entre workers:** `markFailed()` recusa reabrir HOLD por erro atrasado sem recibo. Um recibo efetivamente validado pode alterar ponto antigo conforme código existente; isso não é autorização para operador criar recibo.
- **Vazamento de motivo remoto:** no caminho 2xx com rejeição identificada, só o **código local fixo** `gps_recusa_individual_recebida` é persistido; nunca texto livre recebido em `rejections[].motivo`.
- **Confusão entre 400/403 e 409/422:** o código atual possui um contrato **terminal específico de 400/403** e distinção de 403 de credencial. Não alterar essa decisão retroativamente sem auditoria própria e validação do domínio; este protocolo trata somente os HOLDs sem recibo 409/422.

## 6. Estado, prova e próximo passo

**Comprovado até a PR #137 antes desta documentação:** 302 testes Room e prova visual em WebView Android 34, com screenshot da tela efetivamente carregada e ponto fictício retido. A PR foi mantida DRAFT sem merge.

**Desta etapa:** registrar protocolo e testar que motivo livre de resposta 2xx não entra no Room. A aprovação da CI específica ao novo código deve ser consultada pelo commit — **não presumir que testes passados homologam uma alteração nova**.

**Pendente:** confirmar se a plataforma oferece consulta autenticada por chave com escopo individual. Sem tal contrato e prova independente, não construir um desbloqueador. Depois, solicitar autorização específica para implementar/testar a rota de suporte; sem isso, permanecer `RECONCILIATION=HOLD`. `L6_XIAOMI_FIELD=NOT_RUN`, `V1_FIELD_ACCEPTED=0/8`.
