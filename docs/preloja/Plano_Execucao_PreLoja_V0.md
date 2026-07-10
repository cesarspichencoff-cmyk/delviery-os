# Plano de Execução Pré-Loja — V0

> Fase 1 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `a441bc7`.
> Trilho de execução das Fases 2-8, com entregáveis, testes, gates e critérios de parada por fase.
> Regra de checkpoint (do programa, repetida aqui para não se perder): **uma fase por vez → testes →
> commit exclusivo → push só em `feature/preloja-fable` → pacote de revisão fora do Git → relatório
> → PARAR → aguardar "AUTORIZO FASE N"**. `main` nunca é tocada; merge não existe neste programa.

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
testes unitários (`src/live/__tests__/`) + linha `data/live/*` no `.gitignore` + contrato de
eventos documentado (dentro de `docs/preloja/` ou docstring do `contrato.js`).
**Eventos:** os 8 mínimos do programa (`comanda_impressa`, `status_ifood`, `pedido_cancelado`,
`pedido_reimpresso`, `pedido_alterado`, `fonte_conectada`, `fonte_desconectada`, `pedido_vivo`).
**Casos obrigatórios com teste:** status sem comanda · comanda sem status · reimpressão ·
duplicidade · cancelamento · fora de ordem · atrasado · parcial · item desconhecido · linha JSONL
inválida · arquivo truncado · reinício/replay idempotente.
**Gate de saída:** `node --test src/live/` verde; bateria de regressão histórica verde (build,
typecheck, demo, cardápio, autoteste 8,1, auditoria troca proibida 0); motor/decisão intocados;
nenhum dado vivo no Git.
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
**Gate de saída:** flag OFF ⇒ zero regressão (comparação com comportamento atual, mesmos JSONs
históricos, mesma tela); flag ON ⇒ Calmo/Ambiente/Foco/Mapa/Pressão/Sinais idênticos em forma,
alimentados pelo snapshot simulado; `decidir()` continua com `active`; nenhum estado cognitivo
novo; nenhum log técnico na tela.
**Critério de parada:** qualquer necessidade de tocar motor/decisão ou de criar estado cognitivo
novo → parar e reportar.
**Commit:** `Conecta fonte viva simulada a interface por feature flag`.

## Fase 5 — Offline e recuperação

**Entregáveis:** último snapshot confiável + idade do dado na tela; reconexão automática dos
adaptadores simulados; reconstrução pós-reinício (replay do log); proteção contra arquivo
incompleto; identificação de dado vencido; confiança parcial por fonte caída; parada segura de
recomendações sob confiança insuficiente. Documento das dependências (o que funciona sem internet /
com rede local / depende da comanda / depende do iFood; quando continua, quando só observa, quando
para de recomendar).
**Gate de saída:** cenários de queda/reconexão/reinício da Fase 3 re-rodados com os novos
mecanismos, todos recuperando; regressão histórica verde.
**Commit:** `Adiciona resiliencia offline e recuperacao local`.

## Fase 6 — Motor de embalagens por flag (`src/embalagens/`)

**Entregáveis:** módulo isolado transcrevendo `docs/Logica_Embalagens_DeliveryOS_V0.md` (tabelas de
categoria→caixa e regras de sacola como dados); flag `DELIVERYOS_EMBALAGENS_V1` (padrão `false`);
saída sempre `{resultado, regra, motivo, confianca, pendencia}`; testes por regra (a tabela do
documento é a tabela de casos).
**Regras duras:** categoria, não sabor · combinado fechado, extras separados · nome desconhecido ⇒
`incerto` + pendência (nunca regex ampla, nunca alias adivinhado) · flag OFF ⇒ classificação visual
V0 atual intocada.
**Pendências herdadas:** as 8 perguntas abertas do César (Embalagens §15) entram como `pendencia`
nas saídas afetadas (ex.: Fish Katsu × Chickenkatsu).
**Gate de saída:** todos os casos da tabela do documento passando; casos incertos retornando
incerto; regressão histórica verde com flag OFF.
**Commit:** `Implementa motor de embalagens V1 protegido por flag`.

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

**Entregáveis:** bateria total (histórica + viva + flags ON/OFF + 30 dias + embalagens + scripts
Windows + interface nos dois modos); `Relatorio_Final_PreLoja_Fable_V0.md`,
`Checklist_Release_Candidate_V0.md`, `Pendencias_Inspecao_Real_V0.md` (em `docs/preloja/`).
**Confirmações obrigatórias:** troca proibida 0 · nota 8,1 não piorou · motor/decisão intocados ·
fonte histórica intacta · nenhum dado real commitado · nenhum PDF/imagem rastreado.
**Não criar** `release/preloja-rc1` — só recomendar se está pronto.
**Commit:** `Consolida release candidate pre-loja do DeliveryOS`.

## Pacote de revisão (toda fase)

Pasta `../deliveryos-review-packets/faseN-<slug>/` (fora de qualquer repositório Git), contendo:
`fase.patch` (diff completo da fase), `arquivos.txt`, `testes.txt` (saída dos testes),
`hashes.txt` (hash base + hash final), `riscos.txt`. Nunca commitado.

## Mapa de dependências entre fases

```
F1 (docs) → F2 (núcleo) → F3 (simulador) → F4 (interface+flag) → F5 (offline)
                                        ↘  F6 (embalagens, independente de F4/F5, depende de F2 só p/ integração de sinais)
F7 (windows) depende de F2-F5 · F8 depende de todas
```

F6 pode ser reordenada antes de F4/F5 se o César preferir — registrado como flexibilidade, decisão
dele a cada "AUTORIZO FASE N".
