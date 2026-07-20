# Modelo Operacional do CAIXA — Especificação (modo sombra)

> **Documento de especificação. Nenhum código foi alterado.** Não implementa cálculo,
> não define pesos, não altera `app.js`, motor, Capacidade Viva, ENTREGAS ou COR.
> Corrige a conclusão errada da auditoria anterior ("Caixa sem função / sem fonte").
> Baseline Copiloto congelado em `101680a`; esta spec vive em `audit/copiloto-hardening`.

## 1. Definição

O **Caixa não é uma praça canônica de produção**. É uma **célula operacional derivada**: não produz item, mas concentra a **etapa final** da operação. Fica pressionado quando muitos pedidos chegam à saída quase ao mesmo tempo — **mesmo que cada praça de produção pareça estável individualmente**. Por isso não pode ser lido como uma praça, nem removido, nem deixado hardcoded.

## 2. Responsabilidades reais (operação TATÁ)

- Preparação de sacolas.
- Impressão e organização de comandas.
- Organização de pedidos prontos e liberação da saída.
- Comunicação com clientes; atendimento de mensagens; tratamento de alterações.
- Acompanhamento de atrasos e contato com clientes em caso de problema.
- Coordenação simultânea de motoboys próprios e retiradas iFood.

## 3. Sinais do Caixa — disponibilidade REAL hoje (auditado, sem alterar código)

A célula Caixa vive no **Copiloto**. O Copiloto hoje recebe do adaptador D4A apenas: `r` (recebido), `p` (pronto), `c` (cancelado). Os carimbos `s` (saiu) e `e` (entregue) são **estruturalmente `null`** (`src/live/interface/adaptador.js:120-121` — "não observado pela fonte simulada — nunca inventado"). Os sinais ricos (handoffs, viagens, ocorrências) existem no **domínio ENTREGAS**, mas o Copiloto e o ENTREGAS **não estão integrados** (e integrá-los é proibido nesta etapa). Daí:

| Sinal | Existe hoje p/ o Caixa? | Fonte | Evento/campo | Qualidade | Frequência | Limitação |
|---|---|---|---|---|---|---|
| Pedidos prontos numa janela recente | **SIM** | D4A (Copiloto) | `NIGHT[].p` | boa (carimbo real) | por snapshot | é "pronto", não "saída" |
| Concentração temporal de prontos | **SIM (derivável)** | D4A | contagem de `p` em [t−W, t] | boa | por snapshot | mede prontos, não saídas |
| Prontos aguardando preparação de sacola | **NÃO** | — | não existe sinal de sacola | — | — | precisa nova fonte |
| Prontos aguardando comanda | **NÃO** | — | `rows` traz itens, não "espera de comanda" | — | — | precisa nova fonte |
| Prontos aguardando retirada | **PARCIAL** | D4A | `p` existe; `s`/`e` sempre `null` | fraca | por snapshot | não dá para confirmar retirada |
| Quantidade saindo em intervalo curto | **NÃO** | D4A | `s` sempre `null` | — | — | saída não é observada |
| Viagens próprias em montagem | **NÃO** no Copiloto | ENTREGAS | `trip_created`+`delivery_added` | (existe no ENTREGAS) | — | não integrado ao Copiloto |
| Viagens próprias aguardando saída | **NÃO** no Copiloto | ENTREGAS | trip antes de `trip_started` | (existe no ENTREGAS) | — | não integrado |
| Handoffs iFood aguardando retirada | **NÃO** no Copiloto | ENTREGAS | `handoff_created`→`handoff_courier_arrived` | (existe no ENTREGAS) | — | não integrado |
| Pedidos iFood prontos | **PARCIAL** | D4A (relatório iFood) | `p` | boa | por snapshot | sem distinção de retirada/handoff |
| Ocorrências abertas | **NÃO** no Copiloto | ENTREGAS | `occurrence_opened` | (existe no ENTREGAS) | — | não integrado |
| Alterações em pedidos | **PARCIAL** | ENTREGAS / D4A | `delivery_added/removed`; no Copiloto `rows` muda | fraca no Copiloto | — | não integrado |
| Pedidos atrasados que exigem contato | **PARCIAL** | D4A | `age`/`p` dão atraso | média | por snapshot | "exigir contato" não é sinal |
| Pedidos aguardando ação do Caixa | **NÃO** | — | sem sinal explícito | — | — | precisa modelagem |

**Conclusão honesta:** hoje o Caixa tem **essencialmente um sinal real** — concentração de **prontos** numa janela — mais um sinal fraco de atraso. Tudo que envolve sacola/comanda/retirada/saída/handoff/ocorrência **não está disponível ao Copiloto** (ou não é observado, ou vive no ENTREGAS não integrado). **Não considerar um sinal disponível só porque seria útil.**

## 4. Fontes do Caixa ainda NÃO conectadas (futuras)

- Mensagens de clientes aguardando resposta; tempo sem resposta; nº de conversas abertas.
- WhatsApp; mensagens do iFood; ligações; reclamações externas; redes sociais.
- Atendimentos presenciais simultâneos.

Enquanto ausentes, o Caixa **declara "Leitura parcial"** — nunca mostra "zero mensagens" como se fosse ausência real de demanda. Ex.: *"Pedidos e expedição conectados. Mensagens de clientes ainda não conectadas."*

## 5. Estados propostos (cada um com explicação humana, nunca só cor)

| Estado | Explicação-exemplo |
|---|---|
| **Calmo** | "Saídas distribuídas. Nenhuma fila relevante no Caixa agora." |
| **Em movimento** | "4 pedidos prontos sendo organizados. Fluxo dentro do esperado." |
| **Atenção** | "6 pedidos ficaram prontos quase juntos. 4 ainda aguardam sacola ou comanda." |
| **Sobrecarregado** | "Muitos pedidos chegaram à saída ao mesmo tempo. A fila de organização está aumentando." |
| **Leitura parcial** | "Pedidos e expedição conectados. Mensagens de clientes ainda não conectadas." |
| **Fonte indisponível** | "Não foi possível atualizar a leitura do Caixa. A operação continua, mas este estado pode estar desatualizado." |

> Observação de honestidade: vários estados acima ("4 aguardam sacola/comanda", "sobrecarregado") **dependem de sinais que hoje não existem** (§3). Com os sinais atuais, o Caixa consegue distinguir com confiança **Calmo / Em movimento / Atenção por concentração de prontos** e **Leitura parcial / Fonte indisponível**. "Sobrecarregado" com base em sacola/comanda/retirada só será honesto quando essas fontes existirem.

## 6. Regra inicial proposta (modo sombra, sem fórmula definitiva)

Não criar pesos arbitrários. Modelo inicial, **em modo sombra**, considerando **somente sinais que existirem**:

- quantidade de pedidos recém-prontos (janela curta);
- concentração temporal dos prontos;
- (quando existirem) prontos aguardando sacola/comanda, fila de retirada, handoffs iFood, viagens próprias aguardando liberação, ocorrências abertas, pedidos exigindo contato.

Toda leitura **explicável**: quais sinais contribuíram, em que janela, qual fonte deu cada sinal, quais fontes estão ausentes, por que o estado mudou.

**Exemplo de saída explicável (alvo):**
> "Caixa em atenção porque 7 pedidos ficaram prontos nos últimos 8 minutos, 4 ainda aguardam organização e existem 2 retiradas iFood pendentes."

**Exemplo honesto com os sinais de HOJE:**
> "Caixa em movimento: 5 pedidos ficaram prontos nos últimos 6 minutos. Retirada, sacola e mensagens ainda não são observadas — leitura parcial."

**Proibido:** reduzir a "Caixa 82%"; transformar pressão operacional em avaliação de desempenho individual.

## 7. Caixa × Conferência (diferença operacional)

- **Caixa** (célula derivada): sacolas, comandas, organização da saída, coordenação, comunicação, atendimento, liberação, interação com motoboys.
- **Conferência / Montagem**: deve representar responsabilidade **distinta e comprovada** — integridade final do pedido, volumes, itens externos à embalagem, fechamento, montagem final. Hoje a célula "Conferência" da interface deriva de sinais `sits` do motor, e a praça canônica candidata é `montagem_outros` — **cujo significado (conferência vs. montagem/embalagem ampla) precisa ser confirmado pelo César** antes de fixar o nome.

Se Caixa e Conferência forem hoje a **mesma equipe/etapa**, opções para o César (não decidir automaticamente):
1. unificar as células;
2. manter Caixa como leitura principal e Montagem como detalhe;
3. separar por responsabilidades reais;
4. aguardar dados melhores.

## 8. Modo sombra e limites da Capacidade Viva

A Capacidade Viva permanece **em modo sombra**. Pode, no futuro, observar praças canônicas, agregações visuais e células derivadas (Caixa, Entregas). **Não pode**: tomar decisão automática, movimentar pessoas, atribuir tarefas, punir, ranquear, esconder incerteza, ou transformar leitura parcial em verdade.

## 9. Decisões pendentes do César

1. Nome da célula final: **Conferência** vs **Montagem** (depende de confirmar o que `montagem_outros` representa).
2. Caixa × Conferência: unificar / principal+detalhe / separar / aguardar (§7).
3. Quando e como conectar as fontes futuras do Caixa (§4).
4. Autorizar (ou não) a implementação da leitura do Caixa em modo sombra — **hoje não implementada**.
5. Confirmar o mapeamento das praças de produção — ver [PRACAS_MAPPING_PROPOSAL.md](PRACAS_MAPPING_PROPOSAL.md).

## 10. Confirmação

Nenhum código foi alterado por este documento. `app.js`, motor, Capacidade Viva, ENTREGAS, COR e contratos permanecem intocados. Baseline Copiloto em `101680a`. Sem push, deploy ou merge.
