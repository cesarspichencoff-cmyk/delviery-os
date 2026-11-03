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

## Limites e gates
1. O teste de duas janelas **no mesmo processo real** NÃO foi repetido no caixa; a prova multi-janela atual é sintética (20/20), com uma janela real na medição de campo.
2. O status reproduz **apenas 20 cards visíveis**, não o total de pedidos ou itens detalhados. Identidade merchant Itaim e chave de junção Reader↔Gestor não estão comprovadas por esse dado.
3. Antes de migrar a tarefa ativa para o observador multi-janela, provar duas janelas concorrentes em perfil de **laboratório independente**, seleção sem roubar foco, ausência de regressão e rollback específico. Não repetir experimento no perfil operacional para criar o teste.
4. A extensão V2 no perfil isolado agora reporta eventos estruturais recentes na rota `expedition`, mas `classHints.card=0` e `headerHints.itaim=false`; não declarar sessão Itaim autenticada nem leitura de itens.
5. Todo merge, deploy, reprodução de dados reais, navegação de pedidos e Copiloto permanecem **HOLD**. A PR #137 continua DRAFT.

**Estado:** CODE_READY / TEST_PASS no subconjunto sintético + diagnóstico local de uma janela PROVEN. MULTI_WINDOW_WORLD_PROVEN e REAL_DETAIL_PROVEN permanecem UNKNOWN.
