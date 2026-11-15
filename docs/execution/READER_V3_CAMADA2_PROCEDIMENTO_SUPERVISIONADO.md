# Reader V3 — homologação em sombra

A candidata lê a Teknisa, grava revisões em pasta própria e alimenta uma instância
isolada da Home. A operação supervisionada no caixa depende de autorização expressa
para o equipamento, a unidade e a janela. A autorização para leitura passiva do
CAIXA_MOOCA cobre somente a leitura já aprovada.

## Preparação em bancada

1. Registrar commit, execução da CI, unidade física e máquina pretendida. A consulta
   está fixada em filial `0001`, loja `01` e origens `DLV_IFO` e `DLV_NMO`. Confirmar
   a correspondência com a unidade pretendida antes de solicitar a intervenção.
2. Com uma cópia do consumidor V2, calcular o SHA-256 integral e gerar o pacote
   fora da árvore do Reader com
   `node runtime/reader-v3/prepare-shadow.cjs <plano-absoluto.json>`.
   Campos do plano: `repo`, `legacyFile`, `output`, `readerRoot`, `productRoot`,
   `expectedLegacySha` e `from` (meia-noite local do dia acordado).
   O destino deve ser novo e o diretório pai deve existir. Usar uma árvore
   compilada do mesmo commit para `productRoot`.
3. Conferir os hashes de `manifest.json`. O pacote traz a cópia integral do V2,
   a versão com a chamada da candidata anexada, os módulos V3 e uma configuração
   com `productionApproved: false`. A compilação da Home fica na árvore do produto.

## Operação supervisionada única

Executar em janela ociosa acordada, com observação de janelas e foco. Se a máquina,
os hashes, a identidade do serviço ou a filial divergirem, interromper a operação.

1. Registrar saúde e PID do serviço V2, CPU do consumidor e latência de referência.
   Confirmar a conta `NT SERVICE\TataComandaReader`, os caminhos, a política
   semanal e acesso de leitura pelo próprio serviço. Guardar cópia do consumidor
   original fora do caminho ativo e conferir seu hash.
   Antes de trocar o consumidor, validar em sessão SQL administrativa de leitura
   a consulta exata de `capture.sql` sob o usuário de banco do Reader, com
   chaves artificiais, sem retornar dados de pedidos. Exigir oito conjuntos de
   resultados. Em erro de permissão, manter o V2 ativo e registrar a diferença
   entre a leitura efetiva por coluna e o contrato da candidata.
2. Preparar `<readerRoot>\shadow\reader-v3-candidate` com os bytes conferidos.
   Após o aceite, registrar o hash da configuração aprovada e trocar a cópia
   ativa de `live_shadow_consumer_loop_v1.cjs` em janela de manutenção, usando
   o controle de serviço existente na sessão supervisionada. Confirmar saúde do
   V2 após a retomada. A candidata usa a mesma identidade e uma sessão SQL
   persistente com consultas parametrizadas, `READ COMMITTED` e `LOCK_TIMEOUT 2000`.
3. Abrir a Home de homologação em loopback com
   `DELIVERYOS_READER_V3_PROJECTION_DIR=<readerRoot>\state\reader-v3-shadow\projection`.
   Definir `DELIVERYOS_READER_V3_UNIT_ID` com o identificador confirmado da
   unidade para habilitar o resumo na célula Caixa do Copiloto de homologação.
   A Home em uso continua na configuração V2. Conferir saúde, sequência e
   atraso em `health.json` e `projection\source-status.json`. Medir a CPU do
   consumidor V3 pela diferença de `consumer.cpuUs` entre duas amostras do
   mesmo processo, dividida por 1.000 vezes a diferença de `consumer.elapsedMs`.
   Registrar a porcentagem de um núcleo sem publicar textos de pedidos,
   chaves nativas ou dados de clientes.
4. Acompanhar um almoço e um jantar completos. Abortar ao primeiro incidente de
   atendimento, impressão, janela visível, pressão perceptível no SQL, falha de
   consulta recorrente ou degradação do V2. Guardar apenas as métricas e contagens
   necessárias à comparação.
5. Ao encerrar ou abortar, restaurar o consumidor original pela cópia validada,
   conferir seu SHA-256, retomar o serviço pelo mecanismo existente e verificar
   saúde e progresso do V2. Desligar a Home de homologação. Preservar a pasta V3
   isolada para diagnóstico. Em caso de parada abrupta, verificar o fim do PID
   proprietário antes da recuperação explícita de cada lock pelo módulo
   `store.cjs`. Um PID vivo ou reutilizado mantém a recuperação bloqueada.

## Critérios para encerrar a homologação

| Medida | Critério |
|---|---|
| Cobertura de pedidos | Contagem e chaves do mesmo intervalo reconciliadas entre V2 e V3 |
| Itens e quantidades | 100% de concordância nos pares com identidade resolvida e itens comparáveis. Registrar denominador, divergências, ambiguidade e pedidos sem par |
| Filhos e observações | Verificar vínculos na revisão nativa e registrar o que o Gestor permite confirmar de forma independente |
| Latência | Primeira revisão V3 com mediana até a do V2 na mesma janela. Registrar também p95 e quantidade de pares |
| Carga | Consumidor em sombra abaixo de 5% de um núcleo. Watcher abaixo da referência V2. Sem timeout SQL ou interferência operacional atribuível |
| Caixa | Zero janela visível, mudança de foco ou incidente de atendimento e impressão |

Partes relacionadas exigem conferência individual com o Gestor. Repetição da
mesma leitura SQL e estado nativo são insuficientes para atestar conclusão da
gravação. Uma eventual substituição do V2 requer decisão própria depois das
medições e do aceite humano.

## Pré-verificação de 15/11/2026

O CAIXA_MOOCA respondeu pela leitura passiva e o heartbeat V2 registrou
`RUNNING` durante o almoço. A cópia textual do consumidor recomposta em
laboratório, com 6.871 bytes, tem SHA-256
`23f301a0decdb6aab79b52274019808b786ec1bf7510c966d44862b5f38a603a`.
A troca e a restauração em cópia isolada recuperaram esse mesmo hash.
Conferir o hash diretamente no caixa antes da troca. A identidade do processo
e sua filiação ao serviço ainda exigem verificação no pré-voo supervisionado.

A janela reservada para 16/11/2026 começa às 09h30, em São Paulo. A
instalação depende de cobertura contínua do almoço (11h–15h) e do jantar
(18h–23h), com possibilidade de restauração imediata. Uma reserva de agenda
registra a janela. O início deve ser confirmado no pré-voo.

## Ensaio de campo em 15/11 — Itaim, CAIXA_MOOCA

O teste curto das 18h03 foi interrompido após 35 segundos sem estado do V3.
Na nova tentativa, o V3 conseguiu iniciar e publicar seu primeiro estado em
67,8 segundos após o reinício. O adaptador encerrou com `SQL_PROCESS_EXITED`
antes da primeira captura. O Gestor registrava 14 pedidos do jantar na amostra
das 18h11. Cobertura V3 e conciliação desses pedidos ficaram sem confirmação.

O consumidor V2 voltou ao SHA-256 original. O ciclo das 18h12m19s e a
verificação das 18h12m49s confirmaram serviço ativo e zero falhas
consecutivas. A ativação da candidata foi desabilitada após a reversão.

O adaptador agora reporta somente códigos de etapa para configuração dos pipes,
identidade Windows, abertura de conexão, verificação da identidade SQL e
bloqueio de execução do PowerShell. O erro específico do ensaio anterior
continua desconhecido, pois a candidata anterior descartava stderr.
Medir a partida fria sem usar o limite de 35 segundos que interrompeu o
primeiro ensaio. Comprovar o retorno do V2 por um ciclo novo após a restauração,
incluindo a verificação independente se a primeira espera expirar.

### Diagnóstico adicional das 18h58

Dois eventos 4100 do PowerShell no caixa confirmaram execução de scripts
desabilitada para o adaptador, antes de qualquer consulta. O Gestor registrava
58 pedidos do jantar na amostra das 18h59. O V2 foi confirmado saudável às
19h01, com hash original e candidata desativada.

O lançamento corrigido usa `RemoteSigned` somente na sessão filha do
Windows PowerShell para o script local conferido por hash. A guarda da conta
Windows e a verificação de identidade SQL continuam obrigatórias. Validar o
retorno da projeção com o pacote corrigido em um ensaio supervisionado.

### Ensaio das 19h06 e acesso de leitura do SQL Server

Pacote do commit `3e914e20c182a1a7be2a91995b7b3ef584e5bc91`, SHA-256
`a47f7c8f8bf24bb39f84fe454b4061f2966556229b0b04f5cf3c71437ecda624`.
A descoberta SQL colocou 32 comandas na fila inicial. A captura do detalhe
falhou às 19h06m27s e o V3 encerrou com zero revisões e zero projeções.
A verificação independente das 19h08 confirmou o SHA-256 original do V2,
serviço `Running`, ciclo novo às 19h07m35s, sequência 24, zero falhas
consecutivas e ativação da candidata desligada.

Uma sessão SQL administrativa com contexto de leitura do usuário de banco do
Reader repetiu a consulta exata de captura com chaves artificiais. SQL Server
retornou o erro 230 (leitura de coluna negada) em `ITCOMANDAVEN`. A auditoria
de metadados confirmou que as 53 colunas necessárias existem e que 23 são
legíveis pelo Reader. As 30 colunas abaixo requerem autorização específica
antes de qualquer ajuste. O ensaio preservou as permissões existentes.

| Tabela | Colunas sem SELECT efetivo |
| --- | --- |
| `ITCOMANDAEST` | `CDFILIAL`, `CDPRODUTO`, `NRCOMANDA`, `NRPRODCOMVEN`, `NRVENDAREST`, `QTPROCOMEST` |
| `ITCOMANDAVEN` | `CDLOJA`, `CDPRODPROMOCAO`, `NRSEQPRODCOM` |
| `OBSITCOMANDAEST` | `CDFILIAL`, `CDGRPOCOR`, `CDOCORR`, `CDPRODUTO`, `NRCOMANDA`, `NRPRODCOMVEN`, `NRVENDAREST` |
| `OBSITCOMANDAVEN` | `CDFILIAL`, `CDGRPOCOR`, `CDOCORR`, `NRCOMANDA`, `NRPRODCOMVEN`, `NRPRODCOMVENOBS`, `NRVENDAREST`, `QTPRODCOMVENOBS` |
| `OCORRENCIA` | `CDGRPOCOR`, `CDOCORR`, `CDPRODUTO`, `DSAPELIDOOBS`, `DSOCORR` |
| `PRODUTO` | `NMPRODUTO` |

Se houver autorização, registrar as permissões diretas e efetivas antes de
qualquer ajuste. Revisar `DENY` explícitos e a origem da permissão efetiva.
Limitar o ajuste ao `SELECT` por coluna para a conta existente. Preparar a
reversão somente das entradas novas antes de confirmar a transação. Validar
53/53 colunas legíveis, oito conjuntos de resultados e a ausência de novos
direitos de escrita ou permissões amplas antes de reiniciar o serviço. Na
reversão, repetir a comparação com a lista original de permissões e verificar
a retomada do V2. Os números do V3 ficam em aberto até nova captura real.

Às 19h12m48s, o leitor do Gestor Electron e os eventos existentes do V2
forneceram 78 pedidos iFood do jantar em cada fonte. O reconciliador utilizado
pelo Copiloto encontrou 78 pares nativos: 63 correspondências nos campos
comparáveis, 12 com complemento sem leitura na Teknisa via V2 e 3 com
divergência de item ou quantidade. Zero divergências de observação na amostra
comparável. O leitor do checkpoint V2 levou 473 ms e retornou zero eventos
inválidos. A latência, a CPU e o impacto SQL do V3 em regime de operação
continuam sem medição.
