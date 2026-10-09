# DELIVERYOS — MISSÃO SOLO CLAUDE: PRODUCT SYSTEM / Figma / UX REAL
Data de emissão: 2026-10-09
Autorização humana: César disse para continuar com duas frentes paralelas.
Base ao criar a branch: `4879d89ed8aad12a9c971f73c21d2ebf1fd5e07d`
Branch reservada a este executor: `feat/claude-product-ux-autonomous-20261009`
Repo: `cesarspichencoff-cmyk/delviery-os`

## Seu mandato: construir sozinho, não só auditar
Assuma a liderança técnica exclusiva desta frente até entregar código, interface e prova. Use o modelo/raciocínio mais forte realmente disponível sem gerar novo gasto ou ativar faturamento. Descubra e utilize GitHub, terminal, navegador/preview, Figma, testes, captures/screenshot, CI, ferramentas de design efetivamente conectadas. Não dependa desta conversa.

O ChatGPT estará trabalhando **em paralelo, exclusivamente em Android, Room, SyncWorker, fila e testes de sincronização**. Portanto faça alto avanço autônomo na experiência visual, arquitetura de apresentação e usabilidade operacional do **DeliveryOS Product System**. Não edite ou recrie a frente Android, não misture branches e não faça merge em main. **Não altere TATÁ Comanda**, reader da CAIXA, renderer/impressão, Teknisa, Odhen, fiscal, SEFAZ, binários ou serviço Windows. Nenhum deploy real foi autorizado.

## Primeiro: recupere fontes e verdade
1. GitHub: revalide branch e commit HEAD, worktree limpa; trabalhe em sua branch (ou uma filha com handback completo).
2. Canônico VÉRTICE: `cesarspichencoff-cmyk/vertice-runtime.`, branch `vertice-active`, `VERTICE_ENTRY.md`; use governança internamente, sem branding estranho no produto.
3. No DeliveryOS: leia `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`, `docs/execution/STATE.json`, `docs/execution/EVIDENCE.jsonl`, `docs/execution/CLOUD_SOLO_HANDBACK_2026-10-07.md`, `docs/execution/B5_QUEUE_FRESHNESS_PROOF_2026-10-09.md`, contratos e testes Product System; mantenha escopo de leitura econômico.
4. Fontes Figma potencialmente distintas: fundação de tokens do Product System declara file key `IMWH8ZKMF5ra3QJYiR6vGa` em `docs/figma/DESIGN_TOKENS.json`; handoff anterior cita `dGyF0eRDd4YG8uqyWqU1P4` com nós `20:808` Entregas, `21:2` B7, `29:2` B5. Verifique ambos, diferencie arquivos/projetos e use apenas design efetivamente acessível. Referência salva != acesso conectado.
5. Priorize dados de fontes reais sobre fixtures; a UI não pode afirmar `AO VIVO` quando recebe histórico, simulação ou dado envelhecido. Preservar `UNKNOWN` como desconhecido.

## Trabalho: ataque de desenvolvedor principal
1. Descubra o maior atrito do Product System atual por inspeção real de tela + código + fluxos. Priorize tela Entregas, leitura operacional mobile, hierarquia de estados, carga, vazio, erro e evidência real/antiga.
2. Implemente uma melhoria sistêmica de experiência e funcionalidade, não uma troca cosmética de cores. A tela precisa ser útil para quem gerencia motoboys e expedição. Considere filtragem/unidade/turno, leitura do último relato de fila B5, distinção demo x dados do servidor, idade/estado da observação, exceções acionáveis SEM ativar ações sensíveis.
3. Fidelidade de produto: use design tokens existentes antes de inventar outros, tipografia e grids consistentes; mobile responsivo e acessível (teclado, contraste, estados, reduced motion). Verifique visualmente com preview ou navegador; capturar screenshots antes/depois quando disponível.
4. Escreva testes que reproduzam problemas existentes ANTES da correção; depois implemente e prove regressão positiva. Execute `test:platform:product`, `test:platform:queue-depth`, `tsc --noEmit`, `build:platform`, checagens de UI/HTTP e acessibilidade onde ambiente permitir. Identifique falhas de harness sem pintar verde.
5. Faça mais de uma iteração quando houver ganho material e tempo/capacidade. Código implementado e verificado vale mais que auditoria de 30 páginas.

## Sem colisões
Arquivos de SUA responsabilidade preferencial:
- `src/product/ui/**`
- `src/product/viewmodels/**` (exceto se modificar contratos B5 Android; coordene pelo Git)
- `src/product/demo/**` somente se houver razão rastreável e demo identificada
- testes Product System / Figma / CSS
- documentação desta frente

Arquivos RESERVADOS ao ChatGPT nesta rodada: `android/**`, `src/platform/run-device-queue-depth-*.ts`, `src/platform/persistence/pg-repositories.ts`, implementações de Room/SyncWorker/HTTP e testes Android. Evite também mexer em `package.json` se conseguir expor comandos via script separado para reduzir colisão. Se precisar, registre precisamente o delta para cherry-pick seguro.

**Não faça merge automático** entre sua branch, `feat/deliveryos-android-orphan-recovery-20261009`, `main` e branches do TATÁ Comanda. Caso algum ref tenha mudado, use Difference Check, nunca force-push sobre trabalho alheio.

## Fronteiras de efeito
- Sem deploy/cutover produtivo, impressão, escrita em Teknisa, nova permissão de banco, operação de pagamento, publicação de dados reais identificáveis, novos gastos, chaves ou permissões elevadas.
- Sem ativação de B7/Human Action real; interfaces podem apresentar contexto, não executar ações sensíveis sem autorização.
- Não chamar a tela de `real-time` só porque servidor está acessível.
- Testes/CI não são prova em Android físico nem na CAIXA.
- Figma somente quando o conector estiver realmente habilitado e alterações forem reversíveis e isoladas; sem modificar telas aprovadas de outros projetos.

## Entrega obrigatória
1. Commit(s) na própria branch e push remoto; sem conflito ou alteração não intencional.
2. Documento `docs/execution/CLAUDE_PRODUCT_UX_HANDBACK_2026-10-09.md` com base/HEAD, mudanças de arquivos, provas e resultados exatos, screenshots/preview se houver, falhas abertas, fontes Figma verificadas, decisão visual explicada, custo real, estados `CODE_READY`/`TEST_PASS`/`DEPLOYED`/`WORLD_PROVEN`, e instrução para integração via cherry-pick/merge revisado.
3. Testes que protejam o problema resolvido; evidência RED/GREEN se bug.
4. Validar HEAD remoto=local, worktree limpa, lint/diff/segredos.
5. Continuar implementando enquanto houver melhorias independentes de alto valor. **Comece pelo código e execução, não por promessas ou apenas um plano.**

Objetivo: produto DeliveryOS mais operacional, legível e profissional, com ganho material provado, sem interferir na recuperação Android em curso aqui.
