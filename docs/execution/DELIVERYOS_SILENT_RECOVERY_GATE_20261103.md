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
