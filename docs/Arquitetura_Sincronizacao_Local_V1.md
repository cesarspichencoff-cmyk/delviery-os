# Arquitetura de Sincronização Local — V1

> Proposta de arquitetura. **Nada foi implementado.** Depende das confirmações pendentes em
> `docs/Auditoria_Fonte_Viva_Loja_V1.md`. **Correção confirmada pelo César:** Odhen e Teknisa são o
> mesmo sistema, mas ele **não acompanha o pedido depois de impresso** — o registro some da tela
> assim que a comanda sai. Por isso esta arquitetura combina **duas fontes**, não uma: o
> Odhen/Teknisa só para item/sequência (capturado no instante da impressão), e o **Gestor de
> Pedidos do iFood** para status/tempo real (é o que a equipe já usa hoje pra acompanhar o pedido).
>
> **Confirmações novas do César:** a impressora do caixa é uma **Epson TM-T20X**, e ela **passa pela
> fila normal de impressão do Windows** — isso torna a captura via fila de impressão (não banco de
> dados incerto) a aposta principal para item/sequência. A comanda é **única** — cozinha, sushi,
> quentes, sobremesa e demais itens saem todos juntos no mesmo "Relatório de Entrega", sem
> comanda separada por praça, o que simplifica o parser. Cancelamento deve ser lido do Gestor de
> Pedidos do iFood, nunca inferido da comanda. Reimpressão existe mas é rara — o capturador precisa
> de deduplicação mesmo assim.
>
> Este documento assume essa combinação e descreve como rodaria, com pontos de decisão explícitos
> onde uma confirmação futura muda a arquitetura.

---

## 1. Arquitetura recomendada (visão geral)

```
Computador Windows do caixa (loja)
  │
  ├─ Odhen/Teknisa (POS local) ──┬─ imprime "Relatório de Entrega" único (Epson TM-T20X,
  │                              │   fila normal do Windows — confirmado)
  │                              └─ some da tela ativa após imprimir (confirmado)
  │                                 [INCERTO] pode ou não gravar histórico em banco/arquivo
  │
  ├─ Gestor de Pedidos iFood (navegador dedicado, sessão à parte da equipe) ──
  │     status ao vivo: em preparo/pronto/em rota/atraso/CANCELADO
  │
  ├─ Capturador Local DeliveryOS (novo, leve, 2º plano) — DUAS sub-fontes, nunca escreve em nenhuma:
  │     (a) fila de impressão do Windows no instante em que o Odhen/Teknisa imprime (item/sequência)
  │     (b) leitura do Gestor de Pedidos no navegador (status/tempo/atraso)
  │     │
  │     ▼
  │   Parser de Comanda (docs/Parser_Comanda_Tecnisa_V1.md)
  │     transforma o registro bruto de (a) em pedido estruturado (itens, sequência, iFood)
  │     │
  │     ▼
  │   Casamento pelo código do iFood: junta o pedido de (a) com o status vivo de (b)
  │     │
  │     ▼
  │   Fila local de pedidos (arquivo/pasta, ex.: data/live/pedidos.jsonl — FORA do Git)
  │
  ▼
DeliveryOS (mesmo cérebro de sempre: motor.js + decisao.js, sem nenhuma mudança)
  │
  ▼
Servidor local (mesmo padrão de tools/servir_v1.js, servindo a Interface V1)
  │
  ├─ Monitor do caixa (navegador, mesma rede)
  ├─ Monitor do delivery/conferência (navegador, mesma rede)
  └─ Tablet da boqueta (navegador, mesma rede)
```

**Por que duas fontes, não uma:** esta separação já existe dentro do próprio `motor.js` — o
comentário do arquivo já distingue "(A) motor de TEMPO/ESTADO → REAL" de "(B) motor de PRAÇA →
SINTÉTICO enquanto não houver itens reais por pedido". O Gestor de Pedidos do iFood é literalmente o
Motor A ao vivo (hoje só chega por exportação pós-turno); o Odhen/Teknisa capturado na impressão é o
Motor B ao vivo (hoje só chega por composição sintética). Nenhuma peça nova de lógica — só duas
fontes novas alimentando a mesma separação que já existe.

**Princípio central:** o capturador é a ÚNICA peça nova. Ele nunca escreve em nenhuma das duas
fontes, nunca decide nada, só observa e traduz para o formato que o motor já entende (o mesmo
`NIGHT`/`rows` que `tools/gerar_janela_v1.js` já produz hoje a partir de dado histórico — a única
mudança é a fonte virar viva em vez de um arquivo gerado uma vez).

## 2. Componentes

1. **Capturador Local** (Windows, processo leve, 2º plano) — com **duas sub-partes independentes**:
   - **Sub-parte item/sequência:** só leitura na fila de impressão do Windows (ou no banco local do
     Odhen/Teknisa, se confirmado que existe e sobrevive à comanda sumir da tela). Precisa capturar
     no instante da impressão, porque não há onde consultar depois.
   - **Sub-parte status:** leitura passiva do Gestor de Pedidos do iFood, **num navegador dedicado**
     (nunca a aba que a equipe usa) — inclui status, tempo, atraso e **cancelamento** (nunca inferir
     cancelamento pela comanda). Não precisa capturar no instante — pode reconsultar quando quiser,
     já que o Gestor mantém o pedido visível até ele ser finalizado. Ver §3 para como lidar com
     muitos pedidos ao mesmo tempo, sem depender de rolagem/clique manual.
   - Nenhuma das duas escreve na fonte, nunca interage com o Odhen/Teknisa, com o iFood, ou com a
     impressora além de observar.
   - Casa as duas pelo **código do iFood** (campo comum às duas fontes) e grava o pedido
     unificado numa fila local simples (arquivo JSONL append-only, mesmo espírito do "log de fatos
     observados" que já rege o núcleo do DeliveryOS).
   - Tem 3 estados visíveis por sub-parte: **conectado**, **aguardando**, **erro** — sem tela cheia,
     só um ícone de bandeja (system tray) ou linha de status mínima.
   - Tem um botão/atalho de **pausa** que interrompe a leitura sem desligar o processo.
   - Grava log simples (arquivo texto, rotação diária) — só para diagnóstico, nunca dado sensível.

2. **Parser de Comanda** — módulo que interpreta o registro bruto do item/sequência (linha de banco
   ou texto do job de impressão) e produz o pedido estruturado. Ver
   `docs/Parser_Comanda_Tecnisa_V1.md`. Um segundo parser, mais simples, interpreta o status do
   Gestor de Pedidos (em preparo/pronto/em rota/atraso).

3. **Fila local de pedidos** — arquivo JSONL (append-only, mesmo padrão de
   `data/ifood_real.jsonl` já gerado por `npm run ingest`), guardado fora do Git
   (`docs/Politica_Dados.md` já cobre isso). Cada linha já é o pedido casado (itens + status).

4. **Ingestão no DeliveryOS** — o motor (`motor.js`) já tem o "seam" certo para isso:
   `makeFonteItensFromRows`/`makeFonteItensFromJson` já existem exatamente para receber linhas de
   pedido de qualquer fonte real (documentado no próprio `motor.js`: "ÚNICO ponto a trocar quando
   houver KDS/impressora/API iFood"). **Não precisa mudar uma linha do motor** — só trocar de onde
   vêm as `rows`.

5. **Servidor local + telas** — já existe (`tools/servir_v1.js`). A única mudança (fora do escopo
   desta missão, é implementação futura) seria o `app-v1` ler a fila viva em vez do arquivo de
   janela gravada, e recarregar a tela quando chegam pedidos novos (poll simples a cada poucos
   segundos, sem WebSocket — mais simples e suficiente para o volume de uma loja).

## 3. Captura do Gestor iFood com muitos pedidos

> Dúvida do César: com muitos pedidos ao mesmo tempo, nem todos ficam visíveis na tela do Gestor sem
> rolar/clicar. Como capturar todos sem depender de um operador? Detalhe técnico completo em
> `docs/Auditoria_Fonte_Viva_Loja_V1.md` §6 — aqui fica só a decisão de arquitetura.

**Regra de segurança que vale para todo este componente:** só observar, rolar e ler. **Nunca clicar**
em pronto, cancelar, chat, enviar mensagem ou qualquer botão que altere o pedido real.

### 3.1 Componente escolhido: leitura passiva do DOM, em navegador dedicado

- **Sub-componente "Leitor de Status"**: um navegador (ou perfil de navegador) **dedicado ao
  DeliveryOS**, logado no Gestor de Pedidos, **nunca a mesma janela/sessão que a equipe opera**. Lê
  o HTML da página já carregada, sem clicar em nada.
- **Primeiro modo (preferido): leitura em repouso.** Se os cartões de todas as colunas já estiverem
  no HTML da página (mesmo os que exigem rolagem para aparecer na tela), o Leitor de Status só
  precisa reler o documento a cada poucos segundos — sem simular rolagem, sem simular clique, risco
  mínimo. **Precisa ser confirmado por inspeção antes de decidir** (teste em `Auditoria` §6.8).
- **Segundo modo (se o primeiro não for suficiente): rolagem simulada, sem clique.** Se o painel só
  carrega mais cartões quando o usuário rola (paginação infinita), o Leitor de Status simula rolagem
  (scroll, não clique) na janela dedicada para forçar o carregamento de todos os cartões, sempre na
  sessão separada, nunca na da equipe.
- **Itens detalhados (abrir o pedido):** só entram em cena se a fila de impressão (item 3.2 abaixo)
  não for suficiente sozinha. Se precisar, é a única situação em que o Leitor "abre" um pedido — e
  mesmo assim só para ler, nunca para agir, com uma lista de seletores restrita e revisada por
  humano antes de qualquer atualização.

### 3.2 Por que a fila de impressão reduz a necessidade de abrir pedidos no Gestor

Como a Epson TM-T20X confirmada passa pela fila normal do Windows, e a comanda é única (todos os
itens juntos, sem separação por praça), **os itens já vêm pela fila de impressão** — o Gestor de
Pedidos passa a ser necessário só para **status, tempo, atraso e cancelamento**, que já aparecem no
resumo do cartão, **sem precisar abrir pedido nenhum**. Isso reduz drasticamente o problema de
"muitos pedidos escondidos": não é preciso abrir cada um, só ler o resumo de cada cartão visível
(ou carregado) no DOM.

### 3.3 Onde isso roda (hardware/sessão)

- **Piloto (recomendado):** segunda aba/perfil no mesmo computador do caixa, minimizada, sem
  interface visível pra equipe — suficiente para o volume de uma loja e para o primeiro teste.
- **Se crescer:** computador/mini-PC dedicado, com o navegador em modo **quiosque** (tela cheia, sem
  barra de endereço/menu), perfil de login próprio do DeliveryOS — isola qualquer travamento da
  leitura de qualquer sistema que a equipe usa para operar de verdade.
- **Nunca:** a mesma aba/janela que a equipe usa para operar. Nunca o mesmo login/sessão, quando
  possível ter um separado.

### 3.4 Como evitar atrapalhar a equipe

- Leitura só em segundo plano, sem janela visível na sessão operacional.
- Sem popups, sem notificações sonoras na sessão da equipe.
- Se a leitura falhar ou travar, o pior caso é a tela do DeliveryOS ficar desatualizada — **nunca**
  deve travar, atrasar ou interferir na sessão que a equipe usa pra operar.

### 3.5 Como impedir clique perigoso

- Lista de seletores permitidos extremamente restrita (só "abrir detalhe", nunca botão de ação).
- Nenhuma automação de clique em botões verdes/vermelhos/de ação, nunca.
- Revisão humana obrigatória antes de qualquer atualização do capturador que mexa em seletores.
- Modo de leitura que nunca envia formulário, nunca aperta Enter, nunca envia tecla — só lê.

## 4. Fluxo de dados

```
Odhen/Teknisa imprime pedido (some da tela ativa logo em seguida)
        │
        ▼
Capturador Local detecta o job na fila de impressão NO INSTANTE em que acontece
        │
        ▼
Parser de Comanda extrai {sequencia, ifood, pedido_interno, itens[], observacoes, horario}
        │
        ▼
Guarda esse registro numa tabela temporária "aguardando status" (chave: código do iFood)
        │
        ▼                                          Gestor de Pedidos iFood (navegador)
        │                                                    │
        │                                     Capturador de status lê o cartão do pedido
        │                                     (tempo decorrido, atraso, coluna: em preparo/
        │                                      pronto/em rota/finalizado)
        │                                                    │
        └──────────────── casamento pelo código do iFood ────┘
        │
        ▼
Grava 1 linha (pedido completo: itens + status) no arquivo JSONL local (append-only)
        │
        ▼
DeliveryOS (processo separado, ou o mesmo) lê o JSONL, monta INFO via MOTOR.resolver
        │
        ▼
Servidor local expõe o snapshot atual pro navegador
        │
        ▼
Telas do caixa/delivery/tablet mostram Calmo/Ambiente/Foco em cima do pedido real
```

**Nó de risco explícito:** se o pedido aparecer no Gestor de Pedidos antes de ser impresso (ou
vice-versa), o casamento por código do iFood pode chegar incompleto por alguns segundos — isso é
aceitável (o pedido só entra no motor quando as duas metades existirem), nunca deve virar um pedido
"inventado" com metade do dado.

## 5. Segurança e permissões

- **Nunca ler senha** de nenhum sistema (Odhen/Teknisa, iFood, Windows).
- **Nunca capturar dado financeiro** além do mínimo operacional (ex.: não precisa da forma de
  pagamento nem do valor total para decidir praça/sacola — só usar se for puramente para conferência
  visual, nunca para decisão).
- **Nunca capturar conversa** (chat do iFood com o cliente).
- **Dado pessoal mínimo**: nome do cliente só se for necessário para localizar o pedido na tela;
  telefone e endereço **não** precisam entrar no DeliveryOS (o motor não usa nenhum dos dois hoje).
- **Rodar com o menor privilégio possível** — o capturador não deveria precisar de administrador do
  Windows; se precisar (ex.: para ler a fila de impressão), documentar exatamente por quê antes de
  pedir essa permissão à loja.
- **Nunca escrever de volta** no Odhen/Teknisa, no iFood ou na impressora — via de mão única.
- **Dado bruto e gerado não entra no Git** (mesma regra já em vigor, `docs/Politica_Dados.md`).

## 6. Como rodaria no Windows

- Processo leve (Node.js, mesma linguagem do resto do projeto — sem dependência nova além do que já
  existe hoje, tipo `xlsx`/`fs` nativo).
- Pode rodar como:
  - **Script manual** (primeira fase de teste — o César ou alguém da equipe roda antes do turno);
  - **Tarefa agendada do Windows** (Task Scheduler, inicia sozinho com o Windows, mais robusto);
  - **Serviço do Windows** (só se o teste manual/tarefa agendada provarem estabilidade antes).
- Ícone de status na bandeja (ou uma janela minimizada mínima) mostrando conectado/aguardando/erro.
- Nunca abre janela grande, nunca pede input durante o turno (Lei 3 — sistema não vira operador do
  próprio sistema).

## 7. Como a tela atualizaria

- Sem WebSocket nem infraestrutura nova: um **poll simples** do navegador a cada poucos segundos
  (ex.: `fetch` num arquivo/endpoint local), recarregando o snapshot do minuto atual — o mesmo modelo
  de "um estado por minuto" que já rege todo o produto (`docs/Contrato_Estado_Cognitivo_V1.md`).
- Se o pedido novo mudar o Foco/Ambiente/Calmo, a tela troca de estado sozinha, sem ação do operador
  — exatamente a promessa do produto ("o sistema chama, você não procura").

## 8. Como conectar caixa, delivery e tablet

Mesma rede local (Wi-Fi da loja), mesmo padrão já usado no `servir_v1.js` hoje: um único servidor
Node rodando no computador do caixa (ou em qualquer máquina da rede local), acessível por IP interno
em cada dispositivo — sem precisar de internet, sem precisar de nuvem, sem custo de hospedagem. O
monitor extra que a loja está disposta a comprar entraria aqui, ligado ao mesmo Windows do caixa (ou
a outro PC/mini-PC na mesma rede) rodando o navegador em tela cheia.

## 9. Plano de rollout (progressivo, nunca tudo de uma vez)

1. **Fase sombra** — capturador roda, grava a fila local, **não mostra nada pra ninguém**. Serve só
   para provar que a captura funciona e não interfere na impressão. Dias de teste: segunda (baixo
   movimento) primeiro.
2. **Fase leitura visível, sem cobrança** — a tela aparece num monitor extra, mas ninguém é
   obrigado a olhar; é só para a equipe começar a se acostumar e dar feedback informal.
3. **Fase piloto assistido** — testar durante pico real (sexta/domingo), com alguém observando se
   atrapalha ou ajuda, pronto para desligar a qualquer sinal de problema.
4. **Fase operacional** — só depois de 1, 2 e 3 validados, o capturador vira parte do dia a dia,
   com tarefa agendada / serviço do Windows.

Cada fase só avança com aprovação explícita do César, na mesma disciplina do resto do projeto
(`docs/Politica_Dados.md`, `CLAUDE.md` §4: nunca integrar sem passar por aprovação humana).

## 10. Decisões que ainda dependem de confirmação (ver Auditoria §8)

- **Prioridade atualizada:** a fila de impressão do Windows (item/sequência) é agora a aposta
  principal, não mais um plano B — a Epson TM-T20X confirmada usando a fila normal do Windows torna
  essa captura direta e sem depender de conhecer a estrutura interna do Odhen/Teknisa.
- Se, mesmo assim, for confirmado que existe banco/arquivo local acessível do Odhen/Teknisa (e que
  ele sobrevive ao pedido sumir da tela ativa), o "Capturador Local" pode passar a lê-lo como
  melhoria futura — mais rico, mas nunca pré-requisito do piloto.
- Se o DOM do Gestor de Pedidos não carregar todos os cartões de uma vez (paginação infinita, ver
  §3.1), o Leitor de Status precisa de rolagem simulada — a arquitetura do §3 já prevê os dois casos.
- Se nenhuma das opções de item/sequência funcionar no curto prazo, a Fase sombra pode rodar só
  sobre o Gestor de Pedidos como ponte de baixíssimo risco, sabendo que faltará a sequência interna
  até a fila de impressão ser destravada.
