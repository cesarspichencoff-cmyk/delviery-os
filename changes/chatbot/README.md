# Mudanças pequenas do chatbot

Uma execução possui uma única mudança ativa. A próxima só começa quando a atual estiver concluída, bloqueada com evidência ou arquivada.

Numeração: `NNN-slug-curto`. Cada pasta contém `SPEC.md`, `TASKS.md` e `ACCEPTANCE.md`.

Fluxo:

1. confirmar branch, base e baseline;
2. marcar uma tarefa como `active`;
3. implementar uma unidade atômica;
4. executar testes direcionados;
5. registrar evidência append-only;
6. commitar a unidade;
7. atualizar estado e retomada;
8. encerrar com regressão completa e árvore limpa.

Estados válidos: `pending`, `active`, `blocked`, `completed`, `rejected`.

Para retomar, ler primeiro `docs/execution/chatbot/STATE.json` e `NEXT_RESUME.md`; depois executar apenas o próximo comando técnico registrado.

