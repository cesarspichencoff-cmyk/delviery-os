# Saída bruta e integral do avaliador independente — REVOLUTION 0-A · SEGUNDA RODADA

> **Este arquivo é a resposta LITERAL do avaliador, sem uma única alteração.**
> Nenhum achado, severidade, nota ou veredito foi editado, resumido, reformulado ou suavizado.
> Comentários do construtor **não existem neste arquivo**.
>
> | Campo | Valor |
> |---|---|
> | **HEAD efetivamente auditado** | **`9845e15`** |
> | Avaliador | **o MESMO da primeira rodada**, retomado do próprio transcrito |
> | Avaliador novo criado | **não** |
> | Modelo | Sonnet 5 (`claude-sonnet-5`) |
> | Rodada | **segunda** |
> | Recebido em | 2026-08-07 |
> | **Veredito** | **`APPROVED`** — mudou de `APPROVED_WITH_RESERVATIONS` |
> | Working tree no início e no fim | **limpo** nos dois |
> | Modo | read-only, com `LAB_V4_EVIDENCIAS` redirecionando capturas para fora da worktree |

---

<!-- INÍCIO DA SAÍDA LITERAL DO AVALIADOR — NÃO EDITAR -->

# Reavaliação — delta · REVOLUTION 0-A · `/lab/operacao-viva-v4`

## 1. Commit reavaliado e estado do working tree

| Momento | `git status --porcelain` | HEAD |
|---|---|---|
| Início desta rodada | **limpo** | `0f1dd5031309f4f98b6fce2751601557a8b360f3` (mudou para `9845e158c09630278d21039ed07ee591ab6efefe` assim que chequei — nenhum commit aconteceu *durante* minha reavaliação desta vez) |
| Fim desta rodada | **limpo** | `9845e158c09630278d21039ed07ee591ab6efefe` |

**HEAD efetivamente auditado: `9845e15`.**

Não aceitei a afirmação do coordenador de que o diff `0f1dd50..9845e15` é inócuo sem checar — refiz eu mesmo:

```
git diff --stat 0f1dd50..9845e15
→ 7 arquivos: 6 de documentação + labs/operacao-viva-v4/testes/run-lab-v4-browser.ts

git diff 0f1dd50..9845e15 -- labs/operacao-viva-v4/testes/run-lab-v4-browser.ts
→ troca só a linha de log: "Capturas: N em labs/operacao-viva-v4/evidencias/" (fixo)
  vira "Capturas: N em ${EVID}" (o caminho real, respeitando LAB_V4_EVIDENCIAS)
```

Concordo com a medição do coordenador: é o log deixando de mentir sobre onde gravou, nada mais. Nenhuma asserção, nenhuma contagem de teste, nenhuma lógica mudou. **Rodei o teste com essa mudança e confirmei o comportamento na prática** (seção 2).

## 2. Comandos executados

```bash
npm run typecheck:lab:v4        # exit 0
npm run test:lab:v4             # 48 guardas: 0 falhas · 9 mutações: 9 acusadas, 0 cegas, 0 não aplicadas → LAB_V4_GATE_GREEN
LAB_V4_EVIDENCIAS="…/scratchpad/reaval2" npm run test:lab:v4:browser
                                 # 28 testes: 0 falhas → LAB_V4_BROWSER_GATE_GREEN
npm run test:platform:r5        # 10/10 gates GREEN, 0 RED
git diff --name-only 73f2f0b -- src/perfil-delivery/ src/product/viewmodels/ \
  src/product/atencao/politica-temporal.ts src/product/atencao/linhagem-eventos.ts \
  src/platform/copiloto/confianca-duravel.ts src/product/ui/ docs/figma/
                                 # vazio
```

Confirmei ao vivo que o redirecionamento funcionou de verdade, não só no log: o log agora imprime literalmente `Capturas: 12 em C:/Users/.../scratchpad/reaval2`, listei esse diretório e os 12 PNGs estão lá, e `git status --porcelain` ficou **vazio** imediatamente depois — nenhum PNG versionado foi tocado desta vez. O desvio read-only da 1ª rodada está corrigido, verificado por mim, não só declarado.

Além dos comandos pedidos, rodei minha própria verificação via API (`GET /api/cena/<id>`) para os 18 cenários, inspecionei CSS computado ao vivo, e li o diff de código-fonte do commit de correção (`cfa2fdb..0f1dd50`) linha a linha — não só a mensagem de commit.

## 3. Classificação do diff `0f1dd50..9845e15`

**Concordo com a classificação do coordenador: inócuo.** Verifiquei de forma independente (não apenas reproduzindo os comandos sugeridos): o único arquivo executável tocado troca uma constante de string por uma variável já existente numa linha de `console.log`, sem tocar nenhuma asserção, nenhum bloco `teste(...)`, nenhuma mutação. Rodei o gate com essa versão e o resultado bate exatamente com o esperado.

## 4. Achado 5.1 — **RESOLVIDO**

Evidência própria, em quatro camadas independentes:

**a) Código-fonte da correção (`cfa2fdb..0f1dd50`), lido por mim:**
- `FONTE_MOTOBOY` (`fila_despacho`, `sem_medicao_automatica`) nasceu em `base.ts`, no mesmo molde de `FONTE_CAIXA`/`FONTE_CONFERENCIA`.
- Contei as ocorrências: `FONTE_MOTOBOY` aparece **6 vezes** em `cenarios.ts` — exatamente as mesmas 6 de `FONTE_CONFERENCIA` (1 import + `SAUDAVEIS()` + as 4 cenas que montam `fontes` manualmente). Cobertura total nas 18 cenas, não parcial.
- A isenção `u.pressao.observado || u.id === "motoboy"` em `G7b` **não existe mais** — confirmei lendo o código atual, não o changelog: a asserção hoje é só `u.pressao.observado`.
- `G7c` agora testa `["caixa", "conferencia", "motoboy"]`. `G7d` (nova) exige fonte declarando ausência para as três. `G7e` (nova) proíbe fonte duplicada.
- **`labs/operacao-viva-v4/dominio/` está byte-a-byte idêntico** desde antes da correção até agora (`git diff cfa2fdb HEAD -- labs/operacao-viva-v4/dominio/` vazio). A correção foi inteiramente **declarativa** — nasceu um dado novo, nenhuma lógica de `vm-v4.ts` mudou. É a forma mais limpa possível de corrigir isto: a fórmula genérica (`every(f => f.estado.sustenta_calmo)`) já estava correta; faltava o dado.

**b) Gate de mutação, rodado por mim:** `MD9` remove `FONTE_MOTOBOY` de `cenarios.ts` e o gate corretamente falha em `G7b`/`G7c`/`G7d` com a mensagem `"motoboy está verde sem pressão observada"` / `"motoboy apareceu verde"` / `"motoboy não tem fonte declarando ausência de medição"` — voltando ao defeito original. Restaurado, e o gate acusa (`MD9 → acusada por G7`). Isto é a prova mais forte que existe: apliquei o próprio defeito de volta e o produto reagiu como deveria.

**c) API, consultada por mim para as 18 cenas** (não amostra): `motoboy.cor` nunca é `"verde"` em nenhuma. É `"sem_medicao"` em 17 e `"amarelo"` em 1 (`foco-com-secundarios`, tratado no item 5 abaixo). `carga.observado` e `pressao.observado` continuam `false` em todas — a cor mudou, a honestidade sobre o que não é medido não.

**d) Tela, lida por mim ao vivo:** o card do Motoboy em `calma-real` agora diz "Sem medição automática" / "Fila do despacho: Esta área nunca aparece verde..." / "carga não medida · pressão não medida" — sem mais a contradição "Fluindo"+"carga não medida" lado a lado. A borda do card virou `dashed` (era `solid`), igual a Caixa e Conferência — confirmado por `getComputedStyle`, não por leitura visual. A lista de fontes ganhou a décima entrada, "Fila do despacho: SEM MEDIÇÃO AUTOMÁTICA". "O que já se sabia que falta" foi de 3 para **4** ausências estruturais.

**Não sobrou nenhuma cena, nenhuma camada (dado, guarda, mutação, DOM, CSS) onde o defeito original ainda apareça.**

## 5. Resposta às perguntas específicas do coordenador

**Item 2 — o Motoboy fica âmbar em `foco-com-secundarios`: legítimo ou falsa certeza por outro caminho?** **Legítimo.** Texto renderizado: *"Motoboy · Atenção · Pedido E-503 pronto ha 40 minutos e ainda nao saiu. · carga não medida · pressão não medida"*. Três motivos para eu aceitar isto:
1. `carga.observado`/`pressao.observado` continuam `false` — a tela não está fingindo medir capacidade, só está citando um fato específico.
2. O motivo nomeia um pedido concreto e uma duração concreta, sustentados por uma fonte real (Tempos do iFood, que mede `pronto`/`saiu` — isso *é* o que ela mede). Não é uma agregação inventada; é um evento observado.
3. O mecanismo (`sevPintura >= 2` sobrepõe `sem_medicao`) é o **mesmo código, sem exceção por unidade**, que já valia para Caixa/Conferência/Sushi/Cozinha antes da correção — verifiquei que `vm-v4.ts` não mudou. Não é um atalho novo para o Motoboy; é a regra geral "sinal observado vence ausência de medição agregada" se aplicando a ele pela primeira vez porque agora ele participa do mesmo sistema de fontes que as outras unidades sem medição.

A diferença de categoria entre isto e o achado 5.1 é exatamente a diferença que a Constituição exige: fato pontual e evidenciado (âmbar, com pedido nomeado) contra alegação agregada sem nenhum lastro (verde, "em ritmo normal", achado 5.1 original).

**Item 5 — procurei um segundo caso do mesmo tipo:**
- Vasculhei `labs/operacao-viva-v4/dominio/*.ts` inteiro por `.id === "<literal>"` (o padrão exato do defeito original, um `if` especial por identidade de unidade): **zero ocorrências**. A lógica de cor de unidade é genérica para as 6 unidades, sem exceção nomeada em lugar nenhum.
- Vasculhei `run-lab-v4-tests.ts` inteiro por `continue`/`return`/`assert.ok(a || b)` (todo ramo de escape de guarda): 8 ocorrências. Duas são infraestrutura do executor de mutação (não são guarda). As outras 5 são exatamente as que a auditoria do construtor lista em §4-B — refiz a leitura linha a linha e concordo com a classificação: cada uma é pré-condição de escopo (a asserção não se aplica quando a condição não existe naquela cena) e cada uma tem controle positivo em outra guarda (`G3b`, `G6c`) que prova o caso relevante em pelo menos uma cena real. Nenhuma delas isenta uma unidade, uma fonte ou um pedido específico por nome — a única que fazia isso era `G7b`, e ela caiu.
- Vasculhei `run-lab-v4-browser.ts`: 2 ocorrências, nenhuma é escape de asserção — uma é helper de UI (não reabrir `<details>` já aberto), outra é guarda de tipo dentro do scanner de PII (`typeof v !== "string"`, legítimo: regex de PII não se aplica a não-string).
- Confirmei que `validacao/`, `servidor/` e `ui/` estão **idênticos** ao que testei manualmente na 1ª rodada (injeção de PII ao vivo, servidor GET/HEAD-only) — `git diff f164520 HEAD` vazio nesses caminhos. Aquelas descobertas continuam válidas sem precisar de reteste.

**Não encontrei um segundo caso.** Registro isto como resultado de uma busca real, não como garantia de inexistência — ver seção 9.

## 6. Regressões

**Nenhuma encontrada.** Evidência: 48/48 guardas passam (subiu de 46 — as 2 novas são as que cobrem o próprio Motoboy), 9/9 mutações acusadas (subiu de 8 — a nova é `MD9`), 28/28 testes de navegador, 10/10 gates de plataforma R5, caminhos congelados com diff vazio desde `73f2f0b`. Reconferi ao vivo que `ambiente-critico-persistente` continua com a Cozinha em `sev 3` fora do Foco, e que `calma-real` continua com Sushi/Sushi Quentes/Cozinha verdes com pressão real observada — nada mudou fora do Motoboy.

Uma observação, não uma regressão: a própria correção teve um bug (fonte duplicada em 4 cenas por causa de um padrão de substituição em string curto demais), pego pelo próprio construtor antes de eu ver o código, e coberto por uma guarda nova (`G7e`). Contei `FONTE_MOTOBOY` em `cenarios.ts`: são 6, o número certo — a duplicata não sobrou no estado final.

## 7. Achados novos

Nenhum de severidade alta ou média. Um ponto informativo: a correção em si introduziu 2 guardas novas (`G7d`, `G7e`) e não há mutação dedicada para `G7e` isoladamente (só `MD9`, que cobre `G7` como família via `G7b`/`G7c`/`G7d`). Isto não é um defeito — `G7e` protege contra um erro de autoria (fonte duplicada), não contra uma garantia de produto, e a Constituição não exige mutação para toda guarda de higiene de dado de fixture. Registro como observação, não como achado.

## 8. Notas da rubrica que mudam

| # | Item | 1ª rodada | Agora | Por quê |
|---|---|---|---|---|
| 4 | Distinção fato/inferência/ausência | 6 | **9** | A única violação comprovada (achado 5.1) está resolvida e verificada em 4 camadas independentes. |
| 12 | Consistência | 6 | **9** | As 3 unidades sem medição de carga (Caixa, Conferência, Motoboy) agora seguem o mesmo padrão simétrico — mesma fórmula genérica, mesma borda tracejada, mesma fonte estrutural declarada. |
| 14 | Falsa certeza | 4 | **8** | O caso sistemático (15/18 cenas) foi eliminado. Não acredito em "10" porque uma busca de segundo caso, por mais real que tenha sido, não é prova de ausência total no repositório — só nesta rota. |
| 15 | Acabamento | 8 | **9** | A correção veio com guarda simétrica, mutação dedicada, e a própria equipe pegou e corrigiu um bug secundário (fonte duplicada) antes de eu ver o código — rigor real, não só reação ao meu achado. |

Os demais itens (1, 2, 3, 5, 6, 7, 9, 10, 11, 13) não mudam: nada que os sustentava foi alterado por esta correção, e reconferi os que dependiam de código tocado (nenhum dependia).

## 9. Reservas restantes

- A rota do Caixa continua inalcançável fora de fixture (PB15) — não é defeito, é limite declarado, e segue igual.
- Sushi Quentes como unidade continua experimental, domínio canônico não mudou (PB14) — igual à 1ª rodada.
- Validação continua não-operacional (local, sem auth, sem sync) — por design, declarado na própria tela.
- Nada disto viu operação real. 74+ testes verdes não substituem uma sexta de pico, e o César abrindo a rota pessoalmente continua sendo o único checkpoint que importa depois deste.

## 10. Riscos não comprovados

- Minha busca por um segundo caso do defeito foi exaustiva **dentro de `labs/operacao-viva-v4/`**, não do monorepo inteiro — não posso afirmar que o padrão "unidade sem medição sem fonte declarada" não existe em nenhum outro lugar do produto canônico (`src/product/`), só que não existe nesta rota.
- Não refiz a captura de screenshot pixel-a-pixel nos 3 viewports para todas as 18 cenas — apoio-me nos 28 testes automatizados (que passaram) e na leitura de DOM/CSS computado ao vivo para a cena que mais importava (`calma-real`, `foco-com-secundarios`).
- Não repeti o teste manual de injeção de PII nesta rodada — o código de `validacao/` está comprovadamente idêntico ao que testei à mão na 1ª rodada (diff vazio), então não há necessidade lógica de repetir, mas também não é uma nova medição desta rodada.
- Continuo sem poder confirmar navegação por teclado ao vivo por limitação da minha própria ferramenta de automação (não é evidência a favor nem contra o produto).

## 11. VEREDITO DELTA

**APPROVED** — muda em relação ao veredito anterior (`APPROVED_WITH_RESERVATIONS`).

A ressalva da 1ª rodada tinha uma base única, nomeada e escrita por mim: o achado 5.1. Não escrevi nenhuma outra reserva de bloqueio naquele relatório — as demais eram limitações da minha própria cobertura de teste, não do produto. Hoje, com evidência própria em quatro camadas (leitura do diff de código, mutação `MD9` reaplicando o defeito e sendo pega, consulta às 18 cenas por API, e leitura da tela e do CSS computado ao vivo), considero o achado 5.1 resolvido de forma que eu mesmo consegui verificar de forma independente — não apenas aceitar a palavra do construtor. Fiz a varredura de segundo caso que a 1ª rodada deixou em aberto e não encontrei outro caso, nem no domínio nem nos dois arquivos de teste. O desvio read-only da 1ª rodada (PNGs versionados regravados) também está corrigido e verificado por mim nesta rodada — `git status --porcelain` ficou limpo nos dois extremos, com o gate de navegador redirecionado rodando de verdade.

Isto não é aprovação para operação — o estado máximo desta missão continua sendo `AWAITING_CESAR_REVIEW`, e é o César, não este avaliador, quem decide se o Lab vai além disso. Esta é a resposta à pergunta que me foi feita: a correção do achado 5.1 se sustenta, resiste a ataque direto, não introduziu regressão, e nenhum novo problema equivalente apareceu.

<!-- FIM DA SAÍDA LITERAL DO AVALIADOR — NÃO EDITAR -->
