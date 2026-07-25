# Reconciliação do bind seguro do servidor de desenvolvimento do Copiloto

> Gate isolado, executado sobre `fix/copiloto-secure-dev-server-bind-v1`
> (base `976fca5`), sem tocar nenhuma outra frente do ecossistema.

## 1. Problema

`tools/servir_v1.js` — o servidor que `app-v1/README.md` instrui rodar
(`node tools/servir_v1.js`) — bindava em `servidor.listen(PORT, "0.0.0.0", ...)`.
Este servidor serve a **raiz inteira do repositório** (`src/`, `docs/`,
`data/`) por design, para o browser carregar `motor.js` via `<script>`.
Bind em `0.0.0.0` expõe todo esse conteúdo para qualquer dispositivo na
mesma rede local, por padrão, sem nenhum opt-in.

## 2. Risco

Sem dado real presente na worktree auditada (`data/raw/`, `data/generated/`
vazios, só `.gitkeep`) o risco imediato de vazamento de dado de cliente era
baixo no momento da auditoria — mas a arquitetura do servidor era insegura
por padrão, e o mesmo processo eventualmente serve dado real quando a
janela real é gerada (`node tools/gerar_janela_v1.js`). Classificado **P1**
na missão de restituição que encontrou o problema.

## 3. Origem da correção anterior

Commit `5e22553` — `fix(copiloto): bind do dev server em localhost por
padrão (P2 auditoria)`, autoria original de 20/07/2026, na linhagem da
branch `audit/copiloto-hardening`. Único e exclusivamente sobre este
problema: 2 arquivos (`tools/servir_v1.js`, novo teste
`tests/live/servidor-bind-seguro.test.js`), 111 linhas, nenhuma alteração
de baseline visual ou lógica de domínio junto.

## 4. Por que 5e22553 não estava na linhagem atual

`audit/copiloto-hardening` é uma branch de auditoria independente — nunca
foi mesclada de volta à linha `feature/copiloto-v33-implementation` →
`integration/copiloto-celulas-shadow-v1` → Conference Brain → iFood
oficial, que é a linhagem que chegou ao HEAD `976fca5`. A auditoria
encontrou e corrigiu o problema na sua própria branch isolada; a correção
nunca foi reconciliada de volta. Confirmado por
`git merge-base --is-ancestor 5e22553 976fca5` → não.

## 5. Estratégia de reconciliação escolhida: CHERRY-PICK CONTROLADO

Condições verificadas antes de decidir, todas satisfeitas:

- `git diff 5e22553~1 976fca5 -- tools/servir_v1.js` → **vazio**. O
  arquivo no HEAD atual é byte-idêntico à versão imediatamente anterior à
  correção — o cherry-pick não tinha absolutamente nada para conflitar
  contra.
- `git show --stat 5e22553` confirma exatamente 2 arquivos, nenhuma
  auditoria/documentação não relacionada junto.
- `tests/live/servidor-bind-seguro.test.js` não existia no HEAD atual —
  sem colisão de nome.
- `/api/config`, o endpoint que o teste usa para verificar se o servidor
  subiu, já existe e é idêntico no HEAD atual (linha 214 de
  `tools/servir_v1.js`).

Resultado: `git cherry-pick 5e22553` aplicado sem conflito, produzindo o
commit `7cad56b`.

## 6. Extensão além do cherry-pick

O teste original de `5e22553` é 100% comportamental (sobe processo real,
faz fetch real) — ótimo, mas a missão de reconciliação pediu explicitamente
duas provas adicionais que ele não cobria:

1. **Falha de inicialização** — segunda instância na mesma porta
   (`EADDRINUSE`) precisa terminar sozinha, sem travar o teste nem deixar
   processo pendurado. `tools/servir_v1.js` já tratava isso
   (`process.exit(1)` no handler de erro) — faltava só a prova. Adicionada
   com timeout de segurança de 5s e confirmação via `tasklist` de que
   nenhum processo `node` remanescia após a execução.
2. **Asserção estrutural** — grep sobre o código-fonte que trava qualquer
   regressão direta para o literal `servidor.listen(PORT, "0.0.0.0")`
   hardcoded, complementando (nunca substituindo) a prova comportamental.

Commit `21357d2`.

## 7. Contrato final do host

| Cenário | Host efetivo | Acessível na LAN? |
|---|---|---|
| `HOST` não definido | `127.0.0.1` | Não |
| `HOST=127.0.0.1` | `127.0.0.1` | Não |
| `HOST=""` (vazio) | `127.0.0.1` (curto-circuito `\|\|` do JS trata string vazia como falsy) | Não |
| `HOST=0.0.0.0` | `0.0.0.0` | Sim, com aviso explícito no console |
| `HOST=<valor inválido>` | tentativa de bind falha, processo lança erro não tratado e cai | Não (fail-closed) |

`PORT` inalterado — continua `process.env.PORT || "5179"`, sem nenhuma
mudança de comportamento.

## 8. Testes

`tests/live/servidor-bind-seguro.test.js` — 5 testes, 4 `describe`:
bind seguro por padrão (2), opt-in de LAN preservado (1), asserção
estrutural (1), falha de inicialização (1). Todos comportamentais/reais
exceto a asserção estrutural, que é deliberadamente complementar.

## 9. Limitações

- O teste de "não responde na LAN" e o de "opt-in restaura a LAN" usam
  `t.skip()` quando a máquina não tem IP de LAN detectável — herdado do
  teste original, não uma lacuna introduzida por este gate. Numa máquina
  sem IP de LAN, essa prova específica simplesmente não roda (não é um
  falso positivo — é uma ausência de cobertura documentada).
- `HOST` com valor inválido (nem IP nem `0.0.0.0`) não é validado
  explicitamente — o processo falha alto (`throw`) em vez de validar e
  rejeitar com mensagem clara. Comportamento fail-closed (nunca binda
  insegura em silêncio), mas poderia ter uma mensagem melhor — fora do
  escopo deste gate cirúrgico (evitar refatoração geral do servidor).
- Nenhuma descoberta automática de IP, QR Code ou mecanismo de
  compartilhamento em rede foi adicionado, conforme pedido.

## 10. Próximo gate permitido

Auditoria independente desta correção (revisão cruzada por outra sessão/IA,
sem acesso ao trabalho de reconciliação, validando que o bind é realmente
seguro e que os testes realmente travam regressão). Só depois disso a
ponte Conference Brain ↔ Copiloto deve ser iniciada — não antes.
