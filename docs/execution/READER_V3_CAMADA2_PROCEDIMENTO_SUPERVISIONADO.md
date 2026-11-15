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
