# Delivery OS — implementação Itaim e validação local
Data: 25/10/2026.

A proteção Itaim-only foi implementada e testada localmente. Este resultado não libera uso operacional.

- Repositório: `cesarspichencoff-cmyk/delviery-os`.
- Base integral: `07b5bb098f970b039c0fe387c33fdfb6a85b6682`, com 1.876 blobs presentes.
- Branch local: `work/itaim-only-20261025`.
- Implementação: `3ac9e08d82d1dabc697e0047c9a640e8efe9d87c`.
- Código final testado: `37331b33f92b2d8b7457ce479ac6978a9a72e71b`.
- PR #126 revalidada: aberta, DRAFT, HEAD remoto ainda na base acima. Nenhum envio remoto foi feito.

## Comportamento implementado

O servidor valida a unidade do piloto, a variável de ambiente, a configuração GPS e o termo antes de criar persistência ou iniciar o servidor. Configuração explicitamente indicada e ausente é recusada. A ausência da configuração padrão continua mantendo geofence indisponível, sem coordenadas inventadas.

Uma identidade de aparelho de unidade diferente recebe `capture=false` antes de qualquer consulta à viagem. As leituras GPS recusam respostas HTTP 200 com unidade ou viagem divergente/ausente e rotas contendo ponto de outra viagem. Essas falhas não devolvem coordenadas.

As fixtures afetadas foram alinhadas ao Itaim, mantendo dados sintéticos e as restrições do termo de laboratório. O teste de despacho agora aguarda o processo terminar antes de apagar seus arquivos. O roteiro Q-018 teve suas identidades e configurações de laboratório alinhadas; sua execução completa continua pendente.

## Provas

A compilação completa `npm run -s build:platform` passou na base e após as alterações. A rodada final foi executada no código `37331b3`.

| Verificação | Resultado |
|---|---|
| Inicialização do servidor | 8 recusas e 1 aceite |
| Despacho GPS por HTTP | 15/15, incluindo 9 recusas de escopo e recuperação |
| Controle de captura por HTTP | 8/8 |
| API do aparelho com servidor real | 50/50 |
| Termo sintético | 10/10, incluindo controles por mutação |
| Estrutura Android | 43/43; não equivale à execução Kotlin |
| Localização e autorização canônicas | 3/3 e 6/6; portas sintéticas |
| Offline, persistência, autorização, assinatura e recibos/replay | Demais suítes da rodada aprovadas |
| Total da rodada final | 27 suítes aprovadas; 2 de PostgreSQL puladas |
| Workflow e roteiro Q-018 | YAML analisado e `bash -n` aprovado; execução remota pendente |

Cada aprovação exige código de saída zero **e** o marcador de conclusão esperado. Durante a revisão, uma execução antiga do teste do termo saiu zero após apenas sete casos; foi rejeitada como prova. O runner recebeu timeout nas consultas/encerramento, watchdog e exigência de dez casos. A rodada final contém o marcador `TERMO_SINTETICO_GREEN` e os dez resultados.

Os registros estão em [evidências](evidencias/itaim-only-2026-10-25/results.json). [Hashes SHA-256](evidencias/itaim-only-2026-10-25/source-hashes.json) vinculam os 14 arquivos alterados ao código testado. Os logs `gps-scope-red.log` e `capture-scope-red.log` registram as reproduções anteriores às guardas adicionais. A identidade estrangeira já era recusada pela comparação com a viagem; o novo teste exige a barreira fixa antes dessa leitura, sem alegar vazamento real.

## Fronteiras abertas

- As duas suítes PostgreSQL não executaram: ausência de banco de laboratório. A tentativa de iniciar cluster descartável esbarrou no mapeamento de usuários do ambiente; nenhum cluster foi iniciado. Não houve conexão a banco operacional nem execução de migration operacional.
- `testDebugUnitTest` foi tentado; o wrapper não conseguiu baixar Gradle por indisponibilidade de rede. Kotlin, APK, aparelho físico e coleta GPS de campo não foram validados.
- CI remoto, PostgreSQL no runner e cadeia Q-018 completa continuam pendentes. A análise estática do workflow não equivale a execução.
- Fontes reais, termo operacional aprovado, backup, piloto humano e autorização de publicação mantêm seus gates anteriores. Nenhuma aprovação local substitui esses requisitos.
- O verificador sintético antigo do ZIP não concluiu sua checagem de sintaxe no Node 24; ele não foi contado como aprovação. O gerador exato foi aplicado e seu resultado foi compilado e exercitado pelo servidor real.

## Próximo passo

Após autorização para envio, revalidar o HEAD remoto da PR #126, enviar os commits para sua branch sem forçar histórico e acompanhar o CI. O workflow inclui os gates novos, continua os demais testes em caso de falha HTTP/PG e exige sucesso desses gates no veredito final.

A PR permanece DRAFT/HOLD. Sem merge, deploy, migração operacional, impressão, integração real, acesso a outras unidades ou novo gasto.

