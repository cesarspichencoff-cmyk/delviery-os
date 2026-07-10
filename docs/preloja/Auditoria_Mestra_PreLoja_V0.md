# Auditoria Mestra Pré-Loja — V0

> Fase 1 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `a441bc7`.
> **Nenhum código foi alterado nesta fase.** Auditoria do estado atual do repositório para fundar as
> Fases 2-8: tudo que puder ser construído e testado ANTES da inspeção física da loja deve estar
> pronto; a inspeção real serve só para escolher/validar os dois adaptadores (fila de impressão da
> Epson TM-T20X e status do Gestor iFood).
>
> Cada ponto separa: **Fato** (verificado no código/documento, com referência) · **Hipótese** (a
> confirmar) · **Decisão** (tomada aqui, para as próximas fases) · **Pendência da loja** (só a
> inspeção real responde).

---

## 1. Pontos de entrada

**Fato.** O sistema hoje tem quatro portas de entrada, todas batch/replay, nenhuma viva:
- Scripts Node em `tools/` (`autoteste_8pracas.js`, `auditar_divergencia_motor_decisao.js`,
  `gerar_janela_v1.js`, replays) — leem XLSX/JSONL históricos e chamam o cérebro.
- `npm run demo` / `npm run ingest` — Camada 0 (event store `data/ifood_real.jsonl`).
- `app-v1/` no navegador, servido por `tools/servir_v1.js` (porta 5179) — carrega `motor.js` e
  `decisao.js` por `<script>` e busca `data/generated/v1_janela_real*.json` por `fetch`.
- O seam de fonte do motor: `MOTOR.makeFonteItensFromRows/FromJson/FromCsv` (`motor.js:146-178`),
  documentado no próprio arquivo como "ÚNICO ponto a trocar quando houver KDS/impressora/API iFood".

**Fato.** Não existe nenhum processo residente/daemon hoje. Tudo é: rodar script → terminar.

**Decisão.** A fonte viva (Fase 2) entra como **quinta porta**, sem tocar nas quatro existentes:
`src/live/` produz o mesmo shape que `gerar_janela_v1.js` já produz (`NIGHT` + `rows`), e a
interface consome por flag (Fase 4). O seam do motor não muda.

## 2. Acoplamentos

**Fato.** Acoplamentos atuais relevantes:
- `app-v1/app.js` → globals `MOTOR`/`DECISAO` (UMD) — acoplamento estável e desejado (cérebro único).
- `app-v1/app.js` → shape do JSON de janela (`{meta, T0, T1, NIGHT, rows}`) — contrato implícito,
  não documentado formalmente. **Decisão:** a Fase 2 formaliza esse contrato por escrito (é o mesmo
  que o snapshot vivo terá de produzir).
- `tools/gerar_janela_v1.js` → colunas dos XLSX do iFood (nomes de coluna hardcoded) — aceitável,
  é adaptador histórico.
- `prototipos/parados-agora/index.html` contém **cópia embutida do `decidir()` antigo**
  (index.html:10784) — acoplamento morto e perigoso, já documentado no Contrato de Estado Cognitivo
  como proibido para demo. **Decisão:** nenhuma fase toca o protótipo; ele segue congelado.

**Fato.** `decisao.js` exige `active: sess.active` (gate 11 do Plano V1) — qualquer superfície nova
da fonte viva precisa preservar isso. Verificado que `app-v1/app.js` cumpre (chamada única em
`precomputar`).

## 3. Contratos existentes

**Fato.** Contratos já escritos e vigentes que as Fases 2-8 devem obedecer:
- `docs/Contrato_Estado_Cognitivo_V1.md` — um estado por minuto; foco com ação ou foco puro;
  `decidir()` sempre com `active`; o que cada estado mostra/esconde.
- `docs/Contrato_Motor_Decisao.md` — `sess.active.sit` é a fonte da verdade da atenção.
- Shape `NIGHT`: `{id, curto, r, p, s, e, c}` (minutos contínuos; `null` = não observado — nunca
  inventado). Shape `rows`: `{pedido_id, item_nome, quantidade, observacao}`.
- Seed: `data/cardapio_knowledge_seed.json` (199 itens, 8 praças), casamento por
  `MOTOR.matchSeed` — 100% de casamento provado nas janelas reais 01/07 e 23/06.
- `docs/Logica_Embalagens_DeliveryOS_V0.md` — regra POR CATEGORIA, caixas 240-1600, quente≠frio,
  combinado fechado; com tabela de aliases e 8 pendências do César (§15) ainda abertas.
- `docs/Politica_Dados.md` — dado bruto/gerado nunca entra no Git (`data/*.jsonl`,
  `data/generated/*`, `data/raw/*` gitignorados — verificado no `.gitignore`).

**Hipótese.** Que o consolidado vivo (comanda+status) caiba no shape `NIGHT`+`rows` sem extensão.
Análise: `NIGHT` cobre r/p/s/e/c (recebido/pronto/saiu/entregue/cancelado); o Gestor iFood fornece
transições equivalentes. `rows` cobre itens. Faltam campos vivos: origem da fonte, qualidade,
parcialidade. **Decisão:** o consolidado vivo é um **envelope** em volta de `NIGHT`+`rows`
(`{pedido, fontes, qualidade, incerto}`), nunca uma mutação do shape que o motor conhece.

## 4. Testabilidade

**Fato.** Não existe framework de teste no projeto (`package.json` sem script `test`, sem
jest/mocha/vitest em dependências). Os "testes" atuais são backtests/auditorias (scripts que rodam
o cérebro sobre dado histórico e imprimem métricas) — excelentes como regressão de comportamento,
inúteis como teste unitário de módulos novos.

**Fato.** O ambiente roda Node v24 — que inclui o **runner nativo `node:test`** (`node --test`),
zero dependência nova.

**Decisão.** Fases 2+ usam `node:test` nativo com arquivos `*.test.js` dentro de
`src/live/__tests__/` (ou padrão equivalente), executados por `node --test src/live/`. Nenhuma
dependência instalada; nenhuma mudança no `package.json` além de (com autorização) um script
`"test:live"`. Isso satisfaz "testes unitários obrigatórios" sem violar "não instalar dependências".

## 5. Persistência

**Fato.** Padrão existente e provado: JSONL append-only, replay-safe (Camada 0:
`data/ifood_real.jsonl`, 41.206 transições, idempotência provada "antes=depois, nada duplicou" a
cada `npm run ingest`). `data/` é gitignorado nos padrões relevantes.

**Decisão.** A fonte viva persiste no mesmo espírito: **log de eventos append-only**
(`data/live/eventos.jsonl`, fora do Git) + **snapshot derivado** (reconstruível do log a qualquer
momento — derivado nunca vira evento, Lei já estabelecida na arquitetura da plataforma). Escrita
atômica por linha; leitura tolerante a última linha truncada (ver §10).

## 6. Offline

**Fato.** A V1 atual funciona 100% offline-de-internet: servidor local (`servir_v1.js`) + navegador
na rede local; nenhuma chamada externa. A única dependência de internet do fluxo vivo futuro é o
**Gestor iFood** (status) — a comanda impressa é local.

**Decisão (regra para a Fase 5).** Sem internet: comanda continua chegando (fila de impressão é
local) → composição/praça continuam confiáveis; status congela no último valor com carimbo de
idade. O sistema **continua observando e mostrando com incerteza declarada**, e **para de
recomendar ação** quando a confiança cair abaixo do necessário (o mecanismo de confiança por fonte
já existe no cérebro — `confComp`, alta/média/baixa — não se inventa um novo).

## 7. Reinício

**Fato.** Hoje nada precisa sobreviver a reinício (replay recalcula tudo do arquivo). O processo
vivo precisa: ao reiniciar, reconstruir o snapshot **somente** do log de eventos (§5), sem pedir
nada a ninguém e sem duplicar pedidos já vistos.

**Decisão.** Reinício = replay do próprio log do dia. A deduplicação (§9) tem de ser idempotente
por construção (mesma linha relida ⇒ mesmo estado), igual à Camada 0 já provada.

## 8. Dados incompletos

**Fato.** O cérebro já tem a disciplina certa: campo ausente = `null`, nunca chute
(`motor.js` — pedidos sem carimbo de saída viram `suspeitos`, nunca foco). O contrato cognitivo
exige declarar o que sabe/suspeita/não sabe.

**Decisão.** No vivo existem dois incompletos novos, com nomes explícitos:
- **Comanda sem status** (impresso, mas ainda não visto no Gestor): pedido vale para
  composição/praça; tempo/estado ficam "aguardando fonte de status".
- **Status sem comanda** (apareceu no Gestor, ainda não imprimiu ou captura perdeu): pedido existe
  como "parcial — sem itens"; **nunca** entra no motor de praça (não há composição), nunca aparece
  como completo. O consolidado carrega `parcial: true` + motivo.

## 9. Duplicidade

**Fato.** O histórico não precisou de dedup (cada linha de relatório = um pedido). O vivo precisa:
o mesmo pedido chega por duas fontes, e cada fonte pode reemitir.

**Decisão.** Chaves de dedup por fonte, nunca nome de cliente:
- Comanda: `pedido_interno` (sequencial Odhen de 10 dígitos) — único por pedido; reimpressão repete
  esse número (ver §11).
- Status: código curto do iFood + janela do dia (colisão de curto dentro do dia é rara — 1 em 238
  na janela 01/07, medido — mas existe; empate resolve por proximidade temporal e fica marcado
  `incerto.colisao_curto` se ambíguo).
- Casamento entre fontes: código do iFood (único campo presente nas duas — fato, confirmado nas
  fotos da comanda e do Gestor).

## 10. Linha inválida / arquivo parcialmente corrompido

**Decisão (regra da Fase 2).** Leitura do JSONL: linha que não parseia → contada e registrada em
`qualidade.linhas_invalidas`, **nunca derruba o processo, nunca é "consertada" por adivinhação**.
Última linha truncada (queda de energia no meio da escrita) → descartada com registro. O snapshot
declara quantas linhas foram ignoradas — incerteza explícita, nunca silêncio.

## 11. Cancelamento e reimpressão

**Fato (confirmado pelo César, registrado em `docs/Auditoria_Fonte_Viva_Loja_V1.md`):**
cancelamento aparece **no Gestor iFood**, nunca deve ser inferido da comanda; reimpressão existe
mas é rara; correção manual à caneta ("não foi") **não é detectável** — limitação permanente
declarada.

**Decisão.** Evento `pedido_cancelado` só nasce da fonte de status. Evento `pedido_reimpresso`
nasce quando a fonte de comanda vê `pedido_interno` já conhecido — atualiza carimbo, **não** cria
segundo pedido, e fica registrado (reimpressões são sinal operacional, não lixo). `pedido_alterado`
nasce quando a mesma chave chega com conteúdo diferente — o consolidado guarda a versão mais nova e
o fato de ter mudado.

## 12. Segurança

**Fato.** Regras já escritas em `docs/Arquitetura_Sincronizacao_Local_V1.md` §5: nunca senha,
nunca cookie/token, nunca conversa de chat, nunca escrever de volta em Odhen/iFood/impressora,
menor privilégio possível.

**Decisão.** Vale integralmente para tudo que as Fases 2-8 constroem. Os adaptadores REAIS não
serão implementados neste programa — só as interfaces deles + adaptadores simulados; logo, nenhum
código deste programa toca sistema externo algum.

## 13. Privacidade

**Fato.** O motor não usa nome, telefone nem endereço (verificado: `NIGHT` e `rows` não carregam
nenhum dos três). A comanda real contém os três.

**Decisão.** O contrato de eventos da Fase 2 **não tem campo** para telefone/endereço (o que não
existe no schema não vaza). Nome do cliente: não entra no evento consolidado; se algum adaptador
real futuro precisar dele para conferência visual, será decisão separada com autorização própria.
Chave de pedido nunca é nome (§9). Dados vivos ficam em `data/live/` (fora do Git — verificar
cobertura do `.gitignore` na Fase 2; hoje `data/*.jsonl` cobre a raiz, `data/live/*` precisará de
linha própria: **decisão — adicionar ao `.gitignore` na Fase 2**).

## 14. Interface

**Fato.** `app-v1` renderiza a partir de uma timeline pré-computada de um JSON histórico; o
contrato cognitivo define os estados; flags não existem hoje.

**Decisão (Fase 4).** Uma flag explícita separa os modos. Desligada: comportamento byte-idêntico ao
atual (o arquivo histórico continua o caminho padrão). Ligada: a mesma interface consome snapshot
vivo simulado. Estados técnicos discretos (simulação/fonte parcial/desconectada/último dado
confiável) aparecem como **rodapé discreto**, no mesmo lugar onde hoje já existe o rótulo "Replay de
janela real para demonstração" — nunca um estado cognitivo novo, nunca log técnico na tela.

## 15. Instalação Windows

**Fato.** Hoje: `node tools/servir_v1.js` manual; porta 5179; firewall da máquina de
desenvolvimento precisou de regra manual (rede Pública bloqueia entrada — pendência conhecida,
aconteceu no teste com celular). Node v24 via winget. Nenhum instalador, nenhum serviço.

**Decisão (Fase 7).** Scripts de inicialização manual + healthcheck + modo sombra em
`tools/windows/`, sem serviço definitivo, sem exigir administrador (exceto, se necessário, a regra
de firewall — documentada com justificativa, nunca silenciosa).

**Pendência da loja.** Versão do Windows do caixa, política de firewall/antivírus da máquina real,
porta 5179 livre, permissão para Node.

## 16. Rollback

**Fato.** Código: git resolve (branch, revert). Dados: fora do Git, por design.

**Decisão (Fase 7).** Rollback operacional = (1) desligar flags (volta ao comportamento histórico
sem redeployar nada); (2) parar o processo vivo (script de parada); (3) dados vivos ficam no disco
para diagnóstico, nunca são apagados automaticamente. Documento próprio na Fase 7.

---

## Pendências da loja (consolidado — o que SÓ a inspeção real responde)

1. Modelo A/B/C/D do DOM do Gestor iFood (roteiro já pronto em
   `docs/Inspecao_Fontes_Reais_Loja_V0.md`).
2. `DataType` real dos jobs da Epson TM-T20X e janela de tempo em que o job fica visível na fila.
3. Se o conteúdo textual da comanda é legível no job sem reconfigurar nada.
4. Existência (ou não) de histórico local do Odhen/Teknisa.
5. Ambiente Windows do caixa (versão, firewall, antivírus, porta).
6. Aliases pendentes do cardápio (8 perguntas da Lógica de Embalagens §15) — bloqueiam parte do
   motor de embalagens da Fase 6 (o que não estiver confirmado sai como `resultado incerto`, nunca
   adivinhado).
