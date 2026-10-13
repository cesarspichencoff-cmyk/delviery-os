# TATÁ Comandas — V7.37: somente as impressões existentes

**Decisão de César, 12/10/2026:** não integrar, consultar nem solicitar credenciais de API do iFood para a conciliação. Observar e aproveitar o fluxo de impressão já existente do **Gestor/Impressora GP iFood e do Teknisa**, para gerar o conjunto único de comandas TATÁ. **Nenhum corte operacional autorizado por esta especificação.**

## Evidência real obtida por leitura passiva em CAIXA_MOOCA (Itaim)

- Aplicativo `Impressora GP iFood.exe` em execução; `spoolsv.exe` em execução. Isso não certifica qual executável originou cada job.
- 17 impressoras instaladas; Epson nas filas `CAIXA`, `COZINHA`, `BAR`, `BALCAOSUSHI1/2`, `DELIVERY SUSHI 1/2` e outras periféricas.
- Entre as **20h28 e 23h28** aproximadamente (12/10), o log `Microsoft-Windows-PrintService/Operational`, evento **307**, mostrou **426 conclusões**: CAIXA 138, BALCAOSUSHI1 57, BALCAOSUSHI2 57, DELIVERY SUSHI 1 60, DELIVERY SUSHI 2 44, COZINHA 45, BAR 13, L42Pro 4 e Epson TM-T 8. Registro de spool concluído **não prova papel físico**.
- Na amostra adicional recente de 344 registros (2h), nomes de documento eram **genéricos**; não carregavam identificadores confiáveis de origem ou de pedido e não mostravam o conteúdo da comanda. Os arquivos de spool `C:\Windows\System32\spool\PRINTERS` estavam vazios após a impressão; nenhuma carga de job foi lida, copiada ou persistida. Logs do Windows **não bastam** para unir conteúdo iFood/Teknisa.
- O banco local oferece identidade para a fonte Teknisa: `CDFILIAL=0001`, `CDLOJA=01`, `IDORGCMDVENDA=DLV_IFO`, `NRCOMANDAEXT` (iFood) e `NRCOMANDA` interno. O campo de previsão de entrega do Teknisa estava vazio em **460/460** registros iFood inspecionados. Se a previsão estiver impressa pelo iFood, deve ser extraída **somente de payload imprimível realmente capturado**, com prova de leitura e origem.

## Contrato da solução sem API

1. **Observação da impressão pré-consumo:** identificar formatos e payloads reais dos trabalhos enviados por cada aplicativo à fila, antes da sua remoção, **sem** trocar porta, driver, fila ou configuração e sem ler credenciais ou sessão do Gestor. A primeira prova precisa separar o caminho do iFood e o do Teknisa com evidência, pois spooler 307 não traz emissor. Se observação passiva não permitir ler conteúdo, documentar a incapacidade; propor captura em sombra **apenas com autorização explícita** e plano de retorno.
2. **Identidade dupla exata:** extrair o número externo iFood impresso + o interno Teknisa, cruzar com os registros locais por `filial+loja+data+pedido+revisão`, não só pelos quatro dígitos. A versão de cada documento deve estar coerente; comanda retificada não equivale à anterior. Não confiar apenas em nome de produto, hora aproximada, documento genérico ou identidade autodeclarada.
3. **Conciliação sem perda:** se ambas as fontes chegam, verificar itens/quantidades/observações por identidade de origem; se só uma chega, criar **pendência visível** e manter a trilha da fonte disponível, não preencher valores imaginados. Campos exclusivos do iFood (p.ex. *previsão*) só entram se realmente vierem na impressão, com hora e rótulo claro; previsão não é prazo garantido nem prova de pedido entregue.
4. **Saída única, não folha única:** o motor atual TATÁ produz **2 vias de produção + 1 de conferência** conforme roteamento aprovado, geradas de uma conciliação lógica; o mesmo pedido não origina novos papéis por repetição de evento. Idempotência por `store+shop+internal_order+external_order+revision+station+kind`, registro do resultado `OBSERVED_SOURCE/PARSED/RECONCILED/ADMITTED/SPOOLED/PAPER_CONFIRMED` e protocolo de reimpressão separada.
5. **Risco de iFood indisponível:** se a instabilidade impede o Gestor de enviar qualquer trabalho à impressora, uma solução baseada **somente em impressão** não consegue fabricar esses dados. Detectar falta do trabalho quando houver pedido correspondente no Teknisa; alertar. Não prometer erro zero.
6. **Cutover**: não desligar `Impressora GP iFood`, impressão do Teknisa, serviço Windows, filas do salão/delivery próprio nem fiscal sem prova física e autorização específica. Prevenir duplicidade dos emissores atuais durante o período de paralelismo. Nenhuma alteração automática de spooler, impressoras, impressor virtual, `KeepPrintedJobs`, execução em produção ou reimpressão autorizada.

## Passo mínimo para a próxima prova

- Observar sem efeitos um **par real e contemporâneo** de trabalhos iFood/Teknisa do mesmo pedido (nenhum conteúdo identificável publicado no GitHub).
- Confirmar em que ponto e formato os bytes ou raster do documento ficam disponíveis para leitura; testar a extração **em memória e com acesso restrito**, não deixar cópias com dados pessoais no spool.
- Somente depois implementar parser/layout enriquecido, replay real com V2→V6.8 obrigatório e validação de 3 vias em memória.
- Se a prova exigir monitor/porta/driver adicional, submeter um desenho reversível de captura em sombra e esperar autorização operacional antes de tocar o sistema.

**Limite demonstrado em 12/10:** impressão ativa, filas identificadas, histórico de jobs sem conteúdo. `PRINT_PAYLOAD_ACCESS=UNKNOWN`, `IFOOD_TEK_PRINT_PAIR=NOT_PROVEN`, `NO_API`, `NO_SERVICE_CHANGE`, `NO_PRINT`, `HOLD`.


## V7.38 — Observação in-flight sem retenção (13/10/2026)

**Evidência de máquina 13/10 às 07h18 BRT**, somente leitura:
- `CAIXA_MOOCA` online, vinculada ao Itaim; nove filas térmicas analisadas: `CAIXA`, `COZINHA`, `BAR`, `BALCAOSUSHI1/2`, `DELIVERY SUSHI 1/2`, `EPSON TM-T...`.
- Para **todas essas filas**, o Windows reportou `PrintProcessor=winprint`, `Datatype=RAW`, `KeepPrintedJobs=False` e **0 trabalhos pendentes no instante da consulta**. Isto é configuração de fila, **não garantia de formato dos bytes efetivamente spooled**.
- Log operacional PrintService em 90 min registrou **8 eventos ID 306** e nenhum ID 307; Admin sem eventos no mesmo intervalo. Os 307 históricos continuam verificando **fila e porta**, não o software que originou cada job; propriedades 4/5 conferem com nomes reais de impressora/porta em 30 eventos amostrados. Não inferir processo a partir de valor do campo 3, que não foi atribuído a um emissor verificado.
- `Gestor de Pedidos\log.log` presente e atualizado, mas na verificação de texto limitada e sem exportar conteúdo **não continha palavras relacionadas a impressão/filas ou nomes das impressoras**. Temp do usuário sem `.prn/.spl/.pdf` recentes observáveis. Busca bounded do `TataComandaReader` mostrou apenas eventos JSON e log; busca recursiva mais ampla interrompida preventivamente por custo, sem conclusão para todos os diretórios.
- Prova in-flight **passiva por 16 segundos** (sem qualquer escrita, monitor, retenção ou cópia) na pasta Windows `spool\PRINTERS`: **0 arquivos `.SPL` observados**. O intervalo era anterior à abertura do almoço; **isso NÃO prova que uma leitura em horário de movimento é impossível**.

**Ferramenta reutilizável criada**: `tools/auditar_spool_formato_v738_readonly.ps1`, execução pontual de 18 s e no máximo 64 bytes iniciais de cada `.SPL` observado, com `FileAccess.Read` e compartilhamento não bloqueante, saída agregada somente com categorias de prefixo e erros. Não identifica cliente, número do pedido, fonte iFood/Teknisa, não autentica conteúdo e não habilita impressão. Sem persistência, captura de conteúdo completo ou alteração de spooler. `tools/verificar_spool_passivo_v738.js` audita limites e sintaxe do PowerShell **SEM executar o probe no CI**.

**Teste decisivo futuro, quando houver jobs reais:** rodar o probe pontualmente e comparar `completed_print_events_during_probe` com `spl_files_detected/header_readable`. Se existirem jobs 307 e nenhum SPL capturado, o probe simplesmente pode ter perdido jobs muito curtos; **não** concluir prova de ausência e preparar método alternativo autorizado. Se houver SPL, analisar o formato **sem exportar conteúdo** antes de propor parser sob controle de privacidade. Para dois documentos do mesmo pedido, é indispensável uma prova adicional de emissor, identidade e revisão, e depois idempotência física.

**Fronteira**: `SPOOL_PREFIX_UNKNOWN_ON_LIVE_JOB`, `PRINT_PAYLOAD_NOT_CAPTURED`, `OPERATOR_ACCEPTANCE_PENDING`, `NO_API`, `NO_INSTALL`, `NO_PRINT`, `HOLD`.
