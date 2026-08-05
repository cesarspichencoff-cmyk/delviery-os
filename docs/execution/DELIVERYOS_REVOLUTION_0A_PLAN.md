# REVOLUTION 0-A — plano executado

> Plano **aprovado pelo César em 2026-08-04**, com sete ajustes vinculantes, e executado em seguida.
> O progresso, o estado do repositório e os pathspecs protegidos estão em
> `DELIVERYOS_REVOLUTION_0A_PROGRESS.md`.

---

## 1. O achado que moldou o plano inteiro

Os gates R5 congelam por **`git diff --name-only <baseline> -- <pathspecs>`**, exigindo saída vazia.
Isso não protege só edição: um arquivo **novo** commitado dentro de `src/product/ui/` ou
`src/product/viewmodels/` passa a aparecer nesse diff e **derruba `npm run test:platform:r5`**.

Logo o Lab não podia nascer dentro do produto. Ele nasceu isolado em `labs/operacao-viva-v4/` e
reutiliza o produto **por importação**.

Instrução do César: *"Não altere, enfraqueça, atualize o baseline nem crie exceções no gate apenas
para acomodar o Lab."* Cumprido — os sete gates de congelamento seguem verdes com os baselines
originais.

## 2. As quatro decisões do César (Q1–Q4)

| # | Decisão |
|---|---|
| Q1 | Lab como aplicação isolada. `apps/` não existe no repositório ⇒ segunda opção, `labs/operacao-viva-v4/`, razão documentada |
| Q2 | Sushi Quentes vira **unidade operacional experimental** só dentro do Lab. `areas.ts`, D45 e D46 intocados. Regra física `ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT` junto |
| Q3 | Modo de Validação **local ao navegador**, IndexedDB, atrás de `ValidationRepository`. D38 e B7 preservados |
| Q4 | **Um** subagente, exclusivamente avaliador independente read-only, depois da implementação |

## 3. Os sete ajustes vinculantes

| # | Ajuste | Como foi cumprido |
|---|---|---|
| 1 | Não alterar o `tsconfig.json` raiz | `labs/operacao-viva-v4/tsconfig.json` estendendo o raiz + script `typecheck:lab:v4`. Raiz intocado |
| 2 | Confiança não estimada tem que **aparecer** | `Confiança: não estimada` literal na tela, sem percentual, score ou cor. Guarda `G4` proíbe `%` no texto |
| 3 | Caixa **não é rota padrão** | Sem Sushi ⇒ só *candidato*. Caixa exige as 6 condições **comprovadas**; ausente/desconhecida mantém o fluxo normal. Guardas `G8c`/`G8d`, mutação `MD4` |
| 4 | Avaliador não substitui o César | Estado máximo `AWAITING_CESAR_REVIEW`. `HUMAN_APPROVED` e `RELEASED` não são registrados |
| 5 | Um subagente; retomar o mesmo em reavaliação | Um só, e a retomada usa `SendMessage` no mesmo agente |
| 6 | Registros canônicos mínimos e aditivos | `STATE.json`, `DECISIONS.md` e `BLOCKERS.md` só ganham entradas novas |
| 7 | Provar 405 no servidor | `G12` e `[C8]`: POST/PUT/PATCH/DELETE ⇒ 405 + `Allow: GET, HEAD`, sem mutação |

## 4. O que foi construído

**Domínio do Lab** — oito estados de fonte com tradução total e conservadora do canônico (`parcial`
sem cobertura declarada nunca vira saudável); Sushi Quentes como unidade própria com a trava de
não-absorção; `ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT`; a trava do Calmo que **só rebaixa**.

**Dezoito cenas** — as 14 da missão §12 mais quatro da decisão do César. Cargas lidas contra os
baselines reais do motor.

**A rota** `/lab/operacao-viva-v4`, servidor irmão na 5291, somente leitura, tokens do organismo
servidos pelo mesmo arquivo do produto, sem cópia.

**Modo de Validação** em IndexedDB atrás de `ValidationRepository`, com resumo do turno, exportação e
importação com schema validado e guarda de PII nas duas portas.

**Dois gates** — 46 guardas + 8 mutações (8 acusadas, 0 cegas) e 28 testes de navegador em três
viewports, incluindo os dez casos numerados do César.

## 5. O que a execução encontrou, e que não estava no plano

Nove defeitos, **todos achados rodando, nenhum lendo código**:

1. o sinal do Foco aparecia **duplicado** entre os secundários — comparação por referência entre dois
   resultados de `sinaisDe()`;
2. o pulso virava `0` sem fonte de pedido, porque o Cardápio (seed estático) está sempre saudável;
3. a cena de fonte atrasada perdia o pulso junto com os tempos — lista e tempos são faces diferentes;
4. a Caixa explicava o próprio estado com um sinal de chegada, embora ninguém a meça;
5. `carga 14 · pressão 50%` parecia dois ângulos do mesmo número, e não é;
6. a hora vinha do relógio de quem abre a página, não da loja;
7. o botão de exportar **nunca baixava nada** — âncora desanexada **e** blob revogado no mesmo tick;
8. o guarda de PII recusava exportações limpas: primeiro de vez em quando (UUID parecendo CEP),
   depois **sempre** (`versao_fixture` parecendo e-mail);
9. a tela tinha **8346 px** de altura no desktop.

Mais um defeito no próprio gate — a primeira `MD6` era **cega** (L41) — e dois nos próprios testes.

## 6. O que a missão deliberadamente não fez

Typography Lab · Motion Lab · Jitter · radar externo · Golden Set · evals · red team · pacote de campo
· PostgreSQL · APK · piloto · CRM · Gestor · Odhen · coletor · alteração em Entregas · Figma.

Nenhum pacote instalado. Nenhum push, merge, PR ou deploy. Nenhuma escrita fora da worktree
autoritativa. `areas.ts` e todos os pathspecs do PF4 com diff vazio.
