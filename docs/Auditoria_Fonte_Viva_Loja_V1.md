# Auditoria — Fonte Viva da Loja (Tecnisa/Odhen, iFood e Impressão)

> Auditoria técnica e operacional. **Diagnóstico apenas — nenhum código foi implementado.** Objetivo:
> descobrir o melhor caminho para o DeliveryOS ler pedidos reais da loja quase em tempo real, sem
> depender de arquivo manual, sem arriscar a impressão, sem tocar em senha/financeiro/conversa.
> Sobre o commit `479bebd`. `motor.js`, `decisao.js`, `app-v1/` e `data/` intocados.

---

## 0. Sobre as evidências usadas nesta auditoria

Analisei 5 fotos anexadas à missão (tela do sistema local, tela do Gestor de Pedidos iFood, e 3
comandas impressas reais). **Não consegui processar o vídeo anexado**
(`WhatsApp Video 2026-07-07 at 04.15.27.mp4`) — não há ferramenta de extração de frame/vídeo
disponível nesta sessão. Se ele mostra algo relevante (ex.: o fluxo físico da comanda, a impressora,
a tela em uso ao vivo), preciso que descreva o que está nele ou que envie como imagens/frames.

**Nenhuma foto, nome de cliente, telefone, endereço ou número de pedido real foi copiado para este
documento.** Onde cito a estrutura de um documento real, os valores de exemplo são fictícios — só a
**forma** dos campos é fiel ao que foi fotografado.

## 1. Nome do sistema — resolvido pelo César

**Confirmado pelo César: Odhen e "Tecnisa" (grafia real: Teknisa) são o mesmo sistema.** As fotos
mostram o cabeçalho **"odhen automação comercial"** e **"ForSale web"** — esse é o software; o
nome que a missão usava ("Tecnisa"/Teknisa) é como a equipe se refere a ele no dia a dia (marca do
revendedor/linha de produto). Este documento segue chamando o sistema de **"Odhen/Teknisa"** para
não perder a referência às duas formas já usadas em conversas anteriores.

A tela fotografada mostra uma legenda de status: **Pendente, Em Produção, Produzido, Impresso,
p/Entregar, To Go, Expedido, Cancelado, Encomenda** — e um erro de NFC-e ("Erro nfceService! -1
Nenhum certificado"), confirmando que o mesmo sistema também emite nota fiscal. Os 3 comprovantes
impressos fotografados têm o cabeçalho **"Relatório de Entrega"**, com "Pedido" sequencial de 10
dígitos (`0000NNNNNN`) — mesmo padrão de numeração do sistema visto na primeira tela.

**Atenção: essa legenda de status NÃO significa que o sistema acompanha o ciclo de vida do pedido
depois de impresso — ver correção crítica na §3, abaixo.**

## 2. Diagnóstico operacional (o que está confirmado por foto + o que é relato do César)

**Confirmado por foto:**
- Existe um sistema local Windows (Odhen/Teknisa) que lista pedidos, tem status internos por pedido,
  e imprime um "Relatório de Entrega" por pedido.
- Existe o **Gestor de Pedidos do iFood** aberto no navegador, com cartões por pedido agrupados em
  colunas **Em preparo / Pronto / Em rota / Finalizados**, cada cartão mostrando o código curto do
  iFood, primeiro nome do cliente, tempo decorrido e atraso (ex.: "Atraso 29min"). Contagem de
  pedidos por coluna também aparece (ex.: "Em preparo 20", "Pronto 3").
- O "Relatório de Entrega" impresso traz: `Operador`, `Entregador` (código + nome/zona, ex.: "3004 -
  DELIVERY ITAIM"), `Emissão` (data/hora), `Pedido` (sequencial interno do Odhen/Teknisa),
  `Agendamento`, `IFOOD......` (o código curto do iFood — bate com o que já chamamos de "ID CURTO"
  nos dados), `Consumidor`, `Tel. Consumidor` (número institucional/proxy do iFood, não o celular
  real do cliente), `Origem`, endereço (`Quadrante`, rua/número/complemento, bairro, CEP, cidade),
  `Referência`, `OBS.` (no exemplo visto: dado de pagamento/ID de transação/código de cancelamento —
  **não** uma observação do prato), `Formas de Pagamento`, `Produtos Vendidos` (nome, quantidade,
  preço unitário, subtotal), `TOTAL`, e repetição do `IFOOD` e `Pedido` no rodapé.
- **Existe uma camada manual de correção física**: numa das comandas fotografadas, dois itens
  aparecem riscados à caneta com a anotação "não foi" — ou seja, a impressão nem sempre reflete o
  estado final do pedido; alguém corrige à mão depois de imprimir.
- **Existe assinatura manual** em pelo menos duas comandas ("Samara") — sugere que quem monta/confere
  assina o comprovante físico hoje.
- Um dos comprovantes trazia um item com prefixo **"LETRA B"** antes do nome do combinado — indício
  de que os combinados têm um código de letra no sistema, além do nome.

**Relato do César:**
- iFood é o canal principal; app próprio (Animo) e WhatsApp têm menor volume.
- A comanda "nasce" no Odhen/Teknisa, não diretamente no iFood.
- Computador do caixa é Windows, fica ligado o turno inteiro, com internet estável.
- A equipe usa a **sequência interna** (3-4 últimos dígitos visíveis na comanda) como identificador
  no chão — não o código do iFood, e não o nome do cliente.
- Duas sacolas é decidido hoje por quem monta a sacola no caixa, sem apoio de sistema.
- **Confirmado pelo César, corrigindo a hipótese anterior desta auditoria:** o Odhen/Teknisa **não
  acompanha o estado do pedido depois de impresso** — assim que a comanda é impressa, o pedido **some
  da tela** do Odhen/Teknisa. A equipe acompanha o ciclo de vida (em preparo, pronto, em rota,
  finalizado, atraso) **pelo Gestor de Pedidos do iFood**, não pelo Odhen/Teknisa.
- O César não tem certeza se o Odhen/Teknisa processa/grava algum arquivo local, mas acredita que
  sim ("não sei se processa o arquivo local, mas acredito que sim") — **isso continua sendo hipótese
  a confirmar**, não fato. **Não presumir que existe banco ou log** até confirmação por inspeção
  segura no Windows ou pergunta direta ao suporte do fornecedor.

**Confirmações novas do César (rodada 2):**
- **Impressora confirmada: Epson TM-T20X**, térmica, e **passa pela fila normal de impressão do
  Windows** (não é uma conexão direta que pula o spool). Isso é uma boa notícia técnica: aumenta a
  viabilidade das opções 1/2 (capturar via fila de impressão do Windows), porque a impressora usa o
  caminho padrão do sistema operacional, não um caminho proprietário fechado.
- **Não existe comanda separada por praça.** Cozinha, sushi, quentes, sobremesa e demais itens do
  pedido **vão todos juntos na mesma comanda** ("Relatório de Entrega") impressa pelo Odhen/Teknisa —
  não há um documento de produção separado por bancada nesta operação. Isso resolve a incerteza da
  §6 anterior (risco de "instabilidade de layout" por documento de cozinha diferente) e **simplifica
  o parser**: só existe um formato de comanda a interpretar.
- **Cancelamento não deve ser lido pela comanda.** O status de cancelado aparece no **Gestor de
  Pedidos do iFood** — o DeliveryOS não deve tentar inferir cancelamento a partir do papel impresso.
- **Reimpressão acontece, mas é rara.** Ainda assim, o capturador precisa de uma forma de
  deduplicar (mesmo `pedido_interno` + mesma comanda impressa de novo não deveria virar um segundo
  pedido no DeliveryOS).
- **O Gestor de Pedidos do iFood mostra itens detalhados ao abrir o pedido** (clicar no cartão) — ou
  seja, pode servir como **fonte complementar de itens**, além de status. Mas isso levanta a dúvida
  crítica do César, aprofundada na nova §6 abaixo: **com muitos pedidos ao mesmo tempo, nem todos
  ficam visíveis na tela sem rolar/clicar — como capturar todos sem depender de um operador clicando
  manualmente em cada um?**

## 3. Correção crítica — a legenda de status do Odhen/Teknisa é SÓ pré-impressão

**Isto muda a recomendação desta auditoria.** A leitura inicial (legenda "Pendente → Em Produção →
Produzido → Impresso → p/Entregar/To Go → Expedido") sugeria que o Odhen/Teknisa acompanhava o
pedido do início ao fim. **O César corrigiu: não acompanha.** Essa legenda de status descreve, no
máximo, o estado **até o momento da impressão** — depois disso o registro sai da tela ativa, e quem
de fato acompanha o ciclo de vida operacional (produção → pronto → em rota → entregue, com atraso)
é o **Gestor de Pedidos do iFood** (a segunda tela fotografada), que já é exatamente a mesma fonte
que gera o relatório histórico que o motor já usa hoje (Motor A — tempo/estado, real).

**Consequência direta para a arquitetura:** não existe UMA fonte única que resolve tudo. O
DeliveryOS provavelmente precisa de **duas fontes combinadas, exatamente espelhando a separação que
já existe dentro do próprio motor.js** (comentário do arquivo: "(A) motor de TEMPO/ESTADO → REAL...
(B) motor de PRAÇA → SINTÉTICO enquanto não houver itens reais por pedido"):

- **Motor A (tempo/estado)** ← viria do **Gestor de Pedidos do iFood** (opção 7), que já é a fonte
  viva do que hoje só chega por exportação pós-turno. É aqui que mora "quanto tempo", "atrasado",
  "em rota".
- **Motor B (composição/praça)** ← viria do **Odhen/Teknisa**, mas só captável **no instante da
  impressão** (via opção 1/2, fila de impressão, ou opção 6, banco local, **se e somente se** o
  registro sobreviver ali mesmo depois de sumir da tela ativa — isso ainda não está confirmado).

Isso **eleva a importância da opção 7** (deixou de ser só um complemento de baixo risco e virou a
fonte primária de status/tempo real) e **reduz a certeza sobre a opção 6** (o banco local pode até
existir, mas se ele só guarda o pedido "ativo" e o apaga/move quando a tela some, pode não servir
para reconstruir o histórico — precisa confirmar se existe uma tabela histórica separada da tela
ativa).

## 4. Comparação técnica das fontes possíveis

| Opção | Viabilidade | Risco de quebrar impressão | Latência | Traz itens? | Traz sequência? | Traz nº iFood? | Depende de senha? | Ação manual? | Tempo real? | Segundo plano? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Spool de impressão do Windows | **Alta — confirmado: Epson TM-T20X passa pela fila normal do Windows**, não por caminho proprietário | Baixo se só leitura, alto se reconfigurar o driver | Baixa (no instante da impressão) | Sim, se o texto no job for legível | Sim (é a própria comanda, única, sem separação por praça) | Sim | Não | Não | Quase | Sim |
| 2. Fila de impressão (enumerar jobs via API) | **Alta** — API do Windows é padrão, e o caminho confirmado (fila normal) é exatamente o que essa opção lê | Muito baixo (só leitura, não altera a fila) | Baixa | Sim, se conseguir o conteúdo do job | Sim | Sim | Não | Não | Quase | Sim |
| 3. Porta/impressora térmica direta (interceptar o cabo/porta) | Baixa-média | **Alto** — insere um ponto de falha físico no caminho até a impressora | Baixa | Sim | Sim | Sim | Não | Não | Sim | Sim |
| 4. Arquivos temporários/logs/cache do Odhen/Teknisa | Desconhecida — precisa inspecionar a instalação local | Nenhum (só leitura) | Depende do quão frequente o app escreve | Talvez | Talvez | Talvez | Não | Não | Talvez | Sim |
| 5. Exportação/relatório do Odhen/Teknisa | Desconhecida — não confirmado se existe exportação em lote | Nenhum | Alta (manual) se só existir exportação manual | Provavelmente sim | Sim | Sim | Possível (login) | Sim, se manual | Não | Não, se manual |
| 6. Banco de dados local do Odhen/Teknisa | Incerta — o César não confirma se existe/é acessível; **e mesmo se existir, só serviria para item/sequência no instante da impressão**, não para status pós-impressão (confirmado: o pedido some da tela ativa depois de impresso) | Nenhum, se acesso for só leitura | Baixa, só para o snapshot de impressão | Sim, se existir | Sim, se existir | Sim, se existir | Não, se acesso local direto | Não | **Não** para status pós-impressão | Sim |
| 7. Gestor de Pedidos iFood aberto no navegador | Alta — já está aberto e visível; **confirmado pelo César como a fonte real de acompanhamento pós-impressão** (em preparo/pronto/em rota/atraso/**cancelamento**) | Nenhum (não toca no POS nem na impressão) | Baixa-média | **Confirmado: mostra itens detalhados ao abrir o pedido** — mas com pico de muitos pedidos, incerto se todos ficam acessíveis sem rolar/clicar (ver §6) | **Não** (só mostra o código do iFood, não a sequência interna) | Sim | Não, se já logado | Não, se leitura passiva do DOM; sim, se precisar abrir cada pedido | **Sim** — é a fonte viva real de status | Sim |
| 8. Exportação manual do iFood (fallback) | Alta, mas manual | Nenhum | Alta (só pós-turno) | Sim | Não | Sim | Sim (login) | Sim | Não | Não |
| 9. OCR de foto/comanda | Baixa para produção | Nenhum | Alta (precisa fotografar cada uma) | Sim, com erro | Sim, com erro | Sim, com erro | Não | Sim (fotografar) | Não | Não |
| 10. Digitação manual assistida | Só para validação/teste | Nenhum | Alta | Sim (com erro humano) | Sim | Sim | Não | Sim (tudo) | Não | Não |

## 5. Recomendação (revisada após a correção do César)

**Não existe mais um "melhor caminho único" — a recomendação passa a ser uma combinação de duas
fontes**, espelhando a separação que o próprio `motor.js` já assume entre tempo/estado (real) e
composição/praça:

**Melhor caminho para STATUS/TEMPO REAL/CANCELAMENTO (Motor A):** opção **7 — Gestor de Pedidos do
iFood no navegador**, lido de forma **passiva** (opção A da §6: DOM em repouso, sem clicar, sem
rolar se possível). O César confirmou que é isso que a equipe já usa para acompanhar o pedido depois
de impresso, incluindo cancelamento. É também a opção de menor risco (não toca em nada da loja) e a
mais simples de validar primeiro.

**Melhor caminho para ITENS/SEQUÊNCIA (Motor B):** capturar o Odhen/Teknisa **no instante da
impressão**, via **fila de impressão do Windows (opção 1/2)** — esta opção **subiu de prioridade**
nesta rodada: a impressora está confirmada como Epson TM-T20X passando pela **fila normal do
Windows**, exatamente o caminho que essas opções leem. O banco/arquivo local (opção 6) segue como
possível fonte melhor, mas **incerta** — o César não confirma se existe ou é acessível, e não deve
ser presumida.

**Ordem de prioridade prática (atualizada):**
1. Validar opção 7 primeiro (zero risco, já destrava status/tempo/cancelamento) — inclui o teste de
   inspeção do §6.8 (DOM carrega tudo ou só sob rolagem?).
2. Validar a fila de impressão (opção 1/2) em paralelo — a confirmação da Epson TM-T20X na fila
   normal do Windows torna esta opção a aposta principal para itens/sequência, não mais um plano B.
3. Só investigar banco/arquivo local (opção 6) como melhoria futura, depois que 1 e 2 estiverem
   validadas — nunca como pré-requisito do piloto.

**Não vale a pena como caminho principal:** opção 8 (exportação manual do iFood) e opção 5
(exportação do Odhen/Teknisa, se só existir manual) — manual, tardio, baixa confiabilidade durante
o turno.

**Caminho perigoso, evitar:** opção **3 — interceptar a porta/cabo da impressora térmica
diretamente**. É o único caminho que insere um ponto de falha físico exatamente onde a missão pede
zero risco ("não quebrar impressão é obrigatório"). Só considerar se as opções 1/2/6 forem
comprovadamente inviáveis, e mesmo assim com uma impressora de teste antes da loja real.

**OCR (opção 9) e digitação manual (opção 10)** ficam só como rede de segurança para validar dados
durante os testes (comparar o que o capturador leu com o papel físico), nunca como fonte de produção.

## 6. Captura do Gestor iFood com muitos pedidos

> Dúvida crítica do César: quando existem muitos pedidos no Gestor de Pedidos e nem todos aparecem
> na tela ao mesmo tempo, como o DeliveryOS capturaria todos sem que um operador precise rolar,
> clicar e abrir cada um manualmente? **Só investigação — nada foi implementado.**

**Regra de segurança que governa toda esta seção:** o DeliveryOS pode **observar, rolar e ler** numa
sessão dedicada. Ele **nunca pode clicar** em ações operacionais — pronto, cancelar, chat, enviar
mensagem, alterar status, ou qualquer botão que mude o pedido real. Read-only, sempre.

### 6.1 É possível capturar pedidos que não estão visíveis na tela?

Depende de qual das opções abaixo for usada — não há uma resposta única sem inspecionar a página
real do Gestor de Pedidos (o que esta auditoria não fez; foi só observada por foto). As opções A, B
e C respondem isso de formas diferentes.

### 6.2 Opção A — Leitura direta do DOM do navegador

A maioria dos painéis do tipo "cartões em coluna com rolagem" (Em preparo / Pronto / Em rota /
Finalizados) **carrega todos os cartões da lista no HTML de uma vez**, e só usa CSS/rolagem para
esconder visualmente o que não cabe na tela — isso é o padrão mais comum em dashboards web
modernos, mas **não é garantido**; alguns painéis usam "paginação infinita" (só carregam mais
cartões quando o usuário rola até o fim, ou quando pede a próxima página).

- **Se os cartões carregam todos no DOM de uma vez:** o capturador pode ler o HTML da página inteira
  sem precisar rolar ou clicar — mais simples, mais seguro, sem risco de interação acidental.
- **Se for paginação infinita:** o capturador precisaria simular rolagem (sem clicar em nada) para
  forçar o carregamento dos cartões restantes — mais parecido com a opção B.
- **Detalhe do pedido (itens):** pela foto, o resumo do cartão (nome, tempo, atraso) parece estar
  sempre visível; os **itens detalhados só aparecem ao clicar/abrir o pedido** — isso não é algo que
  dá pra saber sem abrir (ou seja, ler só o DOM em repouso não traria itens, só o resumo).
- **Viabilidade:** alta se o painel carrega tudo no DOM; média-baixa se depender de rolagem.
- **Risco de atrapalhar a operação:** nenhum, se for só leitura passiva do HTML já carregado.

### 6.3 Opção B — Automação controlada de navegador dedicado

Um navegador (ou perfil de navegador) **separado do que a equipe usa**, controlado por automação
(no estilo Playwright/Puppeteer — sem instalar nada agora, só avaliando o conceito), que poderia:
rolar a lista, abrir um pedido para ler os itens, fechar, passar para o próximo.

- **Nunca pode ser a janela que a equipe usa** — a automação roda numa janela/perfil/computador à
  parte, e a equipe segue usando a *sua própria* aba do Gestor de Pedidos, sem saber que existe uma
  segunda sessão de leitura.
- **Risco de clique perigoso é o maior risco desta opção.** Qualquer automação que "clica" corre o
  risco de, por um seletor errado ou uma mudança de layout do iFood, clicar em "Pronto" ou
  "Cancelar" por engano. Mitigação: (a) lista de seletores permitidos, extremamente restrita, só
  para abrir/fechar detalhe de pedido; (b) nunca automatizar nenhum botão de ação (verde/vermelho);
  (c) modo de leitura que só abre o pedido para ler e sai, nunca interage com formulário nenhum;
  (d) revisão humana antes de qualquer atualização da automação.
- **Precisa de navegador dedicado:** sim, sempre — nunca reaproveitar a sessão logada que a equipe
  usa para operar.
- **Precisa de computador dedicado:** não necessariamente — pode rodar numa segunda janela do mesmo
  Windows do caixa (se tiver memória/CPU sobrando), mas um mini-PC ou computador de baixo custo
  dedicado só para isso é **mais seguro** (isola qualquer travamento da automação de atrapalhar o
  caixa real).
- **Viabilidade:** média — funciona, mas é a opção com maior superfície de risco entre as três (A/B/C).

### 6.4 Opção C — Leitura das chamadas de rede do navegador

Painéis modernos como o Gestor de Pedidos normalmente buscam dados por chamadas internas (API
JSON) que o navegador já recebe para desenhar a tela — **em teoria**, seria possível observar essas
respostas (sem repetir login, sem enviar nada, só "escutando" o que o navegador já baixou) e extrair
os pedidos de lá, com muito mais dado estruturado do que o HTML visual.

- **Não implementar, não burlar autenticação, não coletar senha, não guardar cookie no
  repositório** — essas são as instruções explícitas desta missão, e valem tanto por segurança
  quanto porque usar a sessão autenticada da equipe sem entender os termos de uso do iFood é
  arriscado.
- **Avaliação técnica, sem implementar:** se for viável (o Gestor realmente carrega por API JSON, o
  que é provável mas não confirmado), essa seria a opção **tecnicamente mais rica** — dados
  estruturados, sem depender de HTML/CSS, sem precisar simular clique ou rolagem. Mas também é a que
  mais precisa de cuidado (é fácil cruzar a linha de "ler o que já chegou" para "se autenticar
  sozinho", que não é o objetivo aqui).
- **Recomendação desta auditoria:** não perseguir esta opção agora. Fica registrada como possibilidade
  técnica futura, só se as opções A/B/D se mostrarem insuficientes, e só com uma análise de termos de
  uso do iFood antes de qualquer implementação.

### 6.5 Opção D — Fila de impressão como fonte principal, Gestor iFood só para status

Com a impressora Epson TM-T20X confirmada passando pela **fila normal do Windows**, esta opção
ganhou força: se a fila de impressão já entrega sequência, código do iFood e itens (a comanda
inteira, já que não há comanda separada por praça), então **o Gestor de Pedidos deixa de precisar
entregar itens** — ele só precisaria entregar **status, tempo, atraso e cancelamento**, que são o
resumo do cartão, sempre visível, sem precisar abrir o pedido.

- **Isso reduz muito a necessidade de lidar com "muitos pedidos escondidos"** — se o Gestor só
  precisa do resumo de cada cartão (não dos itens), a leitura fica mais parecida com contar/somar o
  que está visível em cada coluna (que já aparece: "Em preparo 20", "Pronto 3" etc.) do que com abrir
  pedido por pedido.
- Os itens detalhados do Gestor (opção 6.2/6.3, ao abrir o pedido) ficariam reservados só para
  **conferência/auditoria eventual** (comparar com o que a fila de impressão capturou), não como
  fonte principal do dia a dia.
- **Esta é a combinação recomendada** — ver §5 atualizada acima: fila de impressão para
  itens/sequência (via opção 1/2), Gestor iFood para status/atraso/cancelamento (via leitura do DOM
  em repouso, opção A, sem precisar abrir pedido nenhum).

### 6.6 Opção E — Modo dedicado de leitura (configuração física recomendada)

Propostas de configuração, da mais simples para a mais robusta:

1. **Mínima:** o próprio computador do caixa, com uma segunda aba do navegador aberta só para
   leitura (nunca a aba que a equipe usa para operar), em modo minimizado ou numa tela pequena.
2. **Intermediária (recomendada para o piloto):** um **segundo monitor** ligado ao mesmo computador
   do caixa, mostrando a Interface V1 do DeliveryOS (não o Gestor de Pedidos cru) — a leitura roda em
   segundo plano, sem janela visível pra equipe nenhuma.
3. **Robusta (se o piloto validar e crescer):** um **computador/mini-PC dedicado só para o
   DeliveryOS**, com seu próprio perfil de navegador logado no Gestor de Pedidos em modo
   **quiosque** (tela cheia, sem barra de endereço, sem menu) — isola qualquer travamento da
   automação de qualquer sistema que a equipe usa para operar de verdade.
4. **Tablet da boqueta:** só recebe a tela final do DeliveryOS (servida pela rede local, mesmo
   padrão do `servir_v1.js`) — nunca roda a automação/leitura ele mesmo.

**Usuário/perfil separado:** sempre que possível, usar um login/perfil de navegador **próprio do
DeliveryOS**, diferente do perfil que a equipe usa — evita qualquer mistura de sessão e deixa claro,
em auditoria, qual ação foi da equipe e qual foi (só leitura) do capturador.

### 6.7 Como casar dados do Gestor iFood com a comanda do Odhen/Teknisa

Pelo código do iFood (`IFOOD......` na comanda, o mesmo número visível no cartão do Gestor) — é o
único campo confirmado presente nas duas fontes. O pedido só entra no motor quando as duas metades
existirem (ver `docs/Arquitetura_Sincronizacao_Local_V1.md` §3, "nó de risco explícito").

### 6.8 Primeiro teste seguro para esta parte específica

**Ler o DOM do Gestor de Pedidos em repouso** (opção A), sem rolar, sem clicar, só para responder
uma pergunta binária: **os cartões que não cabem na tela (exigem rolagem) já estão no HTML, ou só
aparecem quando o usuário rola?** Isso é testável manualmente por qualquer pessoa com acesso ao
navegador (abrir as ferramentas de desenvolvedor, inspecionar o HTML, contar quantos cartões existem
no documento vs. quantos estão visíveis na tela) — **não precisa de nenhum código novo, é só
inspeção**, e a resposta define se a opção A sozinha resolve o problema ou se precisa de B.

## 7. Riscos

1. **O Odhen/Teknisa pode não ter fonte histórica alguma** — se o pedido só existe na tela enquanto
   está ativo e some sem deixar rastro em disco, a única forma de capturar item/sequência é
   observar a impressão no exato instante em que acontece (opção 1/2) — não há "consultar depois".
   **Não presumir que existe banco ou log** até confirmação.
2. **Correção manual pós-impressão não é detectável automaticamente** ("não foi" a caneta) —
   **confirmado pelo César**: essa correção fica só no papel, não aparece no iFood. Esta é uma
   **limitação permanente desta V1**, não um risco a mitigar — o DeliveryOS deve declarar essa
   limitação explicitamente na interface/relatório, nunca fingir certeza sobre o conteúdo final da
   sacola quando houve correção manual.
3. **Risco de licenciamento/suporte** — se existir banco de dados local, acessá-lo pode violar termo
   de uso ou quebrar numa atualização do fornecedor sem aviso.
4. **NFC-e no mesmo sistema** — o erro de certificado visto na foto mostra que o Odhen/Teknisa também
   lida com nota fiscal; qualquer capturador precisa ser cego a essa parte (não tocar, não ler dado
   financeiro/fiscal além do necessário para identificar o pedido).
5. **Duas fontes para sincronizar, não uma** — status vem do Gestor iFood, itens vêm do
   Odhen/Teknisa no instante da impressão; o parser/ingestão precisa casar os dois pelo código do
   iFood (campo comum às duas fontes) sem inventar relação onde não há confiança.
6. **Risco de clique perigoso, se a opção B (automação de navegador) for usada** — ver §6.3: um
   seletor errado ou uma mudança de layout do iFood pode acionar um botão de ação real (pronto,
   cancelar, chat). Mitigação detalhada na §6.3; enquanto a opção D (fila de impressão + Gestor só
   em leitura passiva de DOM) for suficiente, a opção B nem precisa entrar em cena.
7. **Painel do Gestor pode usar paginação infinita** (carrega mais cartões só ao rolar) — se for o
   caso, a leitura passiva do DOM (opção A) sozinha não basta; precisa confirmar por inspeção antes
   de decidir entre A e B (ver §6.8, primeiro teste seguro desta parte).
8. **Vídeo não analisado** — pode conter informação operacional relevante ainda não incorporada a
   este diagnóstico.

## 8. Perguntas pendentes para o César

1. Quando o pedido some da tela do Odhen/Teknisa após a impressão, ele fica gravado em algum lugar
   (banco, log, pasta de histórico) mesmo sem aparecer mais na tela ativa? Ou é removido de vez, sem
   deixar rastro nenhum? (Confirmar por inspeção segura no Windows ou pergunta ao suporte.)
2. A impressão sai via spool do Windows (fila normal — já confirmado que sim) usando driver padrão
   do Windows, ou um driver específico da Epson/fornecedor? (Ajuda a escolher entre opção 1 e 2.)
3. A comanda tem sempre o mesmo layout, ou muda conforme o tipo de pedido (agendado, retirada)?
4. Reimpressão: existe algum campo na comanda que diferencie a via original da reimpressão (número
   de via, marca de "cópia"), ou só dá pra saber pelo `pedido_interno` repetido?
5. Pedidos do app próprio (Animo) aparecem no mesmo Odhen/Teknisa, no mesmo formato de comanda?
6. O código "LETRA B" visto num combinado é um padrão fixo (A, B, C... para cada tipo de combinado)?
7. **No Gestor de Pedidos, quando há muitos pedidos ao mesmo tempo (pico), os cartões que não cabem
   na tela ficam carregados no HTML da página (só escondidos por rolagem), ou só carregam quando a
   pessoa rola até eles?** — pergunta técnica que talvez precise ser respondida por inspeção direta
   (ver §6.8), não necessariamente pelo César.
8. O Gestor de Pedidos tem algum modo de "exportar" ou "ver todos" que mostre a lista inteira sem
   depender de rolagem, mesmo que seja uma tela diferente da operacional?

## 9. Plano de teste na loja

| Dia | Objetivo | O que observar | O que medir | Critério de sucesso | Critério de parada | Se falhar |
|---|---|---|---|---|---|---|
| **Segunda** (baixo movimento) | Ligar o Gestor de Pedidos (opção 7) e, se possível, começar a testar leitura da fila de impressão (opção 2) sem interferir na impressão | A impressão continua normal? O capturador lê algo em cada fonte? | Nº de pedidos capturados vs impressos/vistos no Gestor | Pelo menos 1 pedido capturado em cada fonte, impressão 100% normal | Qualquer atraso ou falha na impressão | Reverter o capturador na hora, sem debate |
| **Terça ou quarta** | Validar 30-50 pedidos nas duas fontes | Sequência/itens (Odhen/Teknisa) e status/tempo (Gestor iFood) batem com o papel e com o que a equipe vê? | % de pedidos corretamente capturados e casados entre as duas fontes pelo código do iFood | ≥95% de pedidos casados corretamente | Qualquer sinal de impressão dupla ou atrasada | Pausar e revisar o parser antes de continuar |
| **Sexta** (pico) | Testar sob pressão real, múltiplos pedidos simultâneos | O capturador acompanha o ritmo nas duas fontes? Atrasa a tela? | Latência entre impressão/atualização do Gestor e exibição no DeliveryOS | Latência aceitável (segundos, não minutos); zero impacto na impressão | Latência crescente ou uso de CPU/memória subindo | Reduzir frequência de leitura, isolar o processo |
| **Domingo** (pico maior) | Validar se ajuda ou atrapalha de verdade | A equipe olha a tela? Ela ajuda a decidir? | Feedback qualitativo da equipe | Equipe relata que ajudou, não que atrapalhou | Qualquer reclamação de que o sistema interferiu no trabalho | Voltar ao modo sombra (só registrar, não mostrar) até corrigir |

Começar pela opção 7 (Gestor iFood, leitura passiva do DOM em repouso — opção A da §6) sozinha é o
piloto de menor risco possível — já dá status/tempo real sem tocar em nada da loja. A captura de
itens/sequência (Odhen/Teknisa via fila de impressão) entra em paralelo assim que a opção 1/2
estiver pronta para teste.

## 10. O que esta auditoria permite responder

1. Melhor fonte: **duas fontes combinadas** — Gestor de Pedidos do iFood (opção 7, leitura passiva
   do DOM) para status/tempo/atraso/cancelamento, e o Odhen/Teknisa capturado no instante da
   impressão (opção 1/2, fila de impressão — agora mais forte, com a Epson TM-T20X confirmada
   passando pela fila normal do Windows) para itens/sequência. Não existe uma fonte única.
2. Como capturar sem quebrar impressão: nunca tocar no driver/porta da impressora; só ler (fila de
   impressão, banco se existir, ou navegador), nunca escrever ou redirecionar.
3. Sequência, iFood e itens: confirmado que a comanda ("Relatório de Entrega") já traz os três campos
   e que **é única** (não há comanda separada por praça) — mas só existem enquanto o Odhen/Teknisa
   ainda não os removeu da tela, ou seja, precisam ser capturados no momento da impressão.
4. Tempo quase real: status vem do Gestor iFood (viável, já é a fonte que a equipe usa hoje); itens
   vêm do Odhen/Teknisa no instante da impressão (viável via opção 1/2, incerto via opção 6/banco).
5. Como rodar no Windows da loja, e a captura do Gestor com muitos pedidos: ver
   `docs/Arquitetura_Sincronizacao_Local_V1.md` e a nova §6 deste documento.
6. Como exibir no caixa/delivery/tablet: mesma rede local, mesmo padrão que `tools/servir_v1.js` já
   usa hoje (servidor local + navegador), com a fonte trocada de "janela real gravada" para "fonte
   viva" (duas fontes casadas pelo código do iFood).
7. Riscos: listados na §7 — os principais agora são (a) o Odhen/Teknisa pode não ter fonte histórica
   nenhuma, o que torna a captura no instante da impressão obrigatória, e (b) a correção manual à
   caneta é uma limitação permanente e declarada, não detectável automaticamente.
8. Primeiro teste seguro: inspecionar o DOM do Gestor de Pedidos em repouso (§6.8, sem código, só
   observação manual) — depois somar a fila de impressão (opção 1/2) para itens/sequência, numa
   segunda-feira de baixo movimento.
9. O que falta confirmar na loja: as 8 perguntas da §8 — sobretudo se existe algum rastro do pedido
   no Odhen/Teknisa além da tela ativa, e se o painel do Gestor carrega todos os cartões no DOM ou só
   sob rolagem.
10. Próxima missão: ver `docs/Arquitetura_Sincronizacao_Local_V1.md` — ainda documentação, não
    implementação.
