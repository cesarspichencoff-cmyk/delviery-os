# Delivery OS Itaim — recuperação silenciosa após interferência de interface
**Data:** 03/11/2026 (BRT)  
**Estado:** DRAFT/HOLD — apenas desenho de execução e critérios de prova; **nenhuma ativação**.

## O que está efetivamente comprovado
- O observador experimental do Edge ocasionou interferência visual relatada pelo operador: janelas Edge/CMD/PowerShell surgindo na área de trabalho. O ato de relançar a janela do Edge foi identificado em status do watchdog original (`action=LAUNCHED`). Causalidade exata de todas as piscadas permanece não provada.
- Seis tarefas agendadas de Edge, ponte, UIA e receptor foram desativadas intencionalmente no `CAIXA_MOOCA`: `GestorV2-Edge-Sidecar-Guard`, `GestorV2-Hidden-Guard`, `Edge-Gestor-Guard`, `GestorOriginalCards-Shadow`, `SporeMirror-Shadow`, `GestorV2-Receiver-Guard`, todas com prefixo `DeliveryOS-Itaim-`. **Não reativar por conta própria.**
- A proteção de som `DeliveryOS-Itaim-Observer-AudioMute` utiliza processo compilado **sem console visível**; status de Core Audio comprovou uma sessão observadora em mudo e zero outras sessões alteradas. O usuário confirmou que o apito cessou. Não confundir isso com validação de captura de pedidos.
- A verificação automática do almoço de 03/11 às 12h23 apresentou Reader `OBSERVED_RECORDS`, 250 arquivos examinados, 247 históricos ignorados, contagem diagnóstica projetada 3, `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`. **Não equivale a 3 pedidos reais nem comprova junção com iFood.**
- O último `GestorWebReadOnlyV2/latest.structure.json` conhecido mostra `STRUCTURE_ONLY_UNVERIFIED`, sem cards comprovados nem merchant Itaim. O SP0RE está intencionalmente com evidência antiga e `ordersPublishable=0`.

## Nova rota: execução realmente invisível
O princípio não é `-WindowStyle Hidden` nem `ShowWindow(SW_HIDE)` repetidos em scripts agendados: o processo de coleta deve **nascer sem janela**, e não depender do foco ou de relançar o Edge operacional.

1. **Fonte Reader primeiro:** manter apenas o serviço leitor já em execução e checá-lo por status/arquivos existentes. Não tocar nos processos do caixa, comandos, impressão ou estado de pedidos.
2. **Executor silencioso em bancada:** desenhar um único processo de segundo plano usando subsistema Windows sem console (modelo `winexe` já existente no host para proteção de áudio), com identificador de instância única, logs limitados e falha fechada. O processo de teste não deve abrir CMD, PowerShell, Edge, janela ou notificação. Não instalar em produção enquanto sem provas.
3. **Adaptador Gestor desacoplado:** somente em sessão de laboratório isolada e autenticada de forma regular; testar captura estrutural e detalhes sem navegação/ação na janela original e sem usar credenciais extraídas. Se não for possível ler no modo de segundo plano, declarar `HOLD`, não abrir navegador por watchdog.
4. **Saída de dados:** apenas envelopes sanitizados em leitura, com `UNKNOWN` para merchant/identidade/itens até prova real; nenhuma publicação para Copiloto. Nunca publicar com base em 20 cards visíveis ou contagem diagnóstica do Reader.
5. **Controle operacional:** manter botão/processo de parada e plano de rollback que não reative as seis tarefas antigas. Uso de CPU/memória e reinício precisam ter limiares e alarmes verificados.

## Testes que faltam antes de pilotar
- `TEST_PASS`: repetição fora do horário com dados fictícios: zero janelas visíveis em criação, execução, reinício e encerramento; ausência de som; sem criar tarefas ou serviços extras.
- `TEST_PASS`: nenhuma instância duplicada, sem mudança no Edge da equipe, sem foco roubado, sem acesso a outro perfil, desligamento reversível.
- `WORLD_PROVEN`: execução real no CAIXA_MOOCA **sem efeitos visuais percebidos**, confirmada pelo operador e por inspeção de janelas; Reader continua saudável.
- `WORLD_PROVEN`: primeiro pedido real da unidade Itaim comprova identidade, itens, complementos, revisões e relação com a comanda, apenas por leitura e fontes autorizadas.
- `HUMAN_ACCEPTED`: César confirma que **não** houve piscadas, janelas ou apitos e que o desempenho do caixa não piorou.

## Limites explícitos
Não reiniciar processos do operador, reabilitar as seis tarefas, fazer merge/deploy/cutover, abrir pedidos reais, alterar estados no Gestor, copiar autenticação, ler PII ou assumir cobertura completa. A PR #137 deve permanecer **DRAFT/HOLD**.

**Próxima unidade segura de trabalho:** construir e testar o executor em fixture isolada, sem ativação em Windows operacional. Se não houver prova de janela zero, não promover.

## Implementação de laboratório — executor sem console (03/11/2026)
- Código novo na PR DRAFT/HOLD: `runtime/silent-runner/SilentObserverLab.cs`, `runtime/silent-runner/README.md`, `tests/silent-runner/run-contract-tests.cjs` e `tests/silent-runner/verify-windows-fixture.ps1`.
- O executável é desenhado para compilação Windows `csc.exe /target:winexe` (subsistema GUI sem console). No estágio atual, ele **não lê pedidos ou Reader, não observa Edge e não emite áudio**: aceita apenas quatro campos fictícios de um diretório `deliveryos-silent-lab` com marcador explícito `DELIVERYOS_SILENT_TEST_ONLY_V1`. Emite `HOLD_FIXTURE_ONLY` ou `HOLD_INVALID_FIXTURE`, sempre com `ordersPublishable=0`.
- Proteções implementadas: bloqueio também no próprio executável para execução no CAIXA_MOOCA, instância única via mutex, duração limitada a 8 iterações, arquivos/links suspeitos bloqueados, saída JSON atômica e sanitizada, nenhuma operação de janela/navegador/rede, captura de exceções inesperadas para evitar caixas de erro Windows. Não há instalação, serviço ou tarefa agendada para este código.
- **Prova obtida:** 42/42 verificações **ESTÁTICAS/OFFLINE** com Node.js 22, cobrindo contrato, dados inválidos, APIs proibidas e presença das guardas. As assinaturas dos arquivos publicados foram comparadas com os arquivos locais usados no teste; a única diferença no teste JS é uma linha em branco sem efeito.
- **Prova NÃO obtida:** compilação C# nativa, execução `winexe` no Windows, zero janelas/HWND durante nascimento, execução/encerramento, prevenção de tela piscando em máquina real, performance, leitura do Gestor, junção com Reader. Portanto `CODE_READY_FOR_WINDOWS_TEST` **não é** `TEST_PASS_WINDOWS` ou `WORLD_PROVEN`.
- O roteiro `verify-windows-fixture.ps1` **recusa** `COMPUTERNAME=CAIXA_MOOCA`, requer VM descartável e verifica quatro amostras de janelas, foco, mutex, saída, dados indevidos e bloqueio por marcador ausente. Não foi executado.
- **Ponto de retomada:** obter ambiente Windows independente incluído/sem custo incremental, compilar/testar o `winexe` sem reabrir CMD/Edge no caixa; preservar os seis agendamentos suspensos, o guard de áudio e o Reader. Nenhum pedido real deve ser publicado nesta etapa.

## GitHub Actions — prova Windows isolada (03/11/2026, 15h05 BRT)
- Repositório `cesarspichencoff-cmyk/delviery-os` é **público**. Foi criado o workflow `.github/workflows/deliveryos-silent-fixture-windows.yml` com GitHub-hosted runners padrão Linux + Windows, checkout sem persistência de credenciais e token restrito a `contents: read`, sem uploads de artefatos e sem deploy. **Não utiliza CAIXA_MOOCA ou Foxxy.**
- Evidência externa verificável: [Actions run #41690128121](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41690128121), commit exato `91ed611a9b21128b4b5f70bc5722f96821f45b85`, evento `pull_request`, resultado final `completed / success` às 18:05:55 UTC.
- Job Linux `Static fixture contracts` [#126106211885] concluiu `success`. Linha do log: `SILENT_OBSERVER_LAB_CONTRACT_PASS 42/42 (STATIC_OFFLINE_ONLY)`.
- Job Windows `Windows no-console native fixture` [#126106731816] concluiu `success`. Linha do log: `SILENT_OBSERVER_WINDOWS_LAB_PASS 16/16 NO_VISIBLE_WINDOWS` às 18:05:51 UTC. **Compilação nativa `csc.exe /target:winexe` efetivamente passou**, com 0 janelas visíveis do processo nas quatro amostras, sem alteração do foco segundo o teste, singleton bloqueando duplicata, entrada fictícia validada, rejeição de campo de pedido e ausência de marcador, saída `ordersPublishable=0`.
- **Limite da prova:** estes 16/16 demonstram apenas o executável **fictício** rodando numa instância Windows temporária do GitHub, não a ausência de janelas ao integrar dados do iFood/Reader, nem comportamento no Windows do caixa ou aceitação humana. As declarações `windowActions=0` e `networkRequests=0` são propriedades do fixture e guardas de código, não telemetria de navegador em produção.
- **Progrediu:** `CODE_READY_FOR_WINDOWS_TEST` → `TEST_PASS_WINDOWS_FIXTURE`. **Permanece aberto:** adaptador Gestor/Reader seguro, prova merchant Itaim, detalhe real de itens e complementos, join com comandas, validação operacional sem flicker, aprovação humana. Nenhum pedido foi publicado nem agendamento do caixa foi reativado.


## Etapa seguinte — pareamento fictício Reader–Gestor, prova nativa (03/11/2026)
**Este checkpoint supersede os estados de teste pendente descritos nas etapas históricas acima.**

- Adicionado `runtime/silent-runner/SnapshotPairAdapter.cs` ao executor `SilentObserverLab.cs` e compilado junto na pipeline Windows. Ele aceita **somente dois arquivos JSON fictícios opcionais** com projeções estritamente limitadas dos esquemas de diagnóstico existentes: `deliveryos.itaim.automatic-reader-status.v1` e `tata.gestor.structure-v2`. Exige marcador de laboratório válido, `fixtureOnly=true`, host/unidade coerentes, campos exatos, origem não certificada, até 16 chaves artificiais `LAB-0000`, timestamps UTC recentes (até 120 s) e valores numéricos limitados.
- A comparação valida chaves de laboratório únicas, revisões, quantidades de itens e de opções/complementos, rejeitando divergência, duplicatas, chaves com aparência de pedido real, campos pessoais extras, falsos claims de merchant, origem errada, relógio futuro e dados antigos. A única correspondência positiva tem nome **`SYNTHETIC_PAIR_ONLY`**. Nenhuma correspondência real é afirmada: `realReaderJoinProven=false`, `orderIdentityProven=false`, `ordersPublishable=0`, `orderIdsExported=0` e `customerFieldsExported=0` em todos os estados.
- Houve uma falha de compilação no primeiro workflow (uso de `Count` em array .NET). O erro foi identificado no log Windows, corrigido usando `IList` para as representações válidas de array JSON e houve **nova execução completa**. Não declarar a primeira tentativa como PASS.
- Evidência de execução **válida e final da etapa**: [GitHub Actions #41692832854](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41692832854), commit de código testado `fd70b039586df0557799573d3edbda99c7996642`, resultado final `completed / success`. Logs:
  - Linux contratos do executor: `SILENT_OBSERVER_LAB_CONTRACT_PASS 42/42 (STATIC_OFFLINE_ONLY)`
  - Linux contratos do adaptador: `SILENT_PAIR_CONTRACT_PASS 40/40 (STATIC_ONLY)`
  - Windows nativo: `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45 NO_VISIBLE_WINDOWS`
  - **127 verificações aprovadas**, sendo **45 provas funcionais no Windows isolado**. Compilação e execução reais do fixture concluídas; janela visível do processo nativo=0 nas amostras, foco preservado nos testes, instância duplicada bloqueada, dados fictícios divergentes mantidos em HOLD.
- Arquivos de teste reproduzíveis: `tests/silent-runner/run-pair-contract-tests.cjs`, `tests/silent-runner/verify-windows-fixture.ps1`; workflow `.github/workflows/deliveryos-silent-fixture-windows.yml`. Tudo executado em runners do GitHub; **nenhum comando de desenvolvimento enviado ao computador CAIXA_MOOCA ou ao Foxxy nesta etapa**, nenhuma tarefa do caixa reativada, nenhum merge/deploy/cutover, nenhum pedido real aberto/publicado.
- **Limite da entrega:** este é um **adaptador de dados fictícios cujo formato faz referência aos esquemas reais**, não um leitor de arquivos em produção. Não existem ainda prova da loja autenticada, leitura de itens e complementos reais no Gestor, identidade da comanda real da Teknisa, sincronização entre revisões reais ou comportamento no PC do caixa com o coletor efetivo. Os status históricos locais dos observadores ficam stale enquanto as seis rotinas seguem intencionalmente suspensas. Não confundir `TEST_PASS_WINDOWS_FIXTURE` com `WORLD_PROVEN` ou `HUMAN_ACCEPTED`.

**Próximo gate de maior valor:** criar um projetor somente leitura, independente de interface, que aceite as estruturas realmente sanitizadas e verificadas do Reader e do Gestor, reconheça quais campos não são comprováveis e mantenha a correlação real desabilitada. Sem isso, nenhuma autorização para leitura/publicação de pedidos reais.
