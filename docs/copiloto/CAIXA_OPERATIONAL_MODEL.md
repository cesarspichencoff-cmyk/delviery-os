# Modelo Operacional do CAIXA — Especificação (modo sombra)

> **Documento de especificação. Nenhum código foi alterado.** Não implementa cálculo,
> não define pesos, não altera `app.js`, motor, Capacidade Viva, ENTREGAS ou COR.
> Baseline Copiloto congelado em `101680a`; esta spec vive em `audit/copiloto-hardening`.

## 1. Definição

O **Caixa não é uma praça canônica de produção**. É uma **célula operacional derivada**: não produz item, mas concentra a **etapa final**. Fica sobrecarregado quando muitos pedidos ficam prontos quase ao mesmo tempo — **mesmo com as praças de produção estáveis**. Não deve ser removido nem permanecer hardcoded.

## 2. Definição operacional oficial (operação real TATÁ)

**Caixa e Conferência são funções distintas e conectadas. Não unificar.**

### CAIXA / ATENDIMENTO / APOIO
- Preparar e organizar **sacolas**; preparar e organizar **comandas**.
- **Fechar pedidos para saída**; organizar pedidos prontos.
- Acompanhar atrasos; **receber informações da Conferência**.
- Atender mensagens e dúvidas de clientes; tratar alterações e problemas; falar com clientes quando necessário.
- **Coordenar a saída**; atender motoboys próprios e do iFood.
- Ajudar a evitar acúmulo na etapa final.

### CONFERÊNCIA / DELIVERY
- **Conferir o pedido final**; verificar itens e integridade antes da saída.
- Acompanhar pedidos atrasados; **identificar o que ainda falta**.
- **Comunicar ao Caixa** quais pedidos precisam de ação.
- Acompanhar o andamento em tablet, computador ou celular.
- **Sinalizar quando o pedido está pronto para seguir.**

> Conferência **não** é sinônimo de Caixa. A Conferência valida; o Caixa organiza, fecha e comunica. Uma alimenta a outra.

## 3. Sinais do Caixa — disponibilidade REAL hoje (auditado, sem alterar código)

A célula Caixa vive no **Copiloto**, que hoje recebe do adaptador D4A apenas: **`r` (recebido)**, **`p` (pronto)**, **`c` (cancelado)**. Os carimbos `s` (saiu) e `e` (entregue) são **estruturalmente `null`** (`src/live/interface/adaptador.js:120-121`). Os eventos ricos existem no **domínio ENTREGAS**, mas **o ENTREGAS não está integrado ao Copiloto**.

| Sinal | Existe hoje p/ o Caixa? | Fonte | Campo/evento | Limitação |
|---|---|---|---|---|
| Pedidos prontos numa janela recente | **SIM** | D4A (Copiloto) | `NIGHT[].p` | é "pronto", não "saída" |
| Concentração temporal de prontos | **SIM (derivável)** | D4A | contagem de `p` em [t−W, t] | mede prontos, não saídas |
| Recebido / cancelado | **SIM** (usar só quando relevante) | D4A | `NIGHT[].r`, `.c` | contexto, não pressão de Caixa |
| Prontos aguardando **sacola** | **NÃO** | — | não existe evento de sacola | precisa nova fonte |
| Prontos aguardando **comanda** | **NÃO** | — | não existe evento de comanda | precisa nova fonte |
| Prontos aguardando retirada / fila de retirada | **NÃO** (confirmação impossível) | — | `s`/`e` sempre `null` | saída não é observada |
| Quantidade saindo em intervalo curto | **NÃO** | — | `s` sempre `null` | — |
| Viagens próprias (montagem / aguardando saída) | **NÃO** no Copiloto | ENTREGAS | `trip_created`, `trip_started` | **não integrado** |
| Handoffs iFood aguardando retirada | **NÃO** no Copiloto | ENTREGAS | `handoff_created`→`handoff_courier_arrived` | **não integrado** |
| Ocorrências abertas | **NÃO** no Copiloto | ENTREGAS | `occurrence_opened` | **não integrado** |
| Mensagens de clientes / contato | **NÃO** | — | nenhuma fonte | precisa nova fonte |
| Pedidos atrasados que exigem contato | **PARCIAL** | D4A | idade via `r`/`p` | "exigir contato" não é sinal |
| Pedidos aguardando ação do Caixa | **NÃO** | — | sem sinal explícito | precisa modelagem |

**Conclusão honesta:** hoje o Caixa tem **um sinal sólido** — volume e concentração de **prontos** — mais contexto fraco de atraso. **Expedição, saída, retirada, sacola, comanda, handoffs, viagens, ocorrências e mensagens NÃO estão conectados.**

## 4. Linguagem obrigatória sobre fontes (correção)

**Não afirmar que estão conectados** viagens próprias, retiradas, handoffs iFood, ocorrências, saída do pedido, motoboys ou expedição — porque não estão.

- ❌ Errado: *"Pedidos e expedição conectados. Mensagens de clientes ainda não conectadas."*
- ✅ Correto: *"Pedidos prontos observados parcialmente. Expedição e mensagens de clientes ainda não conectadas."*

## 5. Fontes futuras do Caixa (não conectadas)

`montagem_outros` (se confirmada a relação com sacolas/comandas — ver §7) · pedidos aguardando saída · handoffs iFood · viagens próprias · ocorrências · mensagens de clientes (WhatsApp, iFood, ligações, redes sociais, presencial) · tempo sem resposta · conversas abertas · atrasos · filas de retirada.

Enquanto ausentes, o Caixa **declara "Leitura parcial"** e **nunca** mostra "zero" como ausência real de demanda.

## 6. Estados — o que é permitido HOJE

Com **apenas** volume/concentração de prontos, são permitidos no máximo:

| Estado | Explicação-exemplo (honesta com os sinais atuais) |
|---|---|
| **Calmo** | "Nenhuma concentração relevante de pedidos prontos agora." |
| **Em movimento** | "5 pedidos ficaram prontos em pouco tempo. Fluxo dentro do esperado." |
| **Atenção** | "7 pedidos ficaram prontos nos últimos 8 minutos — concentração acima do normal." |
| **Leitura parcial** | "Pedidos prontos observados parcialmente. Expedição e mensagens de clientes ainda não conectadas." |
| **Fonte indisponível** | "Não foi possível atualizar a leitura do Caixa. A operação continua, mas este estado pode estar desatualizado." |

**"Sobrecarregado" NÃO é permitido hoje.** Não usar esse estado com base apenas em `p`. Só poderá ser usado quando existirem **sinais combinados e confiáveis**: prontos acumulados **+** sacolas/comandas pendentes **+** fila de retirada **+** mensagens aguardando **+** expedições pendentes **+** ocorrências/atrasos.

## 7. Papel provável de `montagem_outros`

**Não mapear `montagem_outros` para "Conferência" sem comprovação.** Pela operação descrita, ele parece estar mais próximo de **preparação de sacola, comanda, montagem final, embalagem, itens externos e organização física da saída**.

**Hipótese principal registrada:**
> `montagem_outros` → **Montagem / Sacolas** → **possível sinal de pressão para o Caixa**

Só usar como fonte da **Conferência final** se houver evidência de que contém **eventos de checklist ou validação item a item**. Não alimentar a Conferência com `montagem_outros` apenas para preencher a célula.

## 8. Conferência — fonte própria ainda necessária

Fonte atual: **não comprovada / parcial**. Fontes futuras necessárias: início da conferência · pedido em conferência · itens pendentes · checklist final · pedido conferido · tempo aguardando conferência · pedidos atrasados acompanhados pela equipe.

## 9. Regra inicial proposta (modo sombra, sem fórmula definitiva)

Sem pesos arbitrários. Considera **somente sinais que existirem**. Hoje: quantidade de recém-prontos + concentração temporal. Futuramente (quando conectados): sacola, comanda, retirada, handoffs, viagens, ocorrências, contato.

Toda leitura **explicável**: quais sinais contribuíram, em que janela, qual fonte deu cada sinal, **quais fontes estão ausentes**, por que o estado mudou.

**Exemplo válido (com os sinais de hoje):**
> "Caixa em movimento. 5 pedidos ficaram prontos em pouco tempo. Leitura parcial: sacolas, comandas, expedição e mensagens ainda não estão conectadas."

**Exemplo inválido:**
> "4 pedidos aguardam sacola" — não existe evento de sacola.

**Proibido:** reduzir a "Caixa 82%"; transformar pressão operacional em avaliação de desempenho individual.

## 10. Modo sombra e limites da Capacidade Viva

Permanece **em modo sombra**. Pode futuramente observar praças canônicas, agregações visuais e células derivadas (Caixa, Conferência, Entregas). **Não pode**: decidir automaticamente, movimentar pessoas, atribuir tarefas, punir, ranquear, esconder incerteza, ou transformar leitura parcial em verdade.

## 11. Decisões pendentes do César

1. Confirmar se `montagem_outros` corresponde a Montagem/Sacolas (hipótese principal) e se pode servir de sinal de pressão do Caixa.
2. Definir a fonte própria da Conferência (§8).
3. Quando e como conectar expedição, mensagens e demais fontes futuras.
4. Autorizar (ou não) a implementação da leitura do Caixa em modo sombra — **hoje não implementada**.
5. Confirmar o mapeamento das praças — ver [PRACAS_MAPPING_PROPOSAL.md](PRACAS_MAPPING_PROPOSAL.md).

## 12. Confirmação

Nenhum código foi alterado por este documento. `app.js`, motor, Capacidade Viva, ENTREGAS, COR e contratos permanecem intocados. Baseline Copiloto em `101680a`. Sem push, deploy ou merge.
