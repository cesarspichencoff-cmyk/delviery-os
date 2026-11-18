# Falha multi-janela do Edge — circuito de correção (03/11/2026)

## Incidente verificado
Ao abrir uma segunda janela minimizada do **mesmo perfil Edge autenticado**, o observador original (`GestorOriginalCards-Shadow`) entrou em `HOLD` e o SP0RE em `NO_STABLE_VISIBLE_CARDS`. Nenhum pedido foi publicado. A janela temporária foi fechada por identidade de handle e o monitor original retornou a 20 cards estáveis. O erro estava em usar `Get-Process.MainWindowHandle` como escolha de janela, sem verificar qual continha a lista.

**Circuit breaker:** não abrir novamente janelas do mesmo perfil no CAIXA_MOOCA enquanto o monitor de produção usar esse seletor.

## Contra-rota implementada — sem ativação operacional
- `runtime/reporting/gestor_window_selector_v1.cjs`: motor puro que aceita *somente metadados sanitizados* por janela. Seleciona uma única janela visível, não minimizada, com uma lista concluída, itens com número candidato único e duas leituras estáveis. Se houver duas qualificadas ou dados inesperados, retorna `HOLD`.
- `tests/gestor-shadow/run-window-selector-tests.cjs`: 20/20 testes no Node 24 do CAIXA_MOOCA, cobrindo segunda janela minimizada, janela vazia, duas qualificadas, colisão, estrutura incompleta, dados pessoais desconhecidos, host e perfil incorretos.
- `tools/gestor-window-diagnostics/probe-qualified-windows.ps1`: enumera as janelas do processo Edge original pelo perfil e analisa cada janela pela acessibilidade, sem cliques, foco, cookies ou dados de clientes. Verifica estabilidade em duas leituras e só comunica contagens.
- `tools/gestor-window-diagnostics/observe-multiwindow-shadow-v2.ps1`: converte o diagnóstico em formato compatível com o status já existente. **Grava apenas `status-multiwindow-stage.json` com `-Stage`, nunca o arquivo usado pelo Agendador.** Revalida SHA-256 do probe antes da execução; não troca tarefa nem faz ações no Gestor.

## Prova no host correto
Em 03/11 às 08:55–08:59 BRT, o diagnóstico Windows encontrou um processo Edge do perfil esperado e uma única janela qualificada com **20 cards**. O status em bancada retornou `VISIBLE_CANDIDATES_STABLE`, 20 cards, 20 números distintos, sem IDs ou PII exportados. Comparação com observador original: `MATCH=True`. A tarefa ativa estava `Ready`, `LastTaskResult=0`. O Reader e a janela do usuário não foram manipulados.

Na primeira execução do wrapper de bancada, um teste de `$LASTEXITCODE` não aplicável a scripts PowerShell gerou `PROBE_DID_NOT_COMPLETE`. O defeito foi corrigido e a execução subsequente passou; não houve alteração no monitor ativo.

## Ensaio posterior em laboratório (10h19–10h25 BRT)
- Preparados dois arquivos HTML inteiramente fictícios (`tools/gestor-window-diagnostics/lab/completed.html` e `blank.html`), perfil Edge independente `DeliveryOS-Gestor-Multiwindow-Lab-20261103` e `run-two-windows-lab.ps1`.
- Script PowerShell passou parser (zero erros) e possui barreira de ociosidade de teclado/mouse de **120 segundos**, comparação de foco, processo Edge identificado pelo perfil exclusivamente de laboratório e limpeza de todos os processos de laboratório em `finally`. Não acessa domínio iFood, cookies, identificadores de pedidos reais nem sessão da equipe.
- A primeira tentativa encontrou somente **4 segundos sem input**: `LAB_HOLD=OPERATOR_INPUT_ACTIVE_4`. A execução **não abriu nenhuma janela**, terminou com `LAB_CLEANUP_REMAINING_PROCESSES=0`, perfil temporário ausente, zero erros de limpeza. É sucesso da guarda, **não** prova de duas janelas nativas.
- Criado teste `tests/gestor-shadow/run-two-surface-headless-fixture.cjs`: Edge real em modo headless com duas páginas lógicas. **9/9 PASS**: uma página fictícia com 20 cards e outra vazia → `SELECTED_READ_ONLY`; duas com cards → `HOLD_AMBIGUOUS_WINDOWS`; segunda marcada como minimizada → seleção da primeira; zero requisições externas. Esse teste **não** valida dois HWND Windows; o campo `nativeWindowsTested=false` registra o limite.
- Adicionado verificador fail-closed `tools/gestor-window-diagnostics/lab/verify-native-lab-status.cjs`, que exige resultado fresco, dois HWND, foco preservado, cenário de segunda minimizada e depois duas elegíveis; sem arquivo de prova, sai com erro (confirmado em bancada).
- Regressão completa no CAIXA_MOOCA com Node v24 e Edge headless, seis suítes: bridge 13/13 + planejador 13/13 + extrator 22/22 + fixture de detalhe 18/18 + seletor 20/20 + duas páginas headless 9/9 = **95/95 PASS**. Todos os casos são simulados; o piloto de leitura de pedidos reais continua bloqueado.
- Uma tentativa de automação adicional de ensaio fora dos horários de atendimento não foi criada: limite atual de cinco tarefas agendadas. As tarefas existentes foram preservadas. **Não há teste futuro prometido ou agendado.**

## Limites e gates
1. O teste de duas janelas **no mesmo processo real** NÃO foi repetido no caixa; a prova multi-janela atual é sintética (20/20), com uma janela real na medição de campo.
2. O status reproduz **apenas 20 cards visíveis**, não o total de pedidos ou itens detalhados. Identidade merchant Itaim e chave de junção Reader↔Gestor não estão comprovadas por esse dado.
3. Antes de migrar a tarefa ativa para o observador multi-janela, provar duas janelas concorrentes em perfil de **laboratório independente**, seleção sem roubar foco, ausência de regressão e rollback específico. Não repetir experimento no perfil operacional para criar o teste.
4. A extensão V2 no perfil isolado agora reporta eventos estruturais recentes na rota `expedition`, mas `classHints.card=0` e `headerHints.itaim=false`; não declarar sessão Itaim autenticada nem leitura de itens.
5. Todo merge, deploy, reprodução de dados reais, navegação de pedidos e Copiloto permanecem **HOLD**. A PR #137 continua DRAFT.

**Estado:** CODE_READY / TEST_PASS no subconjunto sintético + diagnóstico local de uma janela PROVEN. MULTI_WINDOW_WORLD_PROVEN e REAL_DETAIL_PROVEN permanecem UNKNOWN.

## Nova tentativa autorizada — 10h35 BRT
- A ociosidade do teclado/mouse estava em ~761 segundos, antes do almoço; portanto, a guarda permitiu uma tentativa **única** do laboratório de duas janelas nativas, após conferir SHA256 do runner `0cd77dd5dfdeee01433e2e54b068149d806d6b34c3ec24e9ff8231cf771e1bdd`.
- A execução retornou `LAB_HOLD=LAB_PROCESS_COUNT_` antes de qualquer `LAB_TWO_HWND_PROBE`. O novo processo Edge isolado não foi encontrado com identificação inequívoca; **dois HWND não foram comprovados**. O script imprimiu `LAB_CLEANUP_REMAINING_PROCESSES=0 PROFILE_EXISTS=False CLEANUP_ERRORS=7`. Os 7 erros ocorreram no loop de limpeza e precisam de diagnóstico; a checagem posterior independente encontrou 0 processos associados ao perfil e perfil ausente. Não declarar limpeza sem erros nem supor a causa do desaparecimento do processo.
- Auditoria de impacto imediatamente após a tentativa às 10h36: processo original Edge=1, sidecar=1, Reader=Running, tarefas de monitor com LastTaskResult=0, 20 cards visíveis e estáveis, `ordersPublishable=0`. O status real dos pedidos não foi modificado.
- **Circuit breaker ampliado:** suspender novas tentativas com o mesmo runner. Não criar janelas no perfil operacional, não alterar Edge/Reader da equipe. Próxima contra-rota deve diagnosticar inicialização e encerramento do perfil de laboratório com mecanismo diferente, sem operar durante horário de serviço. Prioridade material permanece obter sessão V2 autenticada Itaim e detalhe real, não multiplicar testes de janela.
