# Plano de Execução Pré-Loja — V0

> Fase 1 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `a441bc7`.
> Trilho de execução das Fases 2-8, com entregáveis, testes, gates e critérios de parada por fase.
> Regra de checkpoint (do programa, repetida aqui para não se perder): **uma fase por vez → testes →
> commit exclusivo → push só em `feature/preloja-fable` → pacote de revisão fora do Git → relatório
> → PARAR → aguardar "AUTORIZO FASE N"**. `main` nunca é tocada; merge não existe neste programa.
>
> **CORRIGIDO PÓS-REVISÃO DO GROK:** revisado pela auditoria adversarial (F1-01 a F1-12) e
> corrigido pelo `docs/preloja/Addendum_PreRequisitos_Fase2_V0.md` — em conflito, **o Addendum
> vence**. Mudanças estruturais: Fase 6 SUSPENSA fora do caminho crítico (§ correspondente);
> gates separados em G1/G2 com política de evidência (Addendum §12); contrato de eventos da Fase 2
> é o do Addendum §5; conflitos de casamento seguem o Addendum §7.

---

## Pré-requisito técnico das Fases 2+ (decidido na Fase 1)

O worktree `deliveryos-fable` **não tem `node_modules`** (worktrees não compartilham). As Fases 2+
precisam ao menos de `tsc` (build/typecheck) e `xlsx` (ferramentas existentes). **Pedido de
autorização registrado no relatório da Fase 1:** rodar `npm ci` neste worktree — instala EXATAMENTE
o que está em `package-lock.json` (nenhuma dependência nova, nenhuma atualização). Sem isso, as
fases seguintes não conseguem rodar a bateria de regressão.

Testes unitários novos: **`node:test` nativo do Node v24** (`node --test`) — zero dependência.

## Fase 2 — Núcleo de fonte viva (`src/live/`)

**Entregáveis:** módulos `contrato/normalizar/dedup/consolidar/persistir/snapshot/qualidade` +
**gate de staleness** (Addendum §4 — peça própria, anterior a qualquer recomendação) + testes
unitários (`src/live/__tests__/`, via `node:test`). O contrato de eventos implementado é o
**envelope completo do Addendum §5** (schema_version, event_id, idempotency_key, correlation,
quality) — o envelope simples da Arquitetura §3 original está revogado. A linha do `.gitignore`
**já foi feita e provada nesta missão corretiva** (Addendum §6) — a Fase 2 só re-verifica.
**Eventos:** os 8 mínimos do programa (`comanda_impressa`, `status_ifood`, `pedido_cancelado`,
`pedido_reimpresso`, `pedido_alterado`, `fonte_conectada`, `fonte_desconectada`, `pedido_vivo` —
semânticas no Addendum §5/§13).
**Casos obrigatórios com teste:** status sem comanda · comanda sem status · reimpressão (hash
idêntico e **divergente**) · duplicidade · cancelamento · fora de ordem · atrasado · parcial ·
**colisão de curto ⇒ `conflict` (não consolida, não vai ao motor)** · **staleness ⇒ sem ação
dominante nova** · item desconhecido · linha JSONL inválida · arquivo truncado · reinício/replay
idempotente · evento sem `schema_version` ⇒ quarentena.
**Gates de saída (política de evidência do Addendum §12):**
- **G1 (sempre):** `node --test src/live/` verde — obrigatório, sem exceção.
- **G2 (se ambiente permitir):** bateria histórica (build, typecheck, demo, cardápio, autoteste,
  auditoria) — executada e registrada **se** `node_modules` + `data/raw` presentes; senão
  **`SKIP com motivo` explícito** no relatório. Nunca declarar nota 8,1/troca 0 por herança.
- Motor/decisão intocados; nenhum dado vivo no Git (`git status` limpo de live).
**Critério de parada:** se o núcleo precisar mudar `motor.js`/`decisao.js` ou o shape
`NIGHT`/`rows` → parar e reportar (é sinal de erro de projeto, não de implementação).
**Commit:** `Cria nucleo modular de fonte viva local`.

## Fase 3 — Simulador e 30 dias (`tools/live/`)

**Entregáveis:** simuladores de comanda e status (adaptadores falsos que emitem eventos no
contrato) + gerador de cenários + 3 execuções: demonstração curta; uma noite; equivalente a 30
dias. Relatório impresso pelo runner com: eventos recebidos, consolidados, parciais, duplicatas,
cancelamentos, reconexões, falhas recuperadas/não recuperadas, latência simulada.
**Cenários obrigatórios:** noite normal · pico · simultâneos · comanda antes do status · status
antes da comanda · reimpressão · cancelamento · alterado · fonte de comanda caída · fonte de status
caída · reconexão · duplicado · fora de ordem · item desconhecido · internet oscilando · reinício ·
arquivo corrompido.
**Separação de dados:** saídas do simulador vão para `data/live/sim/` (fora do Git), com
`modo: "simulacao"` estampado em tudo. **Sintético prova resiliência do encanamento; sintético NÃO
prova qualidade operacional do motor** — frase repetida no relatório do runner.
**Gate de saída:** 30 dias simulados sem falha não-recuperada não-explicada; contadores fecham
(recebidos = consolidados + parciais + descartados-com-motivo).
**Commit:** `Adiciona simulador de operacao viva e falhas`.

## Fase 4 — Interface com fonte viva por flag

**Entregáveis:** `DELIVERYOS_LIVE_SIM` (padrão `false`) num módulo de config único; `servir_v1.js`
estendido (ou script irmão) expondo o snapshot vivo; `app-v1` com caminho de poll quando a flag
liga; estados técnicos discretos no rodapé (simulação / fonte parcial / fonte desconectada / último
dado confiável).
**Gate de saída (corrigido pelo achado F1-07):** flag OFF ⇒ zero regressão (comparação com
comportamento atual, mesmos JSONs históricos, mesma tela); flag ON ⇒ o caminho vivo **pode e deve
restringir a superfície** — Calmo + Ambiente + Foco + estado de saúde das fontes primeiro;
Mapa/Pressão/Sinais só entram quando as regras de fonte parcial (Addendum §10) estiverem
implementadas (fonte parcial/vencida não sustenta percentual com aparência precisa; ambiente sem
composição atual fica neutro/parcial; barra não usa dado velho como atual; Foco não nasce de fonte
vencida). Paridade pixel-a-pixel com todas as camadas experimentais **não é** critério de aceite —
honestidade sob parcialidade é. `decidir()` continua com `active`; nenhum estado cognitivo novo;
nenhum log técnico na tela.
**Critério de parada:** qualquer necessidade de tocar motor/decisão ou de criar estado cognitivo
novo → parar e reportar.
**Commit:** `Conecta fonte viva simulada a interface por feature flag`.

## Fase 5 — Offline e recuperação

**Entregáveis (corrigidos pelo achado F1-01):** o centro da fase é o **gate de staleness do
Addendum §4** — mecanismo próprio, anterior à recomendação, com a matriz de comportamento
status×composição e os campos `freshness_state`/`freshness_age_ms`/`last_trusted_at` (a premissa
antiga de que `confComp` cobriria isso está revogada). Mais: último snapshot confiável + idade do
dado na tela; reconexão automática dos adaptadores simulados; reconstrução pós-reinício (replay do
log); proteção contra arquivo incompleto; identificação de dado vencido; confiança parcial por
fonte caída. Limiares **configuráveis**, valores definitivos só com evidência da Fase Sombra.
Documento das dependências (o que funciona sem internet / com rede local / depende da comanda /
depende do iFood; quando continua, quando só observa, quando para de recomendar).
**Gate de saída:** cenários de queda/reconexão/reinício da Fase 3 re-rodados com os novos
mecanismos, todos recuperando; regressão histórica verde.
**Commit:** `Adiciona resiliencia offline e recuperacao local`.

## Fase 6 — Motor de embalagens (SUSPENSA — fora do caminho crítico; achado F1-05)

**ESTADO: SUSPENSA atrás do GATE EMBALAGENS VALIDADO PELO CÉSAR (Addendum §8).** A Fase 6 **não é
pré-requisito da fonte viva, não bloqueia o modo sombra e não entra no caminho crítico da Release
Candidate**. Ela só pode começar quando: (a) as 8 respostas do César (Embalagens §15) existirem;
(b) a matriz técnica reconciliada com o seed existir; (c) houver **autorização explícita separada**
— o "AUTORIZO FASE 6" genérico do checkpoint não basta sem o gate cumprido. Isso corrige o conflito
apontado pelo Grok com a §16 do documento oficial de embalagens ("só depois transformar a lógica em
função... nunca antes da validação").

Quando (e se) autorizada, o desenho permanece o já descrito: módulo isolado em `src/embalagens/`
(tabelas de categoria→caixa e sacola como dados); flag `DELIVERYOS_EMBALAGENS_V1` (padrão `false`);
saída sempre `{resultado, regra, motivo, confianca, pendencia}`; categoria não sabor; combinado
fechado; nome desconhecido ⇒ `incerto` + pendência (nunca regex ampla, nunca alias adivinhado);
testes por regra. **Mesmo se implementada cedo por decisão do César: somente módulo + testes, flag
OFF, ZERO fiação em Sinais de Fluxo/interface** — a flag desligada não pode alterar nada do
comportamento atual.
**Commit (quando autorizada):** `Implementa motor de embalagens V1 protegido por flag`.

## Fase 7 — Preparação para Windows (`tools/windows/`)

**Entregáveis:** iniciar/parar/pausa manuais; healthcheck (Node? porta? runtime gravável?); modo
sombra (grava sem servir tela); logs com rotação; reinício seguro; rollback (desligar flags + parar
processo, dados preservados); instruções de rede local para celular/tablet como telas. Documentos:
`Instalacao_Windows_V0.md`, `Rollback_Windows_V0.md`, `Operacao_Modo_Sombra_V0.md`,
`Dispositivos_Telas_Loja_V0.md` (em `docs/preloja/`).
**Regras:** sem serviço definitivo; sem instalação automática; administrador só se inevitável e
justificado (firewall), nunca silencioso.
**Gate de saída:** roteiro de sombra executável de ponta a ponta nesta máquina de desenvolvimento
(que também é Windows) com adaptadores simulados.
**Commit:** `Prepara execucao local e modo sombra no Windows`.

## Fase 8 — Release candidate pré-loja

**Entregáveis:** bateria total (histórica + viva + flags ON/OFF + 30 dias + scripts Windows +
interface nos dois modos; **embalagens só se a Fase 6 tiver sido autorizada e executada — senão
`N/A` declarado**); `Relatorio_Final_PreLoja_Fable_V0.md`, `Checklist_Release_Candidate_V0.md`,
`Pendencias_Inspecao_Real_V0.md` (em `docs/preloja/`).
**Confirmações obrigatórias (política de evidência do Addendum §12 — cada uma só é "aprovada" com
comando executado, ambiente disponível, saída registrada e hash correspondente; senão `N/A — não
executado (motivo)`):** troca proibida 0 · nota 8,1 não piorou · motor/decisão intocados ·
fonte histórica intacta · nenhum dado real commitado · nenhum PDF/imagem rastreado.
**Não criar** `release/preloja-rc1` — só recomendar se está pronto.
**Commit:** `Consolida release candidate pre-loja do DeliveryOS`.

## Pacote de revisão (toda fase)

Pasta `../deliveryos-review-packets/faseN-<slug>/` (fora de qualquer repositório Git), contendo:
`fase.patch` (diff completo da fase), `arquivos.txt`, `testes.txt` (saída dos testes),
`hashes.txt` (hash base + hash final), `riscos.txt`. Nunca commitado.

## Mapa de dependências entre fases (corrigido pelo achado F1-05)

```
CAMINHO CRÍTICO:  F1 (docs) → F2 (núcleo) → F3 (simulador) → F4 (interface+flag) → F5 (offline)
                                                                → F7 (windows) → F8 (RC)

ESTACIONADA:      F6 (embalagens) — SUSPENSA atrás do GATE EMBALAGENS VALIDADO PELO CÉSAR
                  (Addendum §8); não bloqueia nada do caminho crítico; F8 não depende dela.
```
