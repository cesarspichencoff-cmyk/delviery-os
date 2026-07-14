# Investigação — Cenários de Volume para Ambiente e Foco (V0)

> Branch `feature/d4a-cenarios-volume-visual`, criada de `feature/d4a-simulador-interface`
> @ `7267c1019e169a93429b956ebe3b5c6376c64642`. Investigação isolada — nenhuma alteração na
> branch D4A original. `main` intocada.
>
> **Objetivo:** provar que o motor real (`src/perfil-delivery/motor.js`, `decisao.js`,
> ambos INTOCADOS) decide Ambiente e Foco legitimamente a partir de volume/tempo de
> pedidos sintéticos — sem forçar modo, sem alterar limiar, sem tocar `sess.active.sit`.

---

## 1. Decisão técnica que teve de ser tomada (documentada, não silenciosa)

Os cenários certificados 3A/3B/D4A usam nomes de item fictícios
(`Item Sintetico Alfa`...) que nunca casam com o cardápio real via `MOTOR.matchSeed()` —
caem em `montagem_outros` (não-produção) e nunca entram na conta de sobrecarga de praça.
Isso é correto para aqueles cenários (só provam o encanamento do núcleo), mas torna
**impossível** fazer o motor decidir Ambiente/Foco de verdade, porque essa decisão
depende inteiramente de `load[praça] > BASELINE[praça]` — uma conta que só existe para
pedidos corretamente classificados numa praça de PRODUÇÃO real.

**Decisão:** esta investigação usa **nomes reais do cardápio público**
(`data/cardapio_knowledge_seed.json`) — dado de **conhecimento** do produto (público, não
operacional, não PII), não dado de pedido real. Tudo o que é **operação** continua 100%
sintético: identificadores (`SIM-IFOOD-*`, `SIM-INTERNO-*`, `SIM-JOB-*`), datas
(`2026-09-15`, dia nunca usado em nenhuma outra demonstração), horários e volume são
inteiramente fabricados por `tools/live/simulator/investigacao_volume/`. Só itens com
`pracas_dependentes: []` foram escolhidos — cada pedido afeta **exatamente uma** praça,
tornando a carga por praça matematicamente previsível.

## 2. Dois achados de implementação (novos, não documentados antes desta missão)

**Achado 1 — pedido sem destino é invisível ao motor.** `MOTOR.step` só conta um pedido
como "em produção" se ele tiver **algum** destino conhecido: `o.p` (pronto) OU `o.c`
(cancelado) não-nulo (`up = o.p!=null?o.p:o.c; if(up==null) continue`). Um pedido com os
dois nulos — a primeira versão desta investigação assumia que isso o mantinha "em
produção para sempre" — na verdade o torna **invisível**, sem contribuir para `load[]`.
Correção: todo pedido recebe um evento `status_ifood` coluna `"pronto"`, deliberadamente
agendado bem depois da janela de observação de interesse, garantindo `o.p > t` durante
toda a demonstração.

**Achado 2 — "fechamento" é uma segunda via para Foco.** Além da sobrecarga de praça
(`kind:"praca"`), existe `kind:"fechamento"` (sev fixo 2): qualquer pedido de bancada
única esperando mais que `FLOORS.PROD*0.6=27` minutos vira candidato — e sev2 sempre
supera sev1. No cenário Ambiente (desenhado para ficar só em sev1), isso fazia qualquer
pedido antigo virar Foco por essa via paralela depois de ~27 minutos. Corrigido limitando
a janela do cenário Ambiente a 20 minutos (< 27). No cenário Foco isso **não** acontece
porque a praça sobrecarregada já está em sev3, que domina o fechamento (sev2) na
ordenação de `sits` — confirmado empiricamente (ver `evidencia-motor-real.json`), não só
por leitura de código.

Nenhum dos dois achados exigiu alterar `motor.js`/`decisao.js`/`adaptador.js` — só o
desenho dos cenários precisou respeitar o comportamento real, já existente, do motor.

## 3. Descrição dos cenários

### Cenário Ambiente (`investigacao_ambiente_multiareas`)

4 praças de produção, cada uma **logo acima** do baseline real (sev1 — nunca sev2):

| Praça | BASELINE | Pedidos | Ratio | Sev |
|---|---|---|---|---|
| duplas | 6 | 7 | 1,167 | 1 |
| enrolados | 5 | 6 | 1,2 | 1 |
| enrolados_quentes | 3 | 4 | 1,333 | 1 |
| cozinha_quentes | 4 | 5 | 1,25 | 1 |

22 pedidos no total. Chegada em rajadas por minuto (0/1/2/3), todas as 4 praças
sobrecarregadas a partir do minuto 3 (relativo). Nenhuma ratio chega a 1,4 — nenhuma
praça vira candidata a Foco (`sess.pending` exige `top.sev>=2`).

### Cenário Foco (`investigacao_foco_praca_soberana`)

Só `cozinha_quentes` (BASELINE 4) recebe pedidos, um por minuto, minutos 0-7 (8 pedidos
no total, ratio final 2,0 = sev3). Nenhuma outra praça recebe pedido — `cozinha_quentes`
é a única candidata possível.

## 4. Linha do tempo (evidência de `MOTOR.step`, minutos absolutos = minutos desde a
meia-noite local de `2026-09-15`)

### Ambiente

| Minuto absoluto | Evento | `mode` |
|---|---|---|
| 1135-1139 | (antes de qualquer chegada) | `calmo` |
| 1140 | 7 pedidos chegam em `duplas` (n=7>6) | `ambiente` |
| 1141 | +6 pedidos em `enrolados` (n=6>5) | `ambiente` |
| 1142 | +4 pedidos em `enrolados_quentes` (n=4>3) | `ambiente` |
| 1143 | +5 pedidos em `cozinha_quentes` (n=5>4) — 4 praças simultâneas | `ambiente` |
| 1143-1155 | clima sustentado, 4 áreas, nenhuma sev>=2 | `ambiente` (ininterrupto) |
| — | **Foco nunca ocorre nesta janela** | — |

Contagem por modo (janela completa T0=1135, T1=1175, 41 minutos): `{calmo:21, ambiente:20}`.

### Foco

| Minuto absoluto | Evento | `mode` | `sits`/`sess.active` |
|---|---|---|---|
| 1140-1143 | pedidos 1-4 chegam (n≤4, não>BASELINE) | `calmo` | — |
| 1144 | pedido 5 chega (n=5, ratio 1,25) | `ambiente` | sit sev1, sem pending |
| 1145 | pedido 6 chega (n=6, ratio 1,5, **sev2**) | `ambiente` | `sess.pending` nasce (`since=1145`) |
| 1146 | (n=7, ratio 1,75, sev2) | `ambiente` | pending mantido |
| 1147 | pedido 8 chega (n=8, ratio 2,0, **sev3**) | `ambiente` | pending mantido |
| **1148** | `(t-since)=3 >= DEBOUNCE` — **sustained** | **`foco`** | **`sess.active` DISPARA** |
| 1148-1155 | Foco ativo (`MAXFOCUS=8` minutos) | `foco` | `sess.active.sit` = ver §5 |
| 1156 | `t>=until` — Foco expira automaticamente | `ambiente` | `firedAt` registrado; cooldown 45min |
| 1157-1175 | situação ainda qualifica (sev3) mas em cooldown — nunca refire nesta janela | `ambiente` | — |

Contagem por modo (janela completa T0=1135, T1=1215, 81 minutos):
`{calmo:25, ambiente:48, foco:8}` — os 8 minutos de Foco batem exatamente com
`FLOORS.MAXFOCUS=8`, sem nenhuma configuração manual.

## 5. Evidência de `sess.active.sit` no primeiro minuto de Foco

```json
{
  "key": "pr:cozinha_quentes",
  "kind": "praca",
  "praca": "cozinha_quentes",
  "sev": 3,
  "n": 8,
  "unblock": 8,
  "until": 1156
}
```

`unblock:8` (todos os 8 pedidos têm bancada única) produziu, no `DECISAO.decidir()` real,
a ação "**Priorizar Quentes**" com o texto "**8 pedidos saem na hora se Quentes
liberar**" — visível na captura real (`03_foco_desktop.png`), não fabricado.

## 6. Determinismo — três repetições

Cada cenário foi executado **3 vezes** (`node
tools/live/simulator/investigacao_volume/executar_investigacao.js`), cada execução
recalculando snapshot do núcleo + timeline completa do motor real.

| Cenário | Hash snapshot (3×) | Hash timeline (3×) | Idêntico? |
|---|---|---|---|
| Ambiente | `e27ff9d88ba7` em todas as 3 | `87604f9777f4` em todas as 3 | **sim** |
| Foco | `5a3c1aff8fba` em todas as 3 | `437dc0d0c3b0` em todas as 3 | **sim** |

Evidência completa (série minuto a minuto, `sits`, `sess.active.sit`) em
`evidencia-motor-real.json`, no pacote de revisão.

## 7. Ausência de força manual (verificação automatizada, não só leitura)

`executar_investigacao.js` varre os arquivos desta investigação por padrões de
atribuição direta de modo (`mode = "..."`, nunca `mode ===`), atribuição direta de
`sess.active`/`sess.pending`, e qualquer termo `forceMode`/`forceFocus`/equivalente.
**Zero ocorrências** — `mode`, `foco` e `sess.active.sit` só são **lidos**, nunca
escritos, fora de `motor.js` (intocado).

## 8. Suíte de testes e equivalência de campanha

- `node --test tests/live/*.test.js tests/live/simulator/*.test.js` → **173/173
  verdes**, nenhum teste alterado, removido ou enfraquecido.
- Campanha sintética de 30 dias (Fase 3B) reexecutada: hash
  `f5c27b872c3fe80079945c3512cfd0de4e520613f3001ebae53d4a27043bbf0d` — **idêntico** ao
  hash pós-F2-08/D4A. O núcleo, o adaptador e o motor não foram tocados; esta
  investigação é puramente aditiva.

## 9. Capturas reais (interface V1 real, sem edição de CSS/JS)

| Arquivo | Conteúdo confirmado |
|---|---|
| `01_ambiente_desktop.png` | Grade de 6 cartões (Caixa/Sushi/Quentes/Cozinha/Conferência/Motoboy); Sushi "Atenção · Duplas com pedidos acumulando · Pressão 60%"; Quentes "Atenção · Enrolados quentes puxando espera · Pressão 67%" |
| `02_ambiente_mobile.png` | Mesmo conteúdo, layout reempilhado corretamente, sem corte de texto |
| `03_foco_desktop.png` | Eco tipográfico "Quentes em risco, pedidos acumulando"; cartão soberano; evidências reais (#SIM-IFOOD-0001/0002/0003, "Beef com Nirá", tempos de espera); "Por que agora" com "8 pedidos saem na hora se Quentes liberar"; pílula "Priorizar Quentes" |
| `04_foco_mobile.png` | Mesmo conteúdo, composição mobile completa |

Nenhuma captura foi forçada por rótulo — todas nascem de `linha.value = <índice
correspondente ao minuto>` + evento `input`, exatamente a mesma interação que um usuário
faria arrastando o slider de replay já existente. `app-v1/app.js` e `app-v1/style.css`
têm **diff zero** nesta branch.

## 10. Limitação visual encontrada (registrada, não corrigida nesta missão)

O cartão "Quentes" do mapa de Ambiente só lê a praça `enrolados_quentes` (via
`piorPraca(R,["enrolados_quentes"])` em `app.js`), enquanto `cozinha_quentes` — que a
`DISPLAY` do motor também rotula "Quentes" — fica de fora dessa leitura; o cartão
"Cozinha" é hardcoded `"Em validação"` e nunca reflete carga real. Isso significa que a
sobrecarga real de `cozinha_quentes` (5 pedidos, sev1, presente nesta investigação) **não
aparece** em nenhum cartão do mapa — só `duplas`/`enrolados` (via Sushi) e
`enrolados_quentes` (via Quentes) ficaram visíveis nas capturas. Esta é uma
inconsistência **pré-existente** de mapeamento entre praças do motor e áreas da
interface (já registrada em memória de projeto anterior a esta missão — colisão de nome
"Quentes" entre `cozinha_quentes` e `enrolados_quentes`), não um efeito colateral desta
investigação. Registrado aqui; **não corrigido**, conforme instrução.

## 11. Ausência de PII

Nenhum nome de cliente, telefone, endereço, e-mail ou identificador real foi usado.
Identificadores de pedido: `SIM-IFOOD-*`/`SIM-INTERNO-*`/`SIM-JOB-*` (sintéticos,
mesma allowlist certificada da 3A). Nomes de item: nomes **públicos** do cardápio (ex.:
"Beef com Nirá", "By Luizinho Especial") — dado de conhecimento do produto, não dado de
cliente. Data/hora: `2026-09-15`, futura e fictícia, nunca usada em nenhuma outra
campanha/cenário deste programa.

## 12. Confirmação de regras cognitivas intocadas

`git status --short` na raiz do repositório mostra **somente** os arquivos novos desta
investigação (`tools/live/interface/servir_investigacao_volume.js` e
`tools/live/simulator/investigacao_volume/**`) — nenhuma modificação em `motor.js`,
`decisao.js`, `src/live/**`, `app-v1/**`, `package.json`, `package-lock.json`, dados
históricos, cardápio (só leitura), seed ou `data/**`. `BASELINE`, `TEMPO_PRACA`,
`FLOORS` — todos os limiares — permanecem exatamente os valores originais do motor;
esta investigação só **leu** esses valores para desenhar volume compatível.

## 13. Recomendação

- **Cenário Ambiente:** **apto para demonstração**. Determinístico, motor real, nunca
  cruza para Foco, captura desktop+mobile validada visualmente.
- **Cenário Foco:** **apto para demonstração**. Determinístico, motor real,
  `sess.active.sit` correto e estável, captura desktop+mobile validada visualmente.
- Nenhum dos dois cenários precisou de ajuste após a correção dos dois achados de
  implementação (§2) — ambos ficaram estáveis nas 3 repetições sem necessidade de nova
  iteração.
