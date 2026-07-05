# Plano de Entrega — DeliveryOS V1 (Núcleo de Atenção Operacional)

> Trilho oficial para entregar a V1 de forma acelerada, com escopo fechado, gates claros e preservação
> da essência. Criado em 05/07/2026 sobre o commit `72561c9`. Princípio central: **acelerar execução,
> não acelerar decisões ruins.** A V1 deve ser confiável antes de ser completa — impressionar por
> clareza, confiança e foco, nunca por quantidade.
>
> Hierarquia: em conflito, vencem `docs/Constituicao.md` → `docs/Leis_Fundamentais.md` →
> `docs/Manifesto_Produto_Design.md` → este plano. As 3 imagens de moodboard recebidas na missão que
> criou este plano são **apenas direção sensorial** (ver §4) — nunca layout, nunca componente, nunca
> autoridade sobre os documentos.

---

## 0. Estado real no momento deste plano (fato, não hipótese)

- HEAD = `origin/main` = `72561c9`. Working tree contém, **não commitado, aguardando autorização**:
  a implementação da correção Motor × Decisão (`src/perfil-delivery/decisao.js`,
  `tools/autoteste_8pracas.js`, `tools/auditar_divergencia_motor_decisao.js`) e o relatório
  pós-correção (`docs/Relatorio_Pos_Correcao_Motor_Decisao.md`).
- Ou seja: **as Missões 1 e 2 deste plano já foram executadas** (05/07/2026). Resultado provado:
  troca proibida de causa raiz 82 (30,8%) → **0** nas 12 janelas reais; `conferencia` 71/72→72/72;
  `saida` 7/7→7/7; nota do autoteste 8,1/10 inalterada. O que falta delas é só o commit.
- A correção só está ativa onde o chamador passa `active: sess.active`. O protótipo
  (`prototipos/parados-agora/`) e os replays **ainda chamam sem** — intencional (fora do escopo
  autorizado). A superfície da V1 (Missões 3-4) nasce já ligada à correção.
- Não existe fonte contínua de dados do iFood (pedido em negociação —
  `docs/Mensagem_iFood_Pedido_Fonte_Continua.md`). Consequência honesta para a V1: modo sombra e
  Relatório de Turno rodam sobre **export pós-turno**, não ao vivo. Isso não é falha da V1 — é a
  verdade do dado disponível, e deve ser declarado em qualquer relatório gerado.

---

## 1. Definição da V1

**DeliveryOS V1 — Núcleo de Atenção Operacional.**

Um núcleo utilizável, testável e confiável que:

- protege atenção humana (1 foco por vez, debounce, cooldown, teto);
- **nunca troca a causa raiz do Foco** (correção Motor × Decisão ativa em toda superfície da V1);
- não inventa inteligência — mostra uma ação dominante quando houver segurança, e cai para
  `buildFoco()` puro quando não houver;
- declara o que sabe, o que suspeita e o que não sabe (confiança pela fonte, nunca fingida);
- funciona primeiro como **versão interna/sombra**, não como produto final.

A V1 **não** resolve o DeliveryOS inteiro. Ela **prova o núcleo**.

## 2. Escopo — o que ENTRA

1. **Correção Motor × Decisão** — restrição de escopo mínima já documentada e implementada (ver §0).
2. **Auditoria pós-correção** — já executada e documentada (`docs/Relatorio_Pos_Correcao_Motor_Decisao.md`).
3. **Estado cognitivo mínimo** — Calmo / Ambiente / Foco como consequência direta de
   `MOTOR.step().mode` + `DECISAO.decidir()` existentes. Nenhuma "Consciência" como serviço.
4. **Interface mobile/PWA mínima** — primeira experiência utilizável no navegador do celular.
   (Nesta missão de plano: só direção registrada, zero UI criada.)
5. **Modo sombra** — registrar o que o DeliveryOS teria mostrado (foco ativo, ação exibida, queda
   para foco puro, horário, praça, tipo, confiança, origem do dado), sem exigir uso pela equipe.
6. **Relatório de Turno V1** — relatório simples de fim de turno, separando fatos / hipóteses /
   desconhecidos. Não é Memória Operacional e não pode se apresentar como tal.
7. **Preparação para correções em lote** — `docs/Correcoes_V1_DeliveryOS.md` estruturado e vazio,
   pronto para receber o teste do César.

## 3. Escopo — o que NÃO ENTRA

Memória Operacional completa · Resolução sofisticada · aprendizado automático real · IA generativa
operacional · design visual final · dashboard · estoque · SAC completo · motoboy completo · ranking
de equipe · módulo de funcionário · integração perfeita com iFood · candidatos novos de decisão ·
tuning de baseline · correção de `firedAt` (salvo missão específica autorizada) · qualquer vigilância
ou avaliação de pessoas.

Regra prática: se algo não é essencial para provar o núcleo, **vai para pós-V1** — não entra "porque
já estamos aqui".

## 4. Direção visual da V1 (registro do moodboard — não é spec de UI)

O que a V1 deve **absorver** das 3 imagens de referência:

- Da imagem mobile de Foco (referência principal): mobile-first; pouco ruído; **uma ação dominante**;
  decisão clara; tipografia forte com respiro; sensação premium; "uma decisão calma dentro do bolso".
- Da imagem "Por que agora" (referência conceitual): o Foco explica **brevemente** por que a atenção
  humana está sendo solicitada — isso já existe no vocabulário do produto (AÇÃO → por quê → primeiro
  olhar → impacto → confiança-sussurro, `docs/Camada_Decisao_Operacional.md`). Nada de tela desktop
  pesada, nada de coluna lateral de justificativas.
- Da imagem "Em fluxo" (referência só para Calmo/Ambiente): sensação de operação sob controle, calma
  e fluxo. **Não** virar timer, cronômetro, app de sessão/fitness/meditação. O Calmo do DeliveryOS é
  o pulso vivo já definido no Manifesto — presença serena, não contagem de minutos.

A futura interface da V1 deve ser: clara · limpa · premium · calma · mobile-first · funcional no
navegador do celular · uma ação dominante · explicação curta do porquê · foco puro quando não houver
ação segura · Calmo como estado padrão · Ambiente como clima · Foco como interrupção justificada.

**Proibido:** copiar layout ou componentes das imagens · dashboard · neon · futurismo · interface
gamer · poluição · excesso de cards · gráficos decorativos · SaaS genérico · visual sem lógica
operacional · "em fluxo" como cronômetro · DeliveryOS como app de sessão.

Se as imagens conflitarem com os documentos, **os documentos vencem**. A estética serve à operação; a
interface parece simples porque pensou profundamente antes.

## 5. Ordem das missões

1. Implementação mínima da correção Motor × Decisão — **executada, aguardando commit**.
2. Auditoria pós-correção — **executada, aguardando commit**.
3. Estado cognitivo mínimo.
4. Interface mobile/PWA mínima.
5. Modo sombra.
6. Relatório de Turno V1.
7. Pacote de revisão e preparação para correções em lote.

Uma missão por vez. Nenhuma missão começa antes do gate de saída da anterior. Nenhuma missão abre
frente que pertence a outra.

## 6. Estrutura de cada missão

### Missão 1 — Correção Motor × Decisão (executada)

- **Objetivo:** impedir que a ação exibida troque a causa raiz do foco ativo.
- **Escopo:** filtro de escopo em `decisao.js` (`opts.active`); fallback `null` → `buildFoco()` puro;
  metadado de alvo nos candidatos existentes.
- **Gate de saída:** troca proibida ~0 na auditoria; `conferencia`/`saida` não pioram; nota do
  autoteste não piora; nenhum score/confiança alterado. **Status: gate cumprido** (ver
  `docs/Relatorio_Pos_Correcao_Motor_Decisao.md`). Falta: autorização de commit do César.
- **Critério de parada:** qualquer necessidade de tocar score, confiança ou criar candidato → parar.
- **Arquivos:** `src/perfil-delivery/decisao.js`, `tools/autoteste_8pracas.js`,
  `tools/auditar_divergencia_motor_decisao.js`.
- **Testes obrigatórios:** `npm run build` · `npm run typecheck` · `node tools/autoteste_8pracas.js` ·
  `node tools/auditar_divergencia_motor_decisao.js`.
- **Não pode alterar:** `motor.js`, seed, baseline, parser, replays, protótipo, `buildFoco()`,
  fórmulas de score/confiança, `conferencia`, `saida`, `firedAt`.

### Missão 2 — Auditoria pós-correção (executada)

- **Objetivo:** provar a correção com números, antes/depois, nas mesmas 12 janelas.
- **Escopo:** re-rodar auditoria; registrar relatório com exemplos corrigidos.
- **Gate de saída:** relatório existente com antes/depois e exemplos concretos. **Status: cumprido**
  (troca proibida 82→0; três exemplos da medição verificados caso a caso).
- **Critério de parada:** se a auditoria mostrasse regressão em `conferencia`/`saida` → reverter, não
  remendar.
- **Arquivos:** `docs/Relatorio_Pos_Correcao_Motor_Decisao.md`.
- **Testes obrigatórios:** os mesmos da Missão 1.
- **Não pode alterar:** código de produção (auditoria só lê).

### Missão 3 — Estado cognitivo mínimo

- **Objetivo:** formalizar o contrato de leitura Calmo/Ambiente/Foco para a superfície da V1 — um
  view-model único e documentado, derivado do que `step()`/`decidir()` **já retornam** (`mode`,
  `foco`, `ambList`, `emand`, rec com `active` passado).
- **Escopo:** definir (em doc + módulo pequeno de leitura, se necessário) o que cada estado expõe e
  esconde, seguindo a tabela do `docs/Modelo_Operacional_Consciencia_DeliveryOS.md` §10: Calmo = pulso
  só; Ambiente = até 2 rótulos + severidade, sem ação; Foco = ação dominante (escopo restrito) ou
  `buildFoco()` puro + sussurro de confiança. É **aqui** que a chamada com `active: sess.active` vira
  regra obrigatória de toda superfície nova.
- **Gate de saída:** contrato documentado; nenhum estado novo inventado; nenhum campo que exponha
  score/ranking/`suspeitos` ao operador; demonstração em replay de que os 3 estados são reproduzíveis.
- **Critério de parada:** se o contrato exigir mudar `motor.js`/`decisao.js` além do já feito → parar
  e trazer decisão ao César.
- **Arquivos prováveis:** `docs/` (contrato) + eventualmente 1 módulo novo de view-model em
  `src/perfil-delivery/` (sem tocar motor/decisão).
- **Testes obrigatórios:** build · typecheck · autoteste · auditoria de divergência (sem regressão).
- **Não pode alterar:** `motor.js`, `decisao.js` (além do já commitado), seed, baseline, protótipo
  antigo, fórmulas.

### Missão 4 — Interface mobile/PWA mínima

- **Objetivo:** primeira experiência navegável no celular expressando os 3 estados, com uma ação
  dominante ou foco puro — direção do §4.
- **Escopo:** PWA mínima (HTML/CSS/JS servível estático), read-only, alimentada por replay/export
  (não há fonte contínua — declarar isso na própria tela quando rodando sobre dado histórico).
  Sempre chama `decidir()` com `active`.
- **Gate de saída:** navegável no navegador do celular; Calmo/Ambiente/Foco visíveis conforme
  contrato da Missão 3; foco puro aparece quando `decidir()` retorna `null`; confiança-sussurro
  presente; zero dashboard, zero lista de pedidos.
- **Critério de parada:** qualquer tela que vire lista/grid/KPI → parar e redesenhar; qualquer
  necessidade de novo endpoint/servidor complexo → parar (V1 é estática/simples).
- **Arquivos prováveis:** diretório novo (ex.: `app-v1/` ou similar — decidir na missão), sem tocar
  `prototipos/parados-agora/` (vira referência histórica, não é evoluído).
- **Testes obrigatórios:** build · typecheck · autoteste · auditoria; verificação manual dos 3
  estados + queda para foco puro em janela real conhecida (ex.: casos do relatório pós-correção).
- **Não pode alterar:** motor, decisão, seed, baseline, parser, replays, protótipo antigo.

### Missão 5 — Modo sombra

- **Objetivo:** registrar o que o DeliveryOS teria mostrado num turno, sem exigir uso pela equipe.
- **Escopo:** ferramenta (em `tools/`) que roda uma janela (export pós-turno) e grava, por onset de
  foco: horário, chave/kind/praça/id da tensão, ação exibida (ou queda para foco puro), confiança,
  origem do dado (real/sintética). Saída em `data/generated/` (fora do Git).
- **Gate de saída:** um turno real replayado gera registro completo e legível; o registro distingue
  ação exibida × foco puro; nenhum campo inventado (dado ausente = `null`).
- **Critério de parada:** se começar a virar "Resolução formal" ou "Memória Operacional" → parar
  (fora da V1 por decisão explícita).
- **Arquivos prováveis:** 1 script novo em `tools/` (pode reaproveitar a espinha de
  `tools/auditar_divergencia_motor_decisao.js`).
- **Testes obrigatórios:** build · typecheck · rodar sobre ≥1 janela real das 12 validadas e conferir
  contagens contra a auditoria existente.
- **Não pode alterar:** motor, decisão, seed, baseline, parser.

### Missão 6 — Relatório de Turno V1

- **Objetivo:** transformar o registro do modo sombra em relatório simples de fim de turno.
- **Escopo:** gerador (em `tools/`) que produz um markdown por turno com: fatos observados ·
  hipóteses · desconhecidos · focos gerados · ações exibidas · quedas para foco puro · picos de
  atenção · riscos percebidos · **limitações do dado** (composição sintética? export parcial? campos
  ausentes?). Nome oficial: **Relatório de Turno V1**.
- **Gate de saída:** relatório de 1 turno real gerado; seções de fato/hipótese/desconhecido nunca
  misturadas; o próprio relatório declara não ser Memória Operacional.
- **Critério de parada:** se o relatório começar a inferir causalidade ("a ação funcionou") ou a
  acumular aprendizado entre turnos → parar (isso é Memória Operacional, pós-V1).
- **Arquivos prováveis:** 1 script em `tools/`; saída em `data/generated/` (fora do Git) ou `docs/`
  apenas se o César autorizar versionamento de um exemplo.
- **Testes obrigatórios:** build · typecheck · geração sobre ≥1 janela real; conferência manual
  contra o registro sombra.
- **Não pode alterar:** motor, decisão, seed, baseline, parser, modo sombra (só consome).

### Missão 7 — Pacote de revisão e correções em lote

- **Objetivo:** fechar a V1 para teste interno e preparar o ciclo de correção.
- **Escopo:** criar `docs/Correcoes_V1_DeliveryOS.md` estruturado e **vazio** (seções: bugs ·
  problemas de interface · ajustes de texto · inconsistências · pontos confusos · melhorias antes do
  teste real — cada entrada com: onde, o que, evidência, gravidade); revisão final de todos os gates;
  `git status` limpo após commits autorizados.
- **Gate de saída:** critérios do §8 todos verificados e listados com evidência; documento de
  correções pronto para o César preencher.
- **Critério de parada:** nenhuma correção "aproveitando a passagem" — achados novos vão para o
  documento de correções, não para o código.
- **Arquivos prováveis:** `docs/Correcoes_V1_DeliveryOS.md`, atualização de
  `docs/Estado_Atual_DeliveryOS.md`.
- **Testes obrigatórios:** bateria completa (build · typecheck · demo · ingest · autoteste ·
  auditoria · verificar:cardapio).
- **Não pode alterar:** qualquer código (missão de revisão e documentação).

## 7. Gates obrigatórios (valem para TODAS as missões)

1. Nenhuma troca proibida de causa raiz pode permanecer sem explicação.
2. `conferencia` e `saida` não podem piorar (medição: são saudáveis).
3. Nenhum candidato novo sem decisão arquitetural prévia e aprovada.
4. Nenhum tuning de baseline na V1.
5. Nenhuma interface pode virar dashboard (teto de 2 ambientes, 1 foco, zero listas/KPIs).
6. Nenhum relatório pode se passar por Memória Operacional completa.
7. Nenhuma hipótese tratada como fato — rotular sempre (real × sintético × inferido × ausente).
8. Nenhum dado bruto ou gerado entra no Git (`docs/Politica_Dados.md`).
9. Toda missão termina com `git status`.
10. Nenhum commit sem autorização do César.
11. Toda chamada nova a `decidir()` passa `active: sess.active` — chamador que não passa é bug de V1.
12. Mudança grande demais para explicar em um parágrafo de relatório = mudança grande demais.

## 8. Critérios de sucesso da V1 (pronta para teste interno quando TODOS forem verdade)

- Motor × Decisão alinhados (troca proibida ≈ 0, auditoria re-rodável).
- Auditoria pós-correção documentada.
- Calmo/Ambiente/Foco representados de forma mínima, conforme contrato da Missão 3.
- Interface mobile/PWA navegável no celular.
- Foco mostra uma ação dominante **ou** foco puro — nunca ação de outra causa raiz.
- Modo sombra registra o que teria sido mostrado.
- Relatório de Turno V1 existe e separa fato/hipótese/desconhecido.
- Não há dashboard em nenhuma superfície.
- Não houve expansão de escopo (nada do §3 entrou).
- O sistema declara incertezas (confiança-sussurro; limitações do dado no relatório).
- Working tree limpo (tudo commitado com autorização).
- `docs/Correcoes_V1_DeliveryOS.md` preparado.

## 9. Processo de correção em lote

1. César testa a V1 (interface + relatórios sobre turnos reais).
2. César registra tudo em `docs/Correcoes_V1_DeliveryOS.md` (bugs, interface, textos, inconsistências,
   confusões, melhorias).
3. Claude analisa o documento inteiro **antes** de tocar código — agrupa, identifica causa comum,
   sinaliza o que é correção × o que é mudança de escopo (mudança de escopo não entra no lote).
4. Claude corrige em lote, sem alterar a essência: mesmos gates do §7, mesma bateria de testes,
   relatório do lote (o que mudou, por quê, prova).
5. Nova rodada de testes do César.
6. Só depois a V1 entra em teste operacional (sombra assistida na loja).

## 10. Riscos de aceleração e proteções

| Risco | Proteção prática |
|---|---|
| Claude abrir frentes demais | Uma missão por vez (§5); gate de saída antes da próxima; achados novos vão para `Correcoes_V1` ou pós-V1, nunca para o código da missão atual |
| Interface virar dashboard | Gate 5; contrato da Missão 3 define o que cada estado **esconde**; critério de parada da Missão 4 (lista/grid/KPI = parar) |
| V1 tentar ser produto final | Definição §1 ("versão interna/sombra"); §3 fechado; Relatório de Turno declara limitações |
| Memória implementada cedo demais | Fora do escopo (§3); critério de parada das Missões 5-6; medição de sinal continua pendente (Red Team, Missão 3 recomendada lá) |
| Resolução virar workflow pesado | Fora do escopo (§3); modo sombra registra onsets, não ciclos de resolução |
| IA inventar inteligência | Gate 3 e 7; princípio "se não sabe agir com segurança, mostra `buildFoco()` puro"; Lei 11 |
| Correção Motor × Decisão virar tuning | Já entregue sem tocar score/confiança — qualquer ajuste futuro de score é missão própria com decisão arquitetural prévia |
| Design virar distração | Missões 3-4 têm gate de contrato antes de pixel; moodboard é direção, não tarefa; régua do Manifesto |
| Código crescer sem gates | Gate 12; bateria de testes obrigatória por missão; `git status`/`git diff` antes e depois (CLAUDE.md §10) |
| Projeto perder sua tese | Teste único das Leis ("isso respeita nossas leis?"); frase-guia: foco é raro, ambiente é clima, calmo é saúde |
| Fable/UltraCode aplicar mudanças grandes demais | §11 abaixo; mudanças pequenas/localizadas/reversíveis; relatório obrigatório por mudança |
| Imagens virarem layout literal | §4: registradas como direção sensorial; proibições explícitas; documentos vencem |

## 11. Como usar Fable 5 / UltraCode com responsabilidade

- Usar para **execução pesada** (implementação, testes, auditorias em lote) — nunca para definir
  escopo sozinho.
- Sempre trabalhar a partir de documentos versionados (este plano + docs da missão) — nunca de
  memória de conversa.
- Sempre obedecer os gates do §7 — gate quebrado invalida a entrega, mesmo que "funcione".
- Sempre validar com a bateria de testes da missão antes de reportar concluído.
- Nunca aceitar mudança ampla sem relatório (o que mudou, arquivos, prova, o que não foi tocado).
- Preferir mudanças pequenas, localizadas e facilmente reversíveis — a correção Motor × Decisão
  (~40 linhas, 1 arquivo de produção) é a régua de tamanho.
- Na dúvida, **parar e pedir decisão** — não escolher no lugar do César.
- Nunca deixar a ferramenta transformar o DeliveryOS em dashboard, SaaS genérico ou IA genérica —
  se a saída "parece um SaaS", ela está errada por definição (CLAUDE.md §1: dizer isso é função).

## 12. Próxima missão recomendada

**Autorizar e commitar as Missões 1-2** (correção + relatório pós-correção, já no working tree) —
é a menor ação que destrava todo o resto do trilho. Em seguida, Missão 3 (Estado cognitivo mínimo),
que é barata, sem risco de código e define o contrato que a interface da Missão 4 vai obedecer.
