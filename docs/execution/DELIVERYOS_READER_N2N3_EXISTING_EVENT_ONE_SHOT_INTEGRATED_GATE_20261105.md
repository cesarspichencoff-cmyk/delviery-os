# Delivery OS — L1 / Reader V2: checkpoint → evento existente → recibo sem PII

**Data:** 05/11/2026. **Status:** `CODE_READY + CI_PASS` apenas em laboratório. **Não executado nem autorizado no CAIXA_MOOCA.** Etapa L1 de L8; N2/N3/N4/N5 continuam bloqueados para aceite de campo; **V1 0/8 aceites operacionais**. A PR #137 permanece aberta e DRAFT/HOLD.

## Diferença material desta rodada

O executor anterior `native_reader_one_shot_lab_cli_v1.cjs` lia um evento fictício por nome fixo. Isso não demonstrava a cadeia de identidade do watcher instalado. A variante agora:
1. Lê somente o `synthetic-checkpoint.json` de sandbox marcado `LAB_ONLY`.
2. Usa `native_reader_existing_event_binding_v1.selectOne()` para validar **todas** as entradas, selecionar **uma única** revisão estabilizada e emitida e construir um descritor **não serializável automaticamente** com chave, hash e nome do arquivo.
3. Exige a pasta real de fixture `reader-events-v1` sob a raiz temporária (sem symlinks); lê somente o arquivo de nome selecionado, existente desde a preparação da fixture e dentro do limite de **256 KiB**.
4. Executa `reviewOne(checkpoint,event)`, que compara a identidade e o hash contra o checkpoint e reconcilia SHA legado **somente após** recomputar o digest canônico e conferir vínculos entre itens e observações.
5. Escreve uma vez o `receipt.json`, de até **2048 bytes**, com `state=HOLD`, contagens e sinais sanitizados, sem dados pessoais, IDs, nome de arquivo ou hash bruto. **Não cria segunda cópia do evento.**

**Proteções acrescentadas:** o descritor de seleção foi transformado em campo **não enumerável** (`JSON.stringify(selectOne())` não publica chave/filename/hash). `selectOne` também rejeita um `emitted_hash` inválido mesmo em entrada não selecionada e horários textuais impossíveis (ex.: 30/02), sem converter o horário local para UTC por suposição. Metadados reais do checkpoint no Itaim foram lidos passivamente e **250/250** passaram nas regras de formato, calendário, ordem, escopo, hash e estabilidade; **nenhum conteúdo de arquivo de pedido foi aberto**.

## Integridade do executável e dependências

O lançador C# Windows `NativeReaderOneShotLabLauncher.cs`, compilado como `winexe`, conserva a recusa imediata do hostname `CAIXA_MOOCA` e a exigência de execução GitHub Actions em repositório exato. Antes de iniciar o processo Node, passou a conferir **bytes Git blob SHA-1** da cópia exata do script principal e de **cinco dependências locais** em `runtime/reporting`. As seis rotas são `-text` no `.gitattributes`, de modo que um checkout Windows não converta LF/CRLF e altere o código pinado.

Não confundir esta verificação com autenticação do executável Node, do Windows ou de ambiente de produção; é uma barreira de laboratório, não uma credencial de campo.

## Prova CI / teste de integração

[GitHub Actions #41976315120](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41976315120), commit `122e096ca592cbf717c125f5c94170dd3c7f9324`: **completed/success, 4/4 jobs**.

- `NATIVE_READER_EXISTING_EVENT_BINDING_PASS 20/20 SYNTHETIC_ONLY`: incluindo confidencialidade da seleção, hash inválido em outra entrada do checkpoint e data de calendário impossível.
- `NATIVE_READER_ONE_SHOT_LAB_PASS 14/14 SYNTHETIC_ONLY`: fluxo local completo entre checkpoint, arquivo já emitido e recibo, rejeitando arquivo ausente, conteúdo alterado, divergência canônica, input com tamanho excessivo, symlink, marcador ausente e alegações falsas de origem.
- `NATIVE_READER_LAB_SCRIPT_IDENTITY_PASS 3/3 WRONG_PATH_SCRIPT_AND_DEPENDENCY_TAMPER_DENIED`: caminho falso, script alterado e biblioteca alterada recusados no Windows de laboratório.
- `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10 NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII`: processo pai GUI e filho Node sem janela visível nas dez amostras e sem alterar o foco da VM. Não prova ausência absoluta de flash submilissegundo em qualquer PC.

## Limites e evidências ainda ausentes

- **Field metadata**: no `CAIXA_MOOCA`, checkpoint de 250 entradas conferido como metadados; um arquivo nativo correspondente já havia sido localizado por `get_file_info` (5.227 bytes) **sem abrir o conteúdo**. Nenhum código novo foi colocado ou iniciado nessa máquina.
- **N2**: nenhuma prova independente de esgotamento da consulta SQL nem da completude de itens/observações de uma revisão real; `observation_scan_complete=true` do watcher é autodeclaração.
- **N3**: SHA do watcher V2 é legado PowerShell em uppercase, e `ConvertTo-Json`/ordenação das observações pode diferir do hash Node. Sem o corpo de uma revisão já emitida processado **localmente e com autorização**, não afirmar paridade real ou alteração de pedido por mudança de hash.
- **N4**: origem `DLV_IFO` exata, sessão/permissão, política de horário e frescor independentes da fonte ainda precisam de atestação. O V2 usa `LIKE 'DLV[_]%'` e `TOP 50` de comandas, sem comprovar cobertura completa.
- **N5/Home**: nenhuma autorização de publicação; `ordersPublishable=0` em toda a cadeia.
- **Efeito boundary**: nada de CMD/PowerShell/terminal/serviço/tarefa/SQL/print/spooler/Edge, merge, deploy, leitura/exportação de conteúdo de cliente ou escrita no caixa. O programa atual **não é variante homologada de campo**.

## Próximo passo que pode realmente vencer um portão

Não repetir suíte sintética equivalente. O bloqueio é **autorização + prova em ambiente correto**. Uma futura variante de campo precisa passar por gate próprio e autorização explícita: identidade da conta/processo, origem e ACL mínimas, seleção de uma revisão **já emitida** em pasta operacional sem cópia bruta, processamento local sob ciclo de vida de uso único, ausência de popup na sessão real, contenção/rollback e recibo sem PII. Depois, testemunha independente do conjunto de linhas SQL e política de origem. Até esse gate, L1 permanece parcial e PR #137 DRAFT/HOLD.

## Autorização condicional de César — 05/11/2026: pré-checagem do campo

**Decisão humana recebida neste diálogo:** César autorizou um **único teste supervisionado, somente de leitura, de uma comanda já registrada**, **desde que** não abra CMD/PowerShell ou qualquer janela, não altere pedidos, não imprima, não interfira no caixa e não exponha/exporte dados brutos dos clientes. **A autorização é condicional, não uma liberação geral para instalar ou executar novos processos no host.** Não solicitar novamente a mesma autorização se as condições puderem ser efetivamente comprovadas; qualquer efeito novo ou ampliação de escopo exige nova decisão.

**Pré-checagem executada sem efeitos no caixa:** o `CAIXA_MOOCA` está online; checkpoint V2 atual possui **250 entradas**, das quais 250 estão estabilizadas e marcadas como emitidas; selecionou-se uma única revisão somente pelo checkpoint; o arquivo já existente foi conferido por `get_file_info`, com **5.227 bytes** e modificação `2026-11-05T02:00:32.724Z`. O Reader aparece `RUNNING`, zero falhas consecutivas e `last_success_at=2026-11-05T03:04:14.6714883-03:00` na amostra. A leitura foi exclusivamente de status/metadados; **NENHUM conteúdo do evento, observação, nome, telefone, endereço ou item de pedido foi aberto**.

**Blocker atual e verificável:** a única ferramenta de leitura de arquivos do conector remoto transfere o **conteúdo bruto** para a sessão da ferramenta antes de qualquer sanitização, o que violaria a fronteira de privacidade; a ferramenta `start_process` inicia **um processo por terminal** (shell Windows padrão PowerShell) e **não possui opção documentada nem configuração ativa que ateste execução sem janelas**. Os testes de ausência de janelas feitos no Windows da GitHub Actions **não provam** que esse *canal remoto* será invisível na sessão efetiva do caixa. **Nenhuma dessas rotas é elegível** para consumir o arquivo real sob a autorização atual. O teste de conteúdo **NÃO FOI EXECUTADO**; não afirmar N2/N3 aprovado.

**Próximo passo de maior valor:** identificar e validar um **mecanismo local, de uso único, com invocação intrinsecamente sem terminal**, identidade de processo/binário, leitura de uma revisão **na origem** e emissão apenas de recibo sanitizado, sem segunda cópia do pedido. Testar essa *invocação* no Windows efetivo sem tocar em pedidos antes da leitura real. Se não existir superfície que garanta as condições, manter HOLD, preservar caixa e comunicar o bloqueio; não contornar usando CMD, PowerShell, download de evento bruto, Task Scheduler, serviço novo ou chamada com pop-up. Uma execução de teste de conteúdo só pode ocorrer após esses gates e sob a autorização condicional registrada.

**Estado:** `USER_CONDITIONAL_AUTHORIZATION=YES`, `FIELD_PRECHECK_METADATA=DONE`, `SILENT_PRIVATE_INVOCATION=UNPROVEN`, `EVENT_CONTENT_READ=NO`, `FIELD_TEST_ATTEMPTED=NO`, `N2/N3=HOLD`, `V1_ACCEPTED=0/8`.

