# Contrato de Estado Cognitivo — V1

> Missão 3 do `docs/Plano_Entrega_V1_DeliveryOS.md`. Criado sobre o commit `abf1664`. Define o
> contrato mínimo entre o cérebro existente (`motor.js` + `decisao.js`, já corrigidos e provados) e
> qualquer superfície futura da V1. **Nenhum código foi alterado nesta missão** — `MOTOR.step()` já
> expõe tudo que este contrato exige (`mode`, `foco`, `ambList`, `emand`, `intenso`, `sits`, `ctx`) e
> `DECISAO.decidir()` já aceita `active`. Este documento formaliza como ler, nunca como recalcular.
>
> O estado cognitivo **não é uma tela** e **não é uma inteligência nova**. É a consequência direta do
> motor/decisão existentes, nomeada para que toda superfície da V1 a represente do mesmo jeito.

---

## 1. O contrato dos três estados

Um estado por minuto, nunca uma lista. A derivação é mecânica e já existe em código
(`motor.js:272`): `mode = foco | ambiente | calmo`.

| Estado | Definição | Derivação exata | A superfície MOSTRA | A superfície ESCONDE |
|---|---|---|---|---|
| **Calmo** | operação sem necessidade de gastar atenção humana — conclusão calculada, não ausência de cálculo | `mode==="calmo"` (nenhuma situação cruza piso) | o pulso (`emand` = N em andamento; ritmo via `intenso`) | tudo o mais — nenhuma lista, nenhum KPI, nenhuma contagem por praça |
| **Ambiente** | clima operacional relevante, sem interrupção — meteorologia, nunca alerta suave | `mode==="ambiente"` | até 2 rótulos curtos (`ambList`, já limitado a 2 no motor) + intensidade proporcional à severidade | números, listas, **qualquer bloco de ação** (proibição estrutural) |
| **Foco** | interrupção justificada (severidade ≥2 sustentada por debounce, fora de cooldown) | `mode==="foco"` (`sess.active` existe) | **uma** das duas formas do §1.1 | score, ranking (`todas`), `sits` cru, `suspeitos`, qualquer segunda ação |

### 1.1 As duas formas do Foco — e só estas duas

1. **Foco com ação dominante:** `decidir(R, INFO, {fonteReal, active: sess.active})` retornou um
   candidato. A superfície apresenta a hierarquia já canônica
   (`docs/Camada_Decisao_Operacional.md`): **AÇÃO → por quê → primeiro olhar → impacto →
   confiança-sussurro** (sussurro só quando confiança ≠ alta — a certeza é silenciosa).
2. **Foco puro:** `decidir(...)` retornou `null` (nenhum candidato seguro dentro do escopo do foco
   ativo). A superfície apresenta `buildFoco()` (`R.foco`: head → impactos → consequência → comando),
   **sem bloco de ação recomendada e sem inventar um**. Foco puro não é falha — é o sistema dizendo a
   verdade: sabe onde a atenção deve estar, não sabe prescrever com segurança o que fazer.

Não existe terceira forma. Não existe foco vazio, foco duplo, fila de focos, nem foco com ação de
outra causa raiz.

### 1.2 Regras epistemológicas (herdadas, não novas)

- Nenhuma hipótese tratada como fato: origem do dado (`fonteReal`), confiança (`alta/média/baixa`) e
  limitação (composição sintética × real) continuam explícitas em toda superfície.
- O sistema declara o que sabe (confiança alta, silenciosa), o que suspeita (sussurro de confiança
  média/baixa) e o que não sabe (dado ausente = `null`, nunca preenchido; implausível = `suspeitos`,
  nunca exibido ao operador).
- Baixa confiança nunca aparece como crítico (regra-mãe do caso "402 min").

## 2. Regra obrigatória: `decidir()` sempre com `active`

**Toda superfície futura da V1 que apresentar Foco/Ação deve chamar:**

```js
const R = MOTOR.step(t, NIGHT, INFO, sess);
if (R.mode === "foco") {
  const rec = DECISAO.decidir(R, INFO, { fonteReal, active: sess.active });
  // rec != null → Foco com ação dominante (§1.1-1)
  // rec == null → Foco puro: mostrar R.foco (buildFoco), sem ação (§1.1-2)
}
// R.mode === "ambiente" → R.ambList (máx. 2 rótulos, sem ação)
// R.mode === "calmo"    → R.emand + R.intenso (pulso, nada mais)
```

- A correção Motor × Decisão (`37ca1c9`, troca proibida 82→0) **só vale na experiência se a
  superfície passar `active`**. Chamar `decidir()` sem `active` reativa o comportamento antigo — em
  superfície da V1, isso é **bug por definição** (gate 11 do Plano V1).
- A interface **nunca recalcula** uma ação, nunca escolhe entre `todas`, nunca ranqueia por conta
  própria, nunca ignora o foco ativo.
- **Foco dominante = onde a atenção está** (`sess.active.sit`, eleito pelo motor).
  **Ação dominante = o que fazer sobre esse foco** (eleito por `decidir()` dentro do escopo).
  A ação pode **refinar** o foco (mesma causa, alvo mais específico); **nunca trocar a causa raiz**.

## 3. Inventário dos textos de `buildFoco()` (motor.js:290-340)

Com a correção, o foco puro deixou de ser raro: é hoje o caminho comum para `order` e `fechamento`
sem candidato seguro (auditoria: 2 dos 5 fechamentos reais caíram para foco puro). Estes textos
viraram porta-voz principal — inventário completo, avaliados como copy para operador real:

| Foco | Head | Impactos | Consequência | Comando | Avaliação |
|---|---|---|---|---|---|
| `praca` combinados | "COMBINADOS SEGURANDO FLUXO" / "COMBINADOS CARREGANDO" | "N pedidos dependem de combinados" · "N sairiam se combinados liberar" / "+X min acima do normal" | "combinado trava o pedido inteiro" | "priorizar combinados que liberam saída" | **Aceitável** — linguagem nascida da operação, causa e efeito claros |
| `praca` demais | "P EM RISCO" / "P CARREGANDO" | "N pedidos na praça" · unblock / "+X min" / "item concentrando a fila" | "se continuar, a expedição seca" (quentes) / "trava o fechamento de pedidos" | "priorizar P · olhar item" / "priorizar bancada de P" | **Aceitável**, com 1 defeito de borda (ver E1) |
| `fechamento` | "FECHAMENTO · #id" | "só depende de P" · "ainda tem item frio" / "sem frios pendentes" | "pronto pra fechar assim que P sair" | "verificar se já dá pra fechar #id" | **Aceitável** — vocabulário que a operação já usa; head é rótulo, não verbo (revisão futura R1) |
| `conferencia` | "CONFERÊNCIA · #id" | "N sacolas · N itens" · "obrigatório: bebida + kit" · obs do cliente | "observação especial pode passar batido" / "risco de faltar item / 2ª sacola esquecida" | "separar 2ª sacola e conferir item a item" | **Aceitável** — concreto e humano; truncamento de obs sem reticências (E2) |
| `saida` | "SAÍDA TRAVADA" / "SAÍDA LENTA" | "N prontos sem sair" · "motoboy é o gargalo" | "pedidos vão atrasar na entrega" | "chamar motoboy / conferir saída" | **Aceitável** — direto, sem drama |
| `order` expedição | "#id SEM SAIR" | "pronto há N min" · "+N podem atrasar" / "aguardando motoboy" | "atraso na entrega · cliente pode reclamar" | "conferir saída" | **Aceitável** |
| `order` produção | "#id PRESO EM P" / "#id TRAVADO" | "N min sem ficar pronto" · "depende de N praças" / "praça: P" | "segura o pedido inteiro" / "+N esperando P" / "fila crescendo" | "olhar P" / "olhar produção" | **Aceitável**, com bordas frias (E3) |

**Defeitos de borda encontrados (propostas registradas — NÃO alterar `motor.js` nesta missão):**

- **E1** — `praca` com `unblock=0`, `acima=0` e sem item dominante exibe **"+0 min acima do
  normal"** (`motor.js:302`: `causa` cai no ramo numérico com acima=0). Texto sem sentido para
  operador. Proposta futura: nesse caso, exibir só "N pedidos na praça, acima do normal".
- **E2** — observação do cliente truncada em 48 caracteres **sem reticências** (`motor.js:319`,
  `slice(0,48)`) — pode cortar palavra no meio e mudar o sentido de uma observação de alergia.
  Proposta futura: adicionar "…" e nunca truncar observação com termo de risco.
- **E3** — `order` produção sem praça resolvível exibe **"praça: —"** (`motor.js:337`) — frio e
  técnico. Proposta futura: omitir a linha em vez de mostrar travessão.
- **E4** (de superfície, não de motor) — os `impactos` embutem markup `<b>` nas strings
  (`motor.js:298-338`). A superfície V1 deve renderizar ou remover esse markup — nunca exibi-lo cru.
- **E5** (de superfície, não de motor) — com dado real, o `#id` é fatia de UUID (8 hex, ex.:
  `#38f93b72`) — impossível de gritar numa cozinha. A V1 deve exibir o **ID curto do iFood** sempre
  que não-ambíguo no dia (a janela 01/07 já faz isso quando único). Decisão de exibição, não de motor.

**Separação:** todos os 7 textos são **aceitáveis para a V1 interna/sombra** como estão. Nenhum é
alarmista, nenhum finge certeza, nenhum vigia pessoa. As revisões (R1, E1-E3) são refinamento de
copy para **depois** do primeiro teste do César — entram em `docs/Correcoes_V1_DeliveryOS.md` se o
teste confirmar que incomodam, e qualquer mudança em `buildFoco()` exige autorização separada.

## 4. Diretrizes de copy V1 (Calmo · Ambiente · Foco)

A copy protege atenção humana. As palavras são parte da interface.

1. **Curta.** Ação em imperativo, ≤4 palavras ("PRIORIZE DUPLAS", "CHAME MOTOBOY"). Cada linha de
   apoio cabe numa leitura de relance no balcão.
2. **Humana e operacional.** Vocabulário da cozinha ("fechar", "sair", "segurando fluxo", "2ª
   sacola"), nunca de sistema ("processando", "registro", "status", "erro 4").
3. **Sem alarme falso.** Gravidade sem drama: "EM RISCO" só em severidade 3; nunca "URGENTE!",
   nunca ponto de exclamação, nunca vermelho textual. Lei 12: um lobo gritado mata todos os sinais.
4. **Sem excesso técnico.** Números só quando mudam a ação ("3 sairiam se liberar" muda; "score
   7,4" nunca aparece). Nada de percentuais, médias ou jargão de dado.
5. **Sem parecer dashboard.** Nenhum texto convida a "ver mais", "abrir lista", "detalhes". O texto
   dá a única coisa e para.
6. **Sem fingir certeza.** Composição sintética/inferida carrega o sussurro de confiança; fato
   observado fala firme e sem sussurro. Nunca colapsar os dois no mesmo tom.
7. **Sem humilhar nem vigiar.** Nenhum texto nomeia pessoa, atribui culpa ou compara desempenho.
   O sujeito é sempre a operação ("praça carregando"), nunca alguém ("fulano atrasou").
8. **Fato ≠ hipótese ≠ desconhecido, quando a distinção muda a ação.** "pronto há 52 min" (fato) ·
   "provável 2ª sacola" (hipótese, sussurro) · dado ausente = silêncio, nunca chute.
9. **Calmo quase não fala.** O pulso ("N em andamento") é todo o vocabulário do Calmo. Ambiente usa
   rótulos de clima ("Quentes carregando"), nunca frases de comando.
10. **Foco puro fala com a mesma dignidade do foco com ação.** Cair para `buildFoco()` nunca é
    apresentado como erro, carregamento ou estado degradado.

## 5. Gate obrigatório da Missão 4 — composição real

**A interface mobile/PWA da V1 só pode ser demonstrada, calibrada ou validada sobre composição
real.** O backtest sintético não pode ser base principal de nenhuma decisão de UX.

Justificativa medida (não hipótese): o sintético distorce a própria distribuição do que o operador
veria — `fechamento` é **30% dos focos** no backtest sintético (161/536) contra **1,9% nas 12
janelas reais** (5/266); praça única real 17% vs sintética 64%; 2ª sacola real 59% vs sintética 21%
(intervalos sem sobreposição, 12/12 janelas). Uma UX calibrada no sintético otimizaria o sinal
errado. A V1 deve ser demonstrada primeiro sobre janela real (as 12 já validadas servem de material
de demo). Uso de sintético permitido apenas como fallback rotulado de teste mecânico — nunca como
retrato da operação.

## 6. Risco registrado: protótipo antigo não é demo da V1

`prototipos/parados-agora/index.html` (11.039 linhas) contém **cópia embutida do `decidir()`
anterior à correção** (`index.html:10784`) e chama `DEC.decidir()` **sem `active`**
(`index.html:10965`, `app.js:65`). Ou seja: o protótipo demonstra exatamente o comportamento que a
correção `37ca1c9` eliminou — inclusive a troca proibida de causa raiz.

**Regra:** o protótipo antigo não deve ser usado como demo, referência de comportamento ou base da
V1. Ele permanece intocado como registro histórico da direção visual "Campo Vivo". Corrigi-lo ou
aposentá-lo formalmente é missão separada, se o César decidir que vale o custo — a V1 (Missão 4)
nasce em superfície nova.

## 7. O que este contrato NÃO é

Não é UI, não é design, não é dashboard, não é Memória Operacional, não é Resolução, não é tuning,
não é inteligência nova, não altera o motor. É a regra de leitura única que impede 200
implementações incompatíveis do mesmo cérebro.
