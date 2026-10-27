# Recuperação PostgreSQL do ensaio

Em 27/10/2026, às 02:21 de São Paulo, o banco simulado `deliveryos_lab` do Caixa Mooca teve uma cópia lógica restaurada em um cluster descartável separado. O piloto e o leitor TATÁ continuaram funcionando. Isso comprova recuperação local dos dados e colunas do ensaio; não é recuperação integral de produção nem proteção contra perda do computador.

## Aplicação e prova

O script `tools/windows-local-lab/pg-backup-restore.cjs` está instalado na raiz privada `DeliveryOS-Ensaio`. Ele aceita somente CAIXA_MOOCA, unidade ITAIM, configuração test/simulated, PostgreSQL do laboratório e GPS desligado. Não instala timer, não altera o lançador e não muda o banco ativo para a cópia restaurada.

1. A conexão proprietária existente acessou somente o banco próprio na porta 55436. Uma transação REPEATABLE READ READ ONLY exportou o snapshot. O inventário e `pg_dump --snapshot` usaram esse mesmo instante, permitindo novas gravações do aplicativo sem misturar instantes na comparação.
2. O arquivo custom de 75.347 bytes ficou em uma pasta própria `pg-recovery-*`, dentro da raiz privada do host. SHA-256: `a54c3652a9831d35ec94b2344094cd9ced42d99c89d90004e15c65167a3c818e`. O arquivo não foi exportado ao Git nem ao chat. ACL verificada: somente Tata, Administradores e Sistema.
3. Um cluster novo, com senha aleatória e autenticação SCRAM, escutou apenas em 127.0.0.1:55438. As ferramentas usadas foram as do PostgreSQL 16 já instalado. Nenhuma porta externa ou regra de firewall foi criada.
4. `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges` terminou sem stderr. Os nomes de papéis do laboratório foram criados como NOLOGIN somente no destino para referências de esquema; senhas e privilégios do host não foram copiados.
5. As 24 tabelas e seus 13 registros, incluindo configuração/migrations, apresentaram os mesmos digests de dados e colunas. Esses números não são contagem de pedidos reais. A comparação inclui multiplicidade dos registros e normaliza apresentação de datas para UTC/ISO. A primeira tentativa restaurou o arquivo, mas não concluiu a igualdade; após normalizar a apresentação nas sessões de comparação, a prova passou sem modificar os dados da origem.
6. Controle negativo: alteração temporária do nome da unidade somente no destino produziu digest diferente. ROLLBACK recuperou o digest original. O cluster descartável foi encerrado e a porta 55438 ficou sem listener. A pasta privada foi preservada, inclusive os logs, para inspeção/repetição.
7. Depois do teste: piloto e plataforma responderam HTTP 200; TataComandaReader estava Running. Produto CI 40443414235 e Android CI 40443414272 passaram no commit anterior `f0cf0ea4`; esses CIs não são prova deste script Windows novo.

Recibo sanitizado: `evidencias/mooca-local-2026-10-26/pg-backup-restore-proof.json`.

## Limites e continuidade

Esta cópia está no mesmo computador, sem criptografia adicional e sem agendamento. Perda do host pode perder banco e cópia juntos. Não foi restaurado o banco ativo, nem comprovado reboot, reconstrução de papéis/senhas/privilégios, igualdade de todos os objetos globais, sequências ou comportamento completo do aplicativo restaurado. O digest verifica dados de tabelas e metadados de colunas; não equivale a comparação de todo o catálogo PostgreSQL. O restore sem erro não substitui esse ensaio integral.

Para repetir manualmente, executar o script com o Node já instalado na mesma raiz privada. Cada execução cria uma pasta nova, exige a porta 55438 livre e nunca restaura sobre 55436. Não copiar dumps para diretório público, anexos ou Git. A ferramenta recusa sair do escopo simulado; migração para operação exige rever orçamento de volume, proteção, retenção e autoridade dos dados.

Próxima proteção necessária: cópia privada criptografada fora do host, execução recorrente com falha observável e ensaio de recuperação com papéis mínimos. Não alterar a fila para arquivo nem ativar recibos nativos, pedidos reais ou GPS para preencher essa lacuna.

Referências técnicas usadas: [pg_dump 16](https://www.postgresql.org/docs/16/app-pgdump.html) e [sincronização de snapshots](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).
