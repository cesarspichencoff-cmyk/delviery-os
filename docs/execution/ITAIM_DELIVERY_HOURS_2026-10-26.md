# Horários do delivery do Itaim — regra ativa

Fonte: confirmação direta de César nesta conversa em 26/10/2026. Esta regra resolve a pendência de recuperação dos horários semanais; não perguntar novamente por ausência de outro registro.

| Dias | Almoço | Jantar |
|---|---|---|
| Segunda a sexta | 11h–15h | 18h–23h |
| Sábado e domingo | 11h–16h30 | 18h–23h |

O início pertence à janela e o encerramento fica fora dela. Não foram acrescentadas exceções de feriados ou dias fechados. A política usa a data/hora local nativa de abertura do pedido e a zona declarada America/Sao_Paulo; não escolhe turno usando o relógio atual. A nova vigência começa em 26/10. Não reclassifica eventos históricos.

## Implementação e aplicação

- Política versionada: `tools/windows-local-lab/production-service-weekly-policy.json`. No host fica em `C:\ProgramData\TataComandaReader\bin\production-service-weekly-policy.json`, sob a ACL já existente: administradores/SYSTEM escrevem; serviço lê.
- Resolvedor: `runtime/tata-reader/read_service_weekly_v1.ps1`. Somente a função `Read-ServiceState` do watcher instalado foi substituída por AST, com os demais bytes preservados. Nenhuma query SQL, permissão ou rotina de impressão foi alterada. O candidato é reconstruível a partir do watcher anterior preservado no backup, substituindo o intervalo AST dessa função pelo conteúdo versionado do resolvedor.
- Instalador: `tools/windows-local-lab/install-weekly-service.ps1`, modos Plan/Apply. Exige hashes da base e recibo de 82 testes, verifica a ausência de escritores após parar o serviço, troca os arquivos atomicamente, atualiza o hash fixado no supervisor e prova dois lotes completos. Possui recuperação automática; esse caminho completo não foi induzido após a correção da gravação atômica.
- Checkpoint, eventos anteriores e arquivo legado `production-service-state.json` foram preservados. O arquivo de 14/10 é histórico e não é mais a autoridade de turno do watcher atualizado. Não houve replay ou limpeza de deduplicação para fabricar um evento novo.

A primeira tentativa falhou porque o Windows PowerShell 5.1 converteu o argumento de backup nulo de `File.Replace` em caminho vazio. O serviço foi restaurado manualmente após conferir os hashes originais. O gravador foi corrigido para usar um caminho temporário explícito; criação, troca e restauração passaram em três testes isolados antes da nova tentativa. Os dois temporários desse erro foram removidos após conferência de nome e hash.

Aplicação final comprovada em `2026-10-27T02:21:03.0784385Z` (26/10, 23h21 em São Paulo): `APPLIED_HEALTHY`, dois lotes OK, zero falhas consecutivas, hash verificado pelo supervisor e checkpoint avançando, com processo do serviço e execução do supervisor estáveis. Watcher `92B33E82ED72426BE46FE20BCB2A4F4557F9716108886F89E15A4E262C506D44`; política `50F4028BA11FFA6AECE4140B56C26FD200B28CFA4A774E989D67069BBC729090`.

## Provas e limites

Os 82 cenários da regra passaram no Windows PowerShell 5.1, incluindo todos os limites dos sete dias, virada de semana, datas anteriores à vigência, sobreposição, mapeamento errado e política ausente/corrompida. Três testes adicionais verificam o gravador atômico sem serviço ou SQL. O CI do produto ganhou um job Windows para essas verificações.

A tela do diagnóstico foi atualizada com a tabela semanal e separa o arquivo legado da regra recorrente. Sete verificações no host passaram, incluindo sessão, recusa de motoboy/escrita e navegador Edge em 390/1440 pixels. A amostra limitada continua contendo 20 eventos históricos bloqueados; isso não prova bloqueio atual nem ausência de pedidos. Nenhum evento genuíno posterior à instalação foi observado na inspeção final. Não foi criado evento sintético no diretório do produtor.

A publicação de pedidos permanece desativada. Os timestamps nativos observados têm Kind Unspecified e não carregam offset; sua conversão para instantes exige política explícita antes da projeção de pedidos do Copiloto. Isso é separado da seleção de turno por horário local nativo. Sessão humana individual, procedência, integração de pedidos e Android físico continuam em andamento. GPS continua desligado.

Prova sanitizada: `evidencias/mooca-local-2026-10-26/weekly-service-policy-proof.json`. Os runs anteriores de produto `40433838511` e Android `40433838401` concluíram com sucesso em `283f1502`; não são prova do commit desta alteração.
