# Roteiro de homologação física V1: Androids pessoais dos motoboys

> Pronto para executar. **Nada aqui foi executado**: todo resultado nasce `NOT_RUN`.
> Detalhe técnico, comandos e consultas `Q1`–`Q7` ficam em
> [`docs/etapa-4-8/FIELD-GATE-ANDROID.md`](../../etapa-4-8/FIELD-GATE-ANDROID.md), citado aqui como
> **FG §n item m**. Este roteiro não repete aquele, só o organiza para pessoas e aparelhos reais.
> Onde o caminho depende do convite por QR, marcado `[convite QR: em construção]`, usar o
> caminho manual de FG §2.5 até o convite existir.

## 0. Portões antes do primeiro motoboy (todos obrigatórios)

| # | Portão | Quem | PASS se | Resultado |
|---|---|---|---|---|
| P0 | Termo **aprovado e publicado** (não a minuta, não o sintético de laboratório) | César, após revisão jurídica | `/api/policies` mostra `term.publishable: true` e o texto não tem `[[PENDENTE]]` nem "SEM VALOR LEGAL" | NOT_RUN |
| P1 | Trava de eliminação resolvida ou texto ajustado (`TERMO_GPS_RECOMENDACOES.md` §2) | César | o termo não promete o que o sistema não faz | NOT_RUN |
| P2 | Modo da instância (`DELIVERYOS_SOURCE_MODE`: `real`, `simulated` ou `control`) decidido e anotado | César | o modo está anotado neste roteiro antes do item 1 | NOT_RUN |
| P3 | Servidor no ar com crítico, piloto e assíncrono (FG §2) | operador técnico | crítico healthy; `/api/policies` responde | NOT_RUN |
| P4 | Lista de participantes só com `rider_id` opaco. Nada de nome, telefone ou documento neste arquivo | gerente | a planilha do teste não tem PII | NOT_RUN |
| P5 | Cada motoboy leu o `GUIA_MOTOBOYS_V1.md` e aceitou participar **antes** de instalar | gerente | participação voluntária registrada pelo `rider_id` | NOT_RUN |

Sem P0, P1 e P2: **parar**. Homologar com GPS de pessoa real sem termo aprovado é exatamente o
que o termo existe para impedir.

## 1. Fases

- **Fase A: 3 motoboys, 3 celulares pessoais**, de pelo menos 2 fabricantes (um Xiaomi, se houver).
  Um turno curto, com o técnico presente.
- **Fase B: 5 motoboys**. Só começa com a Fase A inteira em PASS ou com cada FAIL entendido e
  aceito pelo César. Turno normal, técnico disponível à distância.

Para cada item, anotar: `rider_id`, modelo e versão do Android, hora UTC, evidência (print sem
dado pessoal, saída de consulta) e `PASS`/`FAIL`/`NOT_RUN`. FAIL nunca vira PASS por
explicação. Vira linha nova depois de reproduzir e corrigir.

## 2. Bateria por motoboy (Fase A: M1–M3; Fase B: M1–M5)

| # | Item | Como | PASS se | Ref. | M1 | M2 | M3 | M4 | M5 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Instalação do APK | instalar o APK de piloto `[convite QR: em construção]`; anotar a versão | instala, abre e mostra a versão | FG §3 item 1 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 2 | Data e hora automáticas | conferir nas configurações | ligadas; diferença para o servidor < 2 min | FG §3 item 2 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 3 | Entrada | o motoboy entra com o próprio acesso `[convite QR: em construção]` | a sessão é de `motoboy_interno` e de **este** `rider_id` | — | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 4 | Vínculo do aparelho | o app mostra `device_id` e o código de prova; o responsável pré-vincula `[convite QR: em construção]` | `applied=true`; vinculado **antes** do primeiro contato; nunca "quem chega primeiro" | FG §2.5 e §3 itens 3–4 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 5 | Termo antes da permissão | primeira abertura | resumo, termo, caixa desmarcada, depois pedido do Android | FG §3 item 5; `CONSENTIMENTO_GPS_PROCEDIMENTO.md` §1 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 6 | Recibo do aceite | depois de aceitar, abrir o recibo | recibo com versão, impressão do texto, data, aparelho; linha correspondente em `term-acks.jsonl` com o mesmo hash de `/api/policies` | `CONSENTIMENTO…` §2 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 7 | GPS não liga antes da saída | viagem atribuída, saída **não** confirmada | indicador "GPS DESLIGADO — AGUARDANDO A SAÍDA"; nenhum ponto (`Q2`) | FG §3 item 5 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 8 | Viagem com GPS | confirmar a saída e andar ≥ 500 m | notificação "localização ativa durante a viagem"; pontos chegando; trilha coerente; sem buraco na sequência | FG §3 itens 6, 9 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 9 | Tela bloqueada e app em segundo plano | 5 min de cada | pontos continuam | FG §3 itens 7–8 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 10 | Offline e reconexão | desligar dados e Wi-Fi por ≥ 10 min, depois religar | nada chega no corte; nada some no celular; na volta todos chegam, marcados como offline, sem duplicata | FG §3 itens 10–16 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 11 | Recibo de envio | durante o item 10, olhar a fila no app | ponto só aparece como enviado depois do recibo do servidor; pendente nunca vira "enviado" sozinho | `queue-health.js` | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 12 | App encerrado | fechar o app pelos recentes ou matar o processo com a viagem ativa | o serviço volta ou o app avisa; a fila sobrevive | FG §4 "app morto" | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 13 | Celular reiniciado | reiniciar no meio da viagem, sem rede | depois do boot a fila está lá e sincroniza quando a rede volta | FG §4 "aparelho reiniciado" | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 14 | Fim da viagem desliga | encerrar a viagem com o app aberto, e de novo com o app em segundo plano | notificação some e indicador "GPS DESLIGADO" em até ~15 s; `Q2` para de crescer | FG §4 (duas linhas "viagem encerrada") | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 15 | Permissão retirada | desligar a permissão de localização durante a viagem | a captura para e o app avisa; ao religar, retoma (atenção a C2, FG §6) | FG §4 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 16 | Bateria | economia de bateria desligada para o app (runbook §6); ≥ 2 h de viagens | consumo anotado em % por hora; nenhum travamento. **O limite aceitável é do César** | FG §3 item 22 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 17 | Recusa do termo (só em 1 motoboy, voluntário, ou num aparelho de teste) | tocar em "NÃO CONCORDAR / VOLTAR" | sem pedido de permissão; a saída confirma; "TERMO NÃO ACEITO"; nenhum ponto | FG §4 | NOT_RUN | — | — | — | — |

## 3. Troca e revogação de aparelho (1 motoboy por fase)

| # | Item | Como | PASS se | Ref. | Resultado |
|---|---|---|---|---|---|
| R1 | Revogar | `admin:entregas:device -- revoke …` (plano, depois `--apply=YES --expect`) | `revoked_at` preenchido; histórico preservado; o app para de insistir e avisa | FG §3 itens 20–21 | NOT_RUN |
| R2 | Pontos locais não somem | capturar depois da revogação | nada novo chega no servidor; os pontos locais continuam no celular | FG §3 item 21 | NOT_RUN |
| R3 | Aparelho novo | vincular outro celular ao mesmo motoboy `[convite QR: em construção]` | o termo aparece **de novo** (aceite é por aparelho); o celular antigo continua recusado | `CONSENTIMENTO…` §2 | NOT_RUN |
| R4 | Token velho | tentar usar a sessão do aparelho revogado | recusado (401/403); nenhum ponto aceito | `run-session-isolation-tests.ts` | NOT_RUN |

## 4. Isolamento entre motoboys (Fase A com 3 simultâneos; Fase B com 5)

| # | Item | Como | PASS se | Resultado |
|---|---|---|---|---|
| I1 | Viagens simultâneas | todos com viagem ativa ao mesmo tempo | em `Q2`/`Q5`, cada `trip_id` só tem pontos do `device_id` e do `actor_id` dele; **zero** ponto cruzado | NOT_RUN |
| I2 | Viagem de outro | M1 tenta ver ou atuar na viagem de M2 | a regra devolve "VIAGEM DE OUTRO MOTOBOY"; nenhum ponto de M1 entra na viagem de M2 (`viagem_sem_concessao`) | NOT_RUN |
| I3 | Celular compartilhado (aparelho de teste) | M2 entra no celular de M1 | o termo aparece para M2; o aceite de M1 não vale para M2 | NOT_RUN |
| I4 | Recibos | conferir os aceites | um registro por motoboy e aparelho; nenhum `rider_id` no recibo de outro | NOT_RUN |
| I5 | Home | contar no bloco "entregas na rua" | o número de viagens bate com as viagens reais; nenhum aparelho aparece duas vezes | NOT_RUN |

## 5. O que o gerente vê na Home (bloco "entregas na rua")

Abrir a Home do gerente durante as viagens do §2 (fonte: `src/product/ui/surfaces/home.js`,
`entregasNaRua`, decisão D103).

| # | PASS se | Resultado |
|---|---|---|
| H1 | a linha "entregas na rua" mostra contagem e "lida às HH:MM" (por exemplo, "2 viagens na rua", ou "N com posição recente, saída e fim não confirmados") | NOT_RUN |
| H2 | a dobra lista cada viagem com o aparelho e **a idade da posição** ("posição há 1 min"); viagem sem posição confiável diz "sem posição confiável" | NOT_RUN |
| H3 | **sem mapa, sem coordenada, sem previsão de chegada (ETA), sem "entregue"** | NOT_RUN |
| H4 | no item 10 (offline), a viagem envelhece: a idade cresce e a linha mostra "sem posição recente". Não some e não finge posição | NOT_RUN |
| H5 | se o modo não for `real`, cada item mostra a procedência (`simulated`/`control`). Simulado nunca aparece como real | NOT_RUN |
| H6 | com o banco fora, a Home continua abrindo e o bloco diz que não leu. Nunca diz "nenhuma viagem" | NOT_RUN |
| H7 | depois do item 14, a viagem sai de "na rua" (ver o limite de D103: o ciclo da viagem pode aparecer como "não confirmado". Anotar o que a tela diz, sem interpretar) | NOT_RUN |

## 6. Encerramento de cada fase

- [ ] tabela preenchida, com evidência por linha;
- [ ] FAILs reproduzidos e registrados (`docs/execution/BLOCKERS.md` ou nova pergunta), sem
      correção feita no campo;
- [ ] celulares devolvidos ao uso pessoal. Se o motoboy sair do teste, revogar o aparelho (R1) e
      registrar se ele pediu retirada do aceite (`CONSENTIMENTO…` §4);
- [ ] veredito da fase escrito: PASS, PARCIAL ou FAIL. Parcial nunca é "completo".
