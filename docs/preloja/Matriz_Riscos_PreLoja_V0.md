# Matriz de Riscos Pré-Loja — V0

> Fase 1 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `a441bc7`.
> Riscos do programa inteiro (Fases 2-8), com probabilidade, impacto, mitigação e dono.
> Donos: **Fable** (este programa) · **Loja** (só a inspeção real resolve) · **César** (decisão de
> produto/operação) · **Grok** (auditoria paralela na branch `audit/preloja-grok`).

| # | Risco | Prob. | Impacto | Mitigação | Dono |
|---|---|---|---|---|---|
| 1 | Construir o núcleo com um contrato de eventos que a fonte real depois não consegue preencher (ex.: fila de impressão não entrega texto legível) | Média | Alto — retrabalho do contrato | Contrato exige só o que JÁ foi visto na comanda fotografada (sequência, iFood, itens, horário); campos extras são opcionais; adaptadores são a única peça pós-loja | Fable / Loja |
| 2 | Simulador "passa" mas não representa a realidade (cenários bonitos demais) | Média | Alto — falsa confiança | Cenários incluem obrigatoriamente falha, corrupção, fora-de-ordem, fonte caída; relatório do runner repete que sintético não prova qualidade operacional; Grok audita os cenários | Fable / Grok |
| 3 | Flag OFF não ser realmente idêntica ao comportamento atual (regressão silenciosa na interface) | Baixa-média | Alto — quebra a V1 aprovada | Gate da Fase 4 exige comparação explícita com o comportamento atual; bateria histórica em toda fase; rollback = desligar flag | Fable |
| 4 | Deduplicação errada: engolir pedido legítimo (colisão de código curto no dia) ou duplicar pedido reimpresso | Baixa | Alto — pedido some ou dobra na tela | Chave primária = `pedido_interno` (10 dígitos, único); curto só para casamento com status; **colisão/ambiguidade vira estado `conflict` (Addendum §7) — não consolida, não vai ao motor, proximidade temporal NUNCA casa sozinha**; testes dedicados | Fable |
| 5 | Pedido parcial parecer completo (status sem comanda alimentando praça, ou comanda sem status parecendo atual) | Média | Alto — mente para o operador | `parcial: true` estrutural; sem itens ⇒ não entra em praça; regras com teste unitário próprio | Fable |
| 6 | Dados vivos (mesmo simulados) vazarem para o Git | Baixa | Médio-alto — viola Política de Dados | **`.gitignore` já cobre `/data/live/`, `/runtime/`, `*.live.jsonl`, `*.runtime.jsonl` — FEITO e provado no commit `73272bc` (Addendum §6), não é mais pendência de fase**; guarda F3-01 em `src/live/persistir.js` rejeita path improvisado dentro do repo; verificação `git status` em todo checkpoint; pacote de revisão fica FORA do Git | Fable |
| 7 | Motor de embalagens adivinhar alias e classificar errado (ex.: Fish Katsu × Chickenkatsu) | Média | Médio — sinal errado na tela | **Fase 6 SUSPENSA atrás do GATE EMBALAGENS VALIDADO PELO CÉSAR (Addendum §8) — fora do caminho crítico**; tabela de alias fechada (só o validado); desconhecido ⇒ `incerto` + pendência | Fable / César |
| 8 | `npm ci` no worktree trazer surpresa (lock desatualizado, script pós-install) | Baixa | Médio | `npm ci` reproduz exatamente o lock já commitado (mesmo do repo principal que funciona); rodar só com autorização; conferir `git status` depois | Fable / César |
| 9 | Snapshot não reconstruir igual após reinício (estado escondido fora do log) | Baixa-média | Alto — confiança do produto | Regra de projeto: TODO estado deriva do log; teste de replay idempotente obrigatório na Fase 2 e cenário de reinício na Fase 3 | Fable |
| 10 | Windows da loja diferente do Windows de desenvolvimento (firewall, antivírus, permissões, porta ocupada) | Média | Médio — atraso no piloto | Healthcheck da Fase 7 verifica cada pré-condição e reporta em linguagem simples; pendências da loja listadas em doc próprio na Fase 8 | Loja / César |
| 11 | Escopo crescer dentro das fases (dashboard, estados novos, "melhorias" não pedidas) | Média | Médio — programa não termina | Checkpoint duro por fase; critérios de parada escritos no Plano de Execução; Grok audita aderência ao escopo | Fable / Grok / César |
| 12 | As duas branches (Fable/Grok) divergirem demais da main durante o programa (main recebe hotfixes) | Baixa | Médio — conflito futuro de merge | main está estável e não recebe desenvolvimento durante o programa (regra do César); se main mudar, parar e reportar antes de rebasear | César |
| 13 | Correção manual à caneta na comanda (limitação permanente já documentada) ser esquecida na tela viva | Média | Médio — expectativa errada da equipe | O snapshot vivo herda a limitação declarada; a interface (Fase 4) mantém o aviso de limitação onde couber; documentado de novo na Fase 8 | Fable / César |
| 14 | Latência do poll da interface esconder pedido novo por segundos demais no pico | Baixa-média | Baixo-médio | Poll curto e configurável; medição de latência incluída no relatório do simulador (Fase 3) e no healthcheck (Fase 7) | Fable |
| 15 | Fadiga de autorização: 7 checkpoints, cada um esperando o César — programa esfria | Média | Médio | Relatórios curtos e objetivos por fase; pacote de revisão pronto para conferência rápida; fases pequenas o bastante para autorização no mesmo dia | César / Fable |
| 16 | Recomendação de ação com fonte de status congelada/vencida (staleness) — `confComp` NÃO cobre isso (achado F1-01 do Grok) | Média | Alto — Foco manda agir com dado morto | **Gate de staleness independente (Addendum §4), ANTES do cálculo de recomendação**; matriz status×composição; teste obrigatório na F2/F5 (fonte vencida ⇒ sem ação dominante nova); limiares calibrados só na Fase Sombra | Fable |
| 17 | Automação "só para testar" clicar em ação real do Gestor iFood (pronto/cancelar/chat) | Baixa | **Crítico** — ação operacional indevida na loja | **Contrato somente-leitura inviolável (Addendum §11) em todos os docs**; programa não contém API de clique; inspeção DOM é manual (F12); interação futura exige nova missão autorizada | Fable / César |
| 18 | Gates declarados "aprovados" sem execução real (herança de relatório anterior) | Média | Alto — falsa confiança em regressão | **Política de evidência (Addendum §12)**: G1 sempre executável; G2 com `SKIP com motivo` quando ambiente não permitir; nunca nota por herança | Fable / Grok |

## Riscos aceitos conscientemente (não mitigados neste programa)

- **Correção manual à caneta não detectável** — limitação permanente confirmada; declarada, não
  resolvida (não existe fonte digital para ela).
- **Adaptadores reais indefinidos até a inspeção** — o programa foi desenhado exatamente em volta
  dessa incerteza; o custo é a possibilidade de ajuste fino no contrato (risco 1).
- **Nota/qualidade operacional do motor não melhora aqui** — este programa é encanamento e
  preparação; o cérebro não é tocado, então nenhuma métrica operacional muda (por design).
