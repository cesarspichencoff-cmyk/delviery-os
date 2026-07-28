# DeliveryOS — regras permanentes de execução

## Produto e fonte de verdade

DeliveryOS é uma camada de consciência operacional: mais cérebro por trás e menos ruído na frente. O repositório, seus contratos e suas evidências reproduzíveis são a fonte da verdade; a conversa é somente uma interface temporária de execução.

Trabalhar com uma mudança por execução. Separar fatos, hipóteses e desconhecidos. Dado incompleto é preferível a dado inventado.

## Início e Git

Antes de editar:

1. conferir diretório, branch, HEAD, status, upstream, worktrees e stashes;
2. confirmar a linhagem e o escopo autorizado;
3. executar o baseline proporcional ao risco;
4. preservar qualquer trabalho parcial desconhecido.

Nunca usar `reset --hard`, `git clean`, checkout destrutivo, squash ou rebase destrutivo. Não apagar stash, branch WIP ou arquivo não classificado. Não fazer push, merge ou deploy sem autorização explícita. Um commit deve ser atômico, testado, sem PII e com evidência registrada. O encerramento exige working tree limpo.

Trabalho parcial deve virar patch versionado, stash nomeado ou branch WIP local, com registro em `docs/execution/chatbot/BLOCKERS.md`, `STATE.json` e `NEXT_RESUME.md`.

## Memória executável

Para mudanças do chatbot, manter:

- `docs/execution/chatbot/STATE.json`;
- `docs/execution/chatbot/EVIDENCE.jsonl` append-only;
- `docs/execution/chatbot/DECISIONS.md`;
- `docs/execution/chatbot/PROMPT_LESSONS.md`;
- `docs/execution/chatbot/BLOCKERS.md`;
- `docs/execution/chatbot/NEXT_RESUME.md`.

Toda decisão relevante deve registrar contexto, alternativas, decisão, motivo, impacto e reversibilidade. Evidência não pode conter PII, segredo, cookie, token ou caminho privado desnecessário.

## Dependências e créditos

Não alterar dependências ou lockfile sem requisito e justificativa explícitos. Não instalar ferramenta para substituir uma verificação simples e local. Em execução longa, concluir uma unidade por vez e atualizar memória ao final. Com 70% de créditos consumidos, não iniciar unidade grande; com 82%, criar checkpoint; acima de 90%, apenas preservar, testar o essencial, commitar de forma consistente e parar.

## Áreas protegidas

Sem autorização específica, não modificar:

- Conference Brain;
- `src/live` e seus contratos;
- Capacidade Viva;
- Copiloto;
- cardápio e fonte histórica;
- motor histórico;
- `app-v1`;
- dados, baselines operacionais e seeds;
- `package.json` e lockfiles.

Não misturar módulos não relacionados na mesma mudança.

## Testes históricos

Mudanças transversais devem considerar, conforme escopo:

- `npm run conversation-native:test`;
- `npm run conversation-native:catalog`;
- `npm run conversation-native:privacy`;
- Conference Brain e smoke `PRESENCE.CONFLICT`;
- Live;
- `npm run capacidade:test`;
- `npm run copiloto:test`;
- `npm run verificar:cardapio`;
- `node tools/teste_fonte_real.js`.

Um verificador verde não é evidência suficiente sem controle negativo, expectativa independente e código de saída não zero quando o contrato é violado.

