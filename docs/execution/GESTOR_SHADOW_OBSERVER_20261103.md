# Gestor + Reader — observação passiva e planejamento de detalhes (03/11/2026)

## Objetivo
Evoluir o Delivery OS Itaim combinando (1) o Reader de comandas e revisões Teknisa, (2) uma visualização separada do Gestor web e (3) um radar complementar de cardápio/relatórios Toqan, sem depender de uma nova integração oficial do iFood. A fase atual é **somente leitura, SHADOW e sem autorização operacional**.

## O que este commit efetivamente entrega
- `runtime/reporting/gestor_shadow_status_bridge_v1.cjs`: recebe os quatro diagnósticos agregados já existentes no piloto local (Edge, UIA, V2 estrutural e Reader); exige host, loja, estrutura, frescor e ausência de efeitos. Expõe apenas contagens visíveis, estados de prova e próximo gate. Não lê dados diretamente, não se conecta a rede e não gera ações.
- `runtime/reporting/gestor_shadow_plan_v1.cjs`: função pura para planejar observações futuras a partir de **coleções previamente normalizadas e autorizadas**. Deduplica tokens curtos, segura colisões, aplica HMAC por dia operacional para referências opacas, identifica revisão alterada e ordena sugestões. Continua bloqueando navegação, publicação e alterações.
- `tests/gestor-shadow/`: testes independentes e reproduzíveis com dados fictícios; não executam Gestão/iFood, Reader real ou chamadas HTTP.

## Contratos inegociáveis
- `ordersPublishable=0`, `navigationAuthorized=false`, `detailsPerCycleCap=0`. Um campo de origem autodeclarado nunca comprova a identidade da loja ou a vinculação de pedidos.
- Um número de quatro dígitos visível não é UUID confirmado, não é chave nativa e não permite associar um pedido à comanda. Exigir unidade Itaim comprovada, data operacional, revisão consistente e vínculo forte antes de consumir no Copiloto.
- Vinte cards visíveis não significam vinte pedidos totais: paginação, virtualização, filtros e cartões não renderizados permanecem `UNKNOWN`.
- Estado externo do Gestor não comprova impressão, início de preparo, item pronto, coleta, despacho nem entrega física. Itens pausados exigem fonte de cardápio independente; Toqan agregado não certifica itens específicos.
- Nenhum atalho de browser, manipulação de sessão, copiar cookies, armazenamento indiscriminado de dados de clientes ou uso de endpoints internos não autorizados.
- Nenhum código nesta alteração se registra como tarefa do Windows ou altera o monitor, o Gestor instalado, a impressão GP, firewall, Reader, banco, GPS, Expedição ou pedidos.

## Provas em 03/11/2026
- CAIXA_MOOCA, Edge original: UIA somente leitura apontou lista de concluídos com 20 filhos visíveis e 20 números curtos candidatos distintos e estáveis entre leituras; zero IDs/pessoas exportados. A loja e a cobertura completa **não foram independentemente atestadas**.
- O observador isolado V2 conectou seu receptor local, mas o último snapshot foi de uma estrutura inicial sem cartões, ficando desatualizado. A janela isolada **ainda não forneceu pedido autenticado**.
- A ponte que lê apenas diagnósticos já roda em bancada no caixa, sem efeitos no Gestor: `VISIBLE_CARDS_SHADOW_ONLY`, 20 visíveis, 0 publicáveis. Testes Windows Node 24: 18/18 anteriores; os testes publicados neste ramo: 13/13 (ponte) e 13/13 (planejador), incluindo rejeição de datas impossíveis. Os dois arquivos da branch foram verificados sintaticamente e exercitados no caixa, sem pedidos reais.
- O Reader real permanece sujeito às próprias políticas de produção e permissões legítimas. Teste com comandas recentes, itens, status e prova iPhone seguem pendentes.

## Custo computacional de bancada
Em 03/11/2026, o planejador da branch processou 200 cards e 200 revisões **inteiramente fictícios** em 200 execuções no Node 24 do CAIXA_MOOCA: p50 20,99 ms; p95 27,529 ms; máximo 38,272 ms. Isso mede apenas a função de decisão, **não** captura de tela, DOM, CPU/RAM do Gestor, navegação ou latência operacional. A otimização aplicada reutiliza uma chave HMAC validada por lote. Não há garantia de desempenho sob carga real até teste controlado.

## Como testar sem acessar o caixa
```bash
node tests/gestor-shadow/run-status-bridge-tests.cjs
node tests/gestor-shadow/run-plan-smoke-tests.cjs
```

## Próximos gates de aceitação
1. Confirmar que uma sessão de observação do Gestor está autenticada na unidade Itaim, independente da janela do operador, sem copiar cookies ou tokens.
2. Observar passivamente a estrutura de **um** detalhe real concluído na sessão independente; medir tempo, memória, foco, ausência de qualquer alteração em estado do pedido e cobertura de itens/opções. Navegação continua desligada até prova e autorização próprias.
3. Escalar para 5 e 20 apenas após passar invariância, deduplicação, taxa de cobertura e p95 sem degradação do caixa. Não assumir que tela oculta atualiza continuamente.
4. Reconciliação forte com revisões atuais e fonte Reader autenticada; quarentenar colisão, divergências e fontes desatualizadas. Não publicar pedidos inferidos.
5. Provar cardápio/pausas em canal separado, trilha de auditoria, controle de acesso no Copiloto, teste real em iPhone e rollback antes de qualquer ativação.

**Status:** `CODE_READY + SYNTHETIC_TEST_PASS + WINDOWS_NODE24_TEST_PASS`; `REAL_DETAIL_READ / STRONG_JOIN / PRODUCT_DATA_LIVE / OPERATIONAL_DEPLOY` continuam **não comprovados**. Este commit não remove os bloqueios anteriores.
