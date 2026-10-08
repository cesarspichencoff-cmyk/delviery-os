# DELIVERYOS — MISSÃO DE DESENVOLVIMENTO SOLO NO CLOUD
**Data:** 2026-10-07
**Autoridade humana:** César
**Tipo:** execução real de engenharia, não consultoria nem revisão superficial
**Base verificada ao preparar esta missão:** `cesarspichencoff-cmyk/delviery-os`, branch `tmp/tata-comanda-product-adapter-20261006`, commit `2ff7dee9fdfc8b26ad07e200445cc2bbcda914b7`. Revalidar HEAD antes de agir.

## 1. Seu papel: desenvolvedor principal e único durante esta execução

Assuma a responsabilidade completa pelo avanço técnico do DeliveryOS nesta rodada. Você é simultaneamente engenheiro principal full-stack, desenvolvedor de produto, arquiteto, especialista de confiabilidade, integrador de dados e executor de qualidade visual. Não está apoiando outro agente; **você é o dono da implementação** até entregar o checkpoint final. O ChatGPT retomará o projeto depois, lendo seus commits, provas e decisões.

**Critério de sucesso:** aumento material, observável e demonstrável da qualidade/capacidade do sistema, com código efetivamente escrito e testado. Não se satisfaça com backlog, parecer, plano, pseudocódigo ou promessa de trabalho futuro quando puder executar.

Trabalhe em ciclos curtos: entender o suficiente → escolher o delta de maior valor → implementar → testar → corrigir → comparar com antes → salvar evidência → seguir para o próximo delta. Não se limite ao primeiro bug e não peça confirmação para trabalho reversível de desenvolvimento já autorizado.

## 2. Primeiro: estabelecer a verdade do ambiente, sem presumir capacidades

1. Confirme GitHub repo/ref/HEAD e a árvore de trabalho. Se houver avanço concorrente, audite o diff antes de escrever; nunca sobrescreva trabalho novo.
2. Revalide o método canônico no repositório `cesarspichencoff-cmyk/vertice-runtime.` (ponto final intencional), branch `vertice-active`, arquivo `VERTICE_ENTRY.md`. Use o método como disciplina interna, não como branding do produto.
3. Leia, em ordem útil, `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`, `docs/execution/MISSION_LEDGER.jsonl`, `docs/execution/PERGUNTAS.jsonl`, `docs/execution/STATE.json`, `docs/execution/EVIDENCE.jsonl`, e `docs/execution/CLOUD_AGENT_HANDOFF_2026-10-07.md`. Carregue somente trechos adicionais que paguem seu custo.
4. Descubra se está em Claude Code Remote (Anthropic) ou Claude Code configurado sobre Google Vertex AI. Use o **modelo mais capaz efetivamente disponível no ambiente autorizado**, o maior esforço de raciocínio útil e as ferramentas de engenharia incluídas. Não presuma um número de versão citado informalmente. Não ative faturamento, recursos pagos, quotas extras, instâncias ou APIs com custo novo sem autorização específica.
5. Verifique, individualmente, acesso real a GitHub, terminal, navegador/preview, testes, CI, Figma, dispositivos/computadores e bancos de sandbox. Uma referência ao conector NÃO comprova autenticação. Onde faltar ferramenta, avance tudo o que for possível no Cloud e registre precisamente o bloqueio, sem simular prova física.

## 3. Missão de produto: atacar o DeliveryOS inteiro com profundidade

Não interprete o checkpoint local do reader como teto da missão. Faça um diagnóstico de arquitetura, código, UX e operação, priorize por benefício real / probabilidade de execução / prova / risco, e IMPLEMENTE sucessivamente os maiores deltas.

Frentes candidatas, escolhidas dinamicamente por evidência — não é obrigatório trabalhar em todas se houver retorno maior em outra:

**A. Verdade operacional TATÁ Comanda → DeliveryOS.** Fortaleça ingestão idempotente, seleção de revisões por relógio da fonte, leitura mínima read-only de lifecycle/financeiro, consistência entre itens e caixa, tipagem/contratos, tratamento de null e concorrência. Projete e implemente heartbeat real, reconexão, proteção contra processo RUNNING porém parado, visibilidade da idade do último polling, timeout/backoff e recuperação segura. Encerre o código pronto para ativação live no melhor nível possível em Cloud. Não transforme hora de KDS em tempo de preparo/entrega ao cliente.

**B. Product System realmente útil.** Faça a informação real chegar ao lugar certo, preservando histórico ≠ live ≠ demo. Melhore jornadas de decisão da gerência: leitura de pedidos, exceções, atrasos com fonte autoritativa, reconciliação, filas, operadores e diagnóstico. Priorize interfaces funcionais, estados de loading/erro/vazio, clareza de unidade/turno/data e hierarquia visual profissional. Não maquie dados de exemplo como realidade.

**C. Aplicativo Android / campo / DeliveryOS B5.** Preserve privacidade e autenticação; feche gaps de fila offline, sincronização, recuperação pós-restart, telemetria mínima, observabilidade, testes unitários/integrados e readiness de ensaio em telefone real. Nunca marque telefone físico como comprovado com emulador, mock ou CI.

**D. Arquitetura e confiabilidade.** Descubra regressões silenciosas, contratos frouxos, dívida de permissão, bugs de ordem/replay, worker pendurado, ausência de health real, CI frágil, limites, corridas e leaks. Corrija causa raiz com testes que reproduzam falha e evitem reincidência. Evite reescrever o produto por gosto arquitetural.

**E. Design/Figma.** Se Figma estiver conectado, verifique arquivo `dGyF0eRDd4YG8uqyWqU1P4`, refs Entregas `20:808`, B7 `21:2`, B5 `29:2`. Faça design→código→preview→screenshot→ajuste, especialmente em UX mobile e visual de produto profissional. Sem Figma autenticado, use código/preview existente; registre paridade visual como UNKNOWN, não como aprovada.

**F. O melhor uso do Cloud.** Use terminal para build/testes, ambiente de preview/navegador para percorrer fluxos, CI para regressões, inspeção estática/dinâmica, banco isolado se já incluído, paralelização interna/subagentes se a sua plataforma realmente oferecer e se isso acelerar o trabalho de um único responsável. Aproveite pesquisa atual externa e padrões internacionais quando uma descoberta gerar implementação concreta. Não use pesquisa como substituto de código.

## 4. Ponto de partida concreto: a fronteira real mais recente

O handoff preserva:

- Commit anterior da branch: `3e6787c6c090e17a7901ffbdcc0fdb9aa969ad78`.
- Permissões SQL read-only já WORLD_PROVEN para `NT SERVICE\TataComandaReader`: 29 novos `SELECT` por coluna em `HISTPEDCONS`, `ITCMD_LOG`, `MOVCAIXADLV`, `VENDA` e `TIPORECE`. NÃO criar novas permissões.
- O Product System já expõe auditoria histórica não-live de 05/10 com 195 pedidos, 551 linhas, 638 unidades, R$ 38.989,37, 191 reconciliações diretas + 4 com R$ 61 de taxa e correção de +10 unidades nos 2 FOS.
- O candidato live V2 existe apenas na CAIXA_MOOCA, caminho `C:\TATA\comanda-v1\cutover\shadow-v1\live-truth-v1\tata_reader_continuous_watch_candidate_v2.ps1`, SHA256 `77C16940EFCAF38E380369AD6F17FBC849C67EC191F9617C3C1EF5119DFF31F0` (recuperar e verificar antes de assumir que está disponível no Cloud).
- Provas do candidato: SQL sob usuário efetivo PASS; 3 result sets; harness 2 polls/6 snapshots/3 eventos/0 errors/0 hash artificial; consumidor legado aceitou eventos com `truth`.
- Reader instalado estava degradado apesar de RUNNING: último SQL real `2026-10-05 21:55:51`, último checkpoint `2026-10-05 21:55:45`; sessão sleeping. Sua solução não pode considerar `SERVICE RUNNING` prova suficiente.
- O candidato não foi instalado; restart e rollback não ocorreram porque CAIXA_MOOCA/Foxxy ficaram offline no conector.
- B5 ainda carece de telefone Android físico; B7 permanece `CONTRACT_PREPARED_NOT_EXECUTABLE`.

**Autorização já dada por César nesta conversa:** depois de backup e prova, instalar o reader V2 especificamente no serviço `TataComandaReader` e fazer **restart controlado com rollback automático** se não recuperar saúde real, desde que haja acesso autenticado à CAIXA, diferença auditada e observabilidade para comprovar efeito. Essa autorização NÃO se estende a escrita no banco, nova permissão, impressão, cutover de outros sistemas, deploy global ou ações financeiras. Se a CAIXA estiver inacessível, não pare o restante da missão: leve a engenharia até CODE_READY/TEST_PASS e deixe o ensaio físico delimitado.

## 5. Execução: autonomia de engenharia com provas duráveis

- Crie sua própria branch de trabalho a partir do HEAD mais recente validado (ou use branch isolada fornecida pelo Cloud, registrando o ref real). Um único responsável pode usar commits incrementais e ferramentas paralelas; não há necessidade de coordenar tarefas com ChatGPT durante essa rodada.
- Mantenha compatibilidade e testes existentes como base; quando uma alteração exigir evolução de contrato, versionamento e migração, prove consumidor + produtor.
- Cada bug relevante deve ter teste que falhe antes e passe depois ou outro comparativo verificável.
- Execute tipos/lint/tests e integrações de banco isolado quando disponíveis; para APIs/UI, execute servidor, teste HTTP e percorra interface no navegador real/preview, capturando evidência. Em Android, rode Gradle se SDK existir. Em Figma, inspecione o resultado visual se acesso estiver liberado.
- Faça secret scan; não publique credenciais, PII, dumps reais, tokens, dados financeiros individualizados ou caminhos que exponham segredos.
- Descreva claramente quais operações foram locais/sandbox, quais foram remotas e quais foram verificadas no mundo real. `ATTEMPTED ≠ DONE`, `CODE_READY ≠ DEPLOYED`, `TEST_PASS ≠ WORLD_PROVEN`.
- Se algum teste falhar, investigue e corrija. Não pinte o gate de verde. Se o ambiente for o problema, prove isso e continue pelas rotas independentes.
- Nunca gaste recursos novos. Use o que já estiver incluído; Vertex AI/Google Cloud com cobrança por tokens ou infraestrutura exige confirmar orçamento/autorização antes de novas chamadas cobradas.

## 6. Limites que você NÃO pode atravessar sozinho

- Não fazer merge na main nem deploy/cutover geral em produção.
- Não criar/revogar grants SQL adicionais.
- Não ativar B7 nem nenhuma ação humana real.
- Não imprimir, enviar a impressoras, mexer em Odhen, fiscal, SEFAZ ou processar pagamentos.
- Não escrever em base operacional salvo efeito expressamente autorizado para esta frente (nenhum novo efeito de escrita foi autorizado).
- Não publicar/levar PII, payload bruto, observações livres, coordenadas ou segredos ao GitHub/Cloud.
- Não comprar, contratar ou provisionar recurso pago. Não ampliar privilégios de conector.
- Não falsificar disponibilidade, teste visual, telefone real ou saúde da operação.

## 7. Entrega final obrigatória para retomarmos no ChatGPT

Entregue **código, não só recomendações**. Antes de encerrar:

1. Faça commits de checkpoints funcionais na sua branch e, se estiver autorizado tecnicamente, publique-a no GitHub; não faça merge.
2. Registre um documento de handback em `docs/execution/` com:
   - base/HEAD, branches e commits publicados;
   - delta real implementado por frente, com arquivos significativos;
   - comandos/resultados de testes, screenshots/URLs de preview se disponíveis;
   - o que está CODE_READY, TEST_PASS, DEPLOYED ou WORLD_PROVEN;
   - incidentes, regressões, riscos e UNKNOWNs restantes;
   - Figma alterado e nós exatos, se houver;
   - custos incorridos (esperado zero gasto adicional);
   - próximo passo seguro, específico e pequeno.
3. Atualize STATE/EVIDENCE/MISSION_LEDGER respeitando os formatos existentes; não sobrescreva registros mais novos.
4. Faça verificação remota local=GitHub, estado do worktree e secret scan.
5. Continue trabalhando enquanto houver tarefas independentes de alto valor e capacidade disponível. Encerre apenas no limite real do ambiente, após uma entrega material ou diante de risco que exige decisão humana.

## 8. Estilo de execução

Seja ambicioso no resultado e conservador na afirmação de prova. Tome decisões técnicas próprias. Identifique soluções melhores que as sugeridas quando a evidência sustentar. Não peça ao César que faça ações manuais que você consegue executar com segurança. Não faça perguntas redundantes; somente decisões que alterem autorização, orçamento ou efeitos irreversíveis.

**Comece executando agora, não respondendo com um plano de 20 itens.**
