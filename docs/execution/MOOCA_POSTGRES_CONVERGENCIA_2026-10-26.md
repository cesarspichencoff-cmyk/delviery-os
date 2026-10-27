# Entregas e resumo do Copiloto — PostgreSQL do ensaio

O console legado do ensaio isolado do Itaim foi transferido de arquivos vazios para o PostgreSQL já instalado no Caixa Mooca. O resumo `/api/copiloto/lab-storage` consulta a mesma `facade.snapshot()` do Entregas. Não há segundo armazenamento nem interpretação dos arquivos TATÁ como pedidos dessa fila.

O escopo continua `test` + `simulated`, GPS desligado, termo não publicável e publicação de pedidos reais desativada. A aplicação principal completa do Copiloto não foi instalada por esta etapa.

## O que foi aplicado

- Cadastro de unidade ITAIM ativo somente no banco próprio `deliveryos_lab`, rotulado como ensaio. Isso não cadastra nem autentica funcionários reais.
- Persistência do console em `127.0.0.1:55436`, com o papel mínimo `deliveryos_entregas_pilot`, sem superuser, criação de roles/bancos ou BYPASSRLS. Credenciais permanecem nos arquivos privados do host.
- Marcador `pilot-storage.json` controla o backend e declara `isolated_legacy_console_only`. Os lançadores local e remoto respeitam esse marcador para evitar retorno silencioso ao arquivo antigo. Reinício completo do Windows não foi testado.
- Fonte e destino estavam vazios. `pg-storage-switch.cjs` rejeita migração não vazia e exige igualdade do fingerprint revisado após parar o processo identificado. Os arquivos anteriores foram preservados. Trata-se de controle limitado deste ensaio; não é ferramenta de migração operacional geral.
- A tela `/copiloto/` mostra a base PostgreSQL e contagens do ensaio, separadas dos pedidos reais. A API exige gerente/líder do laboratório, recusa parâmetros, escrita e modos `real`, `control`, desconhecido ou configuração fora de `test`. Retorna somente contagens, sem referências, rótulos, atores ou coordenadas. `operational_order_total` permanece nulo.

## Recibos nativos: limite explícito

O inventário detectou ausência de `entregas.inbound_receipt`. Foram mantidas as migrations oficiais 0001–0010, sem instalar uma fixture no lugar da 0011 original. A busca de arquivo realizada em Codex no Foxxy não recuperou o SQL original; isso não prova ausência no dispositivo inteiro. No Foxxy ocorreram apenas consultas de nomes/caminhos, sem transferência de arquivos, instalação ou execução do runtime do projeto.

O backend agora declara a capacidade de recibos. Arquivo mantém recibos duráveis locais; o papel PostgreSQL compartilhado atual não representa autoridade de recibos por unidade, mesmo se uma tabela existir. O boot também recusa BYPASSRLS. Em PostgreSQL, um lote nativo autenticado recebe `503 DURABLE_RECEIPTS_UNAVAILABLE`, `retryable=true`, antes da leitura do corpo ou execução do domínio. Sem sessão recebe 401. Não há aceite falso nem concessão ampla de recibos para contornar a pendência.

Esse é um limite deliberado da convergência: o console legado usa PostgreSQL, mas a sincronização nativa fica indisponível até haver esquema e autoridade por unidade adequados. Não é liberação de Android em campo.

## Provas

1. Cluster PostgreSQL separado na porta 55437, somente fixtures: cutover 7/7 e concorrência entre servidores 6/6. O teste inclui a recusa explícita do lote nativo. O banco 55436 e suas senhas não foram alterados por essas suítes. O primeiro harness PowerShell ficou aguardando handles/processos filhos; os clusters próprios foram parados e a execução final usou Node com logs em descritores de arquivo. O cluster temporário foi encerrado.
2. No banco do ensaio: gravação de pedido sintético pela API, leitura pelo papel limitado, leitura da mesma fila pelo resumo do Copiloto, reinício do piloto e nova leitura pela API e pelo Copiloto. Remoção somente do registro sintético próprio e igualdade final do snapshot com a origem. Fingerprint: `d13414e1c4949a4edfb7be28732509828c0f9c5ea5433e0d2ca1838ffb04bc60`.
3. Prova de navegador no host em `2026-10-27T03:04:15.234Z`: dez verificações, incluindo Edge 390/1440, login do ensaio, tabela semanal, identificação de dados simulados, API restrita e 503 nativo. A URL pública autenticada não foi revalidada nesta etapa.
4. Localmente: TypeScript, isolamento de sessão 19/19, oito famílias HTTP de diagnóstico/resumo, recusa de cabeçalhos de identidade forjados e de quatro configurações fora do escopo simulado. Governança revalidada. Os CIs de produto `40438610846` e Android `40438610895` passaram no commit-base `a23baafc`, não no commit desta alteração.
5. Verificação final: regressão HTTP 7/7, proteção de rede existente conferida com 258 regras, Ethernet excluída, e serviço TATÁ Running. Nenhuma regra de rede, configuração do proxy ou permissão do SQL Server foi alterada.

Prova e hashes: `evidencias/mooca-local-2026-10-26/shared-pg-lab-proof.json`. A instalação é uma sobreposição de componentes sobre o núcleo `be5a3e3`; o carimbo antigo do núcleo não prova os componentes novos.

## Continuidade e recuperação

Não retornar ao arquivo original depois de surgirem dados novos no PostgreSQL. O controlador para o processo identificado antes de comparar snapshots e recusa o retorno se o destino mudou; preserva/reinicia o PostgreSQL em vez de descartar fatos. Não houve indução de todas as falhas do controlador no host. Os sete testes de cutover em cluster separado cobrem a biblioteca reutilizada, não equivalem a uma prova integral desse controlador Windows.

O timer e os endpoints de backup de arquivo deixam de valer no modo PostgreSQL. Backup PostgreSQL recorrente, restauração e cópia privada fora do host continuam pendentes. Os arquivos vazios preservados não são backup de novas gravações PostgreSQL. A inicialização automática e o reboot do caixa também continuam sem prova.

Próximas frentes: recuperar/revisar esquema de recibos e papéis por unidade; identidade humana individual e transporte nativo; interpretação explícita dos timestamps da fonte e procedência; evento genuíno novo sem reset/replay; depois leitura operacional dos pedidos. O horário semanal e o vínculo Itaim já estão resolvidos e não devem ser perguntados novamente. As consultas ao TATÁ OS foram somente leitura e não demonstraram integração de identidade pronta para este app. A senha compartilhada do proxy não foi promovida a identidade humana.
