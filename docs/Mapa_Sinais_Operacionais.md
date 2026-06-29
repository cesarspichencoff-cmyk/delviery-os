# Mapa de Sinais Operacionais — DeliveryOS

> O que transforma o DeliveryOS de "tela de estado" em **investigação pronta**.
> Cada sinal é minerado da operação real (13 conversas / relatórios iFood / 4 anos), não inventado.
> Estrutura de cada sinal: **situação · origem · dados · registro (calmo/ambiente/foco) · mensagem útil · ação · impacto · disponibilidade**.
>
> Regra de ouro (Leis Fundamentais): o sistema **escuta e cruza**; nunca pede preenchimento por pedido no pico.
> "Disponibilidade" diz o que dá pra fazer **hoje** (só iFood) vs o que precisa do **cardápio** / **impressora-KDS** / **SAC**.

## Evidência nas conversas (frequência real)
- praças (quente/sushi/enrolado/combinado): **1.588** · pausa/segura/travou/"não tá subindo": **731** · fechar/caixa/bancada: **85**
- custódia ("de quem é / quem fechou / cadê") crônica 2023→2026 · "faltou/esqueceram" 415+ · kit padronizado em 25/09/2023
- citações-âncora: *"De quem é 330?"* · *"quem fechou o pedido do Tito?"* · *"não sei quem salvou"* · *"esqueceram de mandar o molho da guioza"* · *"pausa a kids já Bia"* · *"fica de olho pra pausar"* · *"não tava subindo, pausei 15min"*

---

## Famílias de sinal

Legenda de registro: 🟢 calmo (responde se perguntado) · 🌫️ ambiente (clima) · 🔶 foco (raro, acionável).
Legenda de disponibilidade: **[A] agora** (iFood) · **[C] cardápio** · **[K] impressora/KDS** · **[S] SAC/review**.

---

### A. EXPEDIÇÃO / SAÍDA

**S1 — Pedido pronto sem sair (aguardando motoboy)** 🔶 **[A]**
- *Origem:* iFood (carimbos pronto/saída) + status motoboy.
- *Dados:* pedido_id, hora_pronto, hora_saída(ausente), status_motoboy.
- *Mensagem:* `EXPEDIÇÃO · #8606 · pronto há 53 min · aguardando motoboy · +3 podem atrasar · → conferir saída`
- *Ação:* conferir saída / chamar motoboy.
- *Impacto:* +N pedidos prontos acumulando; risco de atraso e de cliente reclamar.

**S2 — Expedição carregada / saída lenta** 🌫️ **[A]**
- *Origem:* iFood (≥3 prontos sem sair) — mineração: motoboy/atraso é dor crônica (entregador aguardando >5min ~38%).
- *Dados:* nº prontos sem saída, tempo médio na fila de saída.
- *Mensagem (clima):* `saída lenta`.
- *Ação:* nenhuma por pedido; é condição (segurar entrada se piorar).
- *Impacto:* a noite pesa na borda; alimenta decisão de pausar o iFood.

**S3 — Saiu, sem entregar há muito (atraso de entrega)** 🌫️/🔶 **[A]**
- *Origem:* iFood (saída sem entrega + tempo prometido).
- *Dados:* hora_saída, tempo_prometido, distância.
- *Ação:* acompanhar entrega (fora da cunha — logística).
- *Impacto:* risco de 1★/cancelamento. Sinal de borda, não de chão.

---

### B. PRODUÇÃO / PRAÇAS  *(o coração; precisa do cardápio p/ saber a praça)*

**S4 — Pedido X min sem ficar pronto (produção travada)** 🔶 **[A]+[C melhora]**
- *Origem:* iFood (aceito sem pronto). Com cardápio: aponta a **praça provável**.
- *Mensagem:* `PRODUÇÃO · #2022 · 87 min sem ficar pronto · praça provável: sushi · → olhar produção`
- *Ação:* olhar a praça responsável.
- *Impacto:* +N esperando a mesma praça.

**S5 — Praça sobrecarregada (quentes/sushi/enrolados/combinados)** 🌫️ **[C] essencial**
- *Origem:* iFood (pedidos vivos) **× cardápio** (item→praça). Mineração: 1.588 menções de praça; *"os quentes não tão subindo"*, *"segura o delivery"*.
- *Dados:* pedidos abertos por praça, tempo acima do padrão da praça.
- *Mensagem:* `PRODUÇÃO · quentes sobrecarregada · 8 pedidos de quente em aberto · tempo acima do normal · → enviar prontos pra bancada do caixa`
- *Ação:* enviar prontos pra bancada / remanejar / pausar itens da praça.
- *Impacto:* cascata — trava a montagem e a saída.

**S6 — Praça recebendo mais demanda que o normal (surto de zona)** 🌫️ **[C]**
- *Origem:* ritmo de chegada por praça vs baseline da praça.
- *Ação:* antecipar (chamar reforço / pausar item da praça).
- *Impacto:* prevê a sobrecarga de S5 antes dela travar.

**S7 — Pedido que trava a fila (depende de uma única praça lenta)** 🔶 **[C]**
- *Origem:* cardápio (item.depende_de / trava_fechamento) × estado das praças.
- *Mensagem:* `PRODUÇÃO · #3120 · espera só o hot (praça travada) · resto pronto · → priorizar hot`
- *Ação:* priorizar o item que está segurando o pedido.
- *Impacto:* destrava 1 pedido (e a sacola).

**S8 — Pedido simples que pode ser adiantado** 🌫️/🔶 **[C]**
- *Origem:* cardápio (produz_sozinho, poucas praças) × fila.
- *Ação:* adiantar os fáceis pra aliviar a fila.
- *Impacto:* vazão maior sem custo.

**S9 — Prontos acumulando na praça → enviar pra bancada do caixa** 🔶 **[C]+[K]**
- *Origem:* "pronto por praça" (impressora/KDS) — mineração: *"manda pro caixa"*, *"bancada"*.
- *Ação:* enviar prontos pra bancada do caixa (libera a praça).
- *Impacto:* desafoga a praça; acelera montagem.

---

### C. CUSTÓDIA / ESTADO ("cadê?")  *(o sinal que mata o search-tax)*

**S10 — "Cadê o pedido / quem pegou / de quem é"** 🟢 (responde sempre) **[A]+[K]**
- *Origem:* a própria História (estado por pedido). É a função-mãe.
- *Comportamento:* não é um alerta — é o sistema **sempre saber**: onde está, em que etapa, quem no posto. A pergunta deixa de existir.
- *Impacto:* elimina a investigação (o produto inteiro).

**S11 — "Quem fechou a sacola" (custódia do lacre)** 🟢 **[K/Camada 1]**
- *Origem:* evento físico do lacre (futuro) / posto×escala×hora.
- *Impacto:* atribuição sem perguntar; nunca punitiva (Lei 4).

---

### D. FECHAMENTO  *(quando já dá pra fechar a sacola)*

**S12 — Pedido só de pratos quentes / sem frios pendentes → fechável** 🔶 **[C]+[K]**
- *Origem:* cardápio (categoria dos itens) × pronto-por-praça.
- *Mensagem:* `FECHAMENTO · #4421 · só pratos quentes · sem itens frios pendentes · → verificar se já dá pra fechar`
- *Ação:* verificar fechamento.
- *Impacto:* pedido sai mais cedo; menos espera.

**S13 — Pedido fechável (todas as praças reportaram pronto)** 🔶 **[C]+[K]**
- *Origem:* todas as praças do pedido → "pronto".
- *Ação:* fechar/conferir.
- *Impacto:* reduz pedido parado por desatenção.

**S14 — Pedido grande / mais de uma sacola (conferência maior)** 🔶 **[C]**
- *Origem:* cardápio (sacolas_esperadas, nº de itens).
- *Mensagem:* `CONFERÊNCIA · #5012 · 2 sacolas · 11 itens · → separar 2ª sacola e conferir item a item`
- *Ação:* separar segunda sacola; conferência reforçada.
- *Impacto:* risco de omissão (a maior fonte de erro) cai.

---

### E. CARDÁPIO / PAUSA / ITEM  *(disponibilidade como risco)*

**S15 — Item deveria estar pausado, mas ainda entra em pedidos** 🔶 **[A pausa]+[C]**
- *Origem:* evento de pausa (iFood) × pedidos novos com o item. Mineração: saga pausar/despausar, *"medo de liberarem algo pausado e não lembrarem"*.
- *Mensagem:* `CARDÁPIO/PAUSA · "salmão" deveria estar pausado · entrou em 4 pedidos nos últimos 15 min · → pausar item ou confirmar substituição`
- *Ação:* pausar item / confirmar substituição.
- *Impacto:* evita N erros/cancelamentos em série.

**S16 — Pedido com item pausado/indisponível** 🔶 **[A]+[C]**
- *Origem:* pausa × comanda do pedido.
- *Ação:* substituir ou avisar; não montar às cegas.
- *Impacto:* risco de falta/erro.

**S17 — Risco de ruptura de item (consumo teórico + ritmo)** 🌫️/🔶 **[C ficha]**
- *Origem:* ficha técnica (consumo por pedido) × pedidos aceitos × pausa.
- *Mensagem:* `DISPONIBILIDADE · "hot" saindo rápido · ritmo alto · risco de faltar · → pausar ou repor`
- *Ação:* pausar/repor antes de zerar.
- *Impacto:* evita ruptura no pico.

**S18 — Item com pico de venda agora** 🌫️ **[C]**
- *Origem:* ritmo do item nos últimos N min.
- *Ação:* info (alimenta S5/S17).
- *Impacto:* antecipação.

---

### F. INTEGRIDADE / ERRO  *(o "fechamento ressuscitado")*

**S19 — Faltou item / item errado (desfecho × comanda)** 🔶(pós) **[S]+[C]**
- *Origem:* SAC/review × comanda. Mineração: 415+ "faltou/esqueceram"; *"esqueceram de mandar o molho da guioza"*.
- *Mensagem:* `ERRO · #7498 · cliente diz "faltou kit" · montador no posto às 21:14 · → registrar e revisar`
- *Ação:* tratar; o erro vira memória automática (sem planilha).
- *Impacto:* corpus de erro por montador/turno (alimenta treino, nunca punição — Lei 4).

**S20 — Pedido com observação especial (sem X / alergia)** 🔶(montagem) **[A obs]+[C]**
- *Origem:* observação do iFood (já existe no pedido).
- *Mensagem:* `MONTAGEM · #6033 · OBS: "sem gergelim" · → conferir antes de lacrar`
- *Ação:* conferência dirigida ao que o cliente pediu.
- *Impacto:* evita erro caro (alergia/insatisfação).

**S21 — Pedido com bebida/sobremesa/kit (itens fáceis de esquecer)** 🔶(montagem) **[C]**
- *Origem:* cardápio (categoria bebida/sobremesa/kit).
- *Ação:* lembrete na conferência (não esquecer o "extra").
- *Impacto:* omissão é a maior fonte de erro; esses são os campeões.

---

### G. DEMANDA / CONTEXTO

**S22 — Ritmo acima do normal (surto de chegada)** 🌫️ **[A]**
- *Origem:* chegada/min vs baseline (a cascata = surto exógeno, já confirmado por H2a′).
- *Mensagem (clima):* `ritmo acima do normal`.
- *Ação:* condição; informa decisão de pausa.
- *Impacto:* prevê pressão nas praças e na saída.

---

## Leitura do mapa (o que isto prova)

- **Disponível já (só iFood):** S1, S2, S3, S4 (sem praça), S10 (parcial), S16, S20, S22 — o wedge "Parados Agora" já cobre o essencial.
- **Destravado pelo cardápio:** S5–S9, S12–S14, S17, S18, S21 — a maioria dos sinais ricos depende de **saber a praça, o tipo, o nº de sacolas e a ficha**. → é o que justifica a *Arquitetura do Conhecimento do Cardápio*.
- **Destravado pelo interior (impressora/KDS):** S9, S11, S12/S13 (pronto por praça).
- **Destravado pelo desfecho (SAC):** S19.

Cada sinal vira um dos três registros — **calmo / ambiente / foco** — exatamente como o protótipo já expressa. O foco nunca é abstrato: traz situação + causa provável + ação + impacto. *Esse é o produto.*

*Próximo documento: Arquitetura do Conhecimento do Cardápio — o cadastro de referência que destrava a maioria destes sinais sem virar ERP.*
