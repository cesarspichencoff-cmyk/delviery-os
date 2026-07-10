# Inspeção das Fontes Reais da Loja — V0

> Preparação de roteiro + validação de sintaxe. **Nenhuma inspeção real da loja foi executada nesta
> sessão** — este ambiente roda no computador de desenvolvimento, não no computador do caixa, e não
> tem acesso à sessão logada do Gestor de Pedidos iFood da TATÁ nem à fila de impressão real da
> Epson TM-T20X da loja. Sobre o commit `0664958`. Nenhum código do DeliveryOS alterado; nenhuma
> dependência instalada; nenhum scraper, automação de navegador ou capturador criado.

---

## 1. Data e ambiente da inspeção

- **Data:** 10/07/2026.
- **Ambiente:** computador de desenvolvimento (`C:\Users\italo\Desktop\Claude`), **não** o
  computador do caixa da loja.
- **O que foi feito de fato:** (a) validação de sintaxe dos comandos de leitura da fila de
  impressão do Windows, rodados nesta máquina, sobre as impressoras genéricas aqui instaladas
  (nenhuma Epson TM-T20X presente) — só para confirmar que os comandos funcionam e não exigem
  privilégio especial; (b) preparação dos dois roteiros abaixo, prontos para você (ou alguém da
  equipe) executar no computador real da loja, com o Gestor de Pedidos aberto.
- **O que NÃO foi feito:** nenhuma leitura do Gestor de Pedidos real, nenhuma leitura da fila de
  impressão real da Epson TM-T20X, nenhum acesso à sessão iFood da loja.

## 2. Validação de sintaxe (nesta máquina, sem dado real)

Rodei este comando, somente leitura, sem privilégio de administrador:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName, Shared | Format-Table -AutoSize
Get-PrintJob -PrinterName (Get-Printer | Select-Object -First 1 -ExpandProperty Name) -ErrorAction SilentlyContinue | Select-Object Id, DocumentName, JobStatus, TotalPages, SubmittedTime
```

**Resultado:** rodou sem erro, sem pedir elevação, listando as impressoras desta máquina (nenhuma
delas é a Epson da loja — são impressoras genéricas como "Microsoft Print to PDF"). `Get-PrintJob`
também rodou sem erro (retornou vazio, porque não havia nenhum trabalho na fila no instante do
teste — comportamento esperado e seguro). **Isto confirma que o roteiro da Parte 3 (abaixo) é
sintaticamente válido e não exige privilégio especial**, mas **não confirma nada sobre a Epson
TM-T20X real da loja**, que precisa ser testada lá.

## 3. Roteiro — Parte 1: inspeção do Gestor de Pedidos iFood

**Somente leitura. Não clicar em nenhum pedido, botão ou link durante o teste — só abrir as
Ferramentas de Desenvolvedor do navegador (F12) e observar.**

### Como executar (para você ou alguém da equipe, no computador da loja)

1. Abrir o Gestor de Pedidos no Chrome/Edge, como já é feito hoje.
2. Apertar **F12** (ou botão direito → Inspecionar) para abrir as Ferramentas de Desenvolvedor.
3. Ir na aba **Console** e colar, um de cada vez, os comandos abaixo. Cada um é só leitura — não
   altera a página, não clica em nada, não envia nenhum dado para lugar nenhum.

```javascript
// 1) Quantos cartões de pedido existem no DOM AGORA (antes de rolar)?
// Ajustar o seletor conforme a estrutura real da página (ver passo 12).
document.querySelectorAll('[class*="card"], [class*="order"], [class*="pedido"]').length

// 2) Quantos estão de fato visíveis na tela (dentro da área visível)?
[...document.querySelectorAll('[class*="card"], [class*="order"], [class*="pedido"]')]
  .filter(el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).length

// 3) Existe iframe na página? (afeta onde procurar os cartões)
document.querySelectorAll('iframe').length

// 4) Existe shadow DOM? (componentes modernos às vezes escondem conteúdo assim)
[...document.querySelectorAll('*')].some(el => el.shadowRoot) 

// 5) Existe algum botão "carregar mais" ou paginação visível?
[...document.querySelectorAll('button, a')].filter(el => /mais|more|carregar|próxima|next/i.test(el.textContent)).map(el => el.textContent.trim())
```

4. **Rolar manualmente** a coluna de pedidos (ex.: "Em preparo") até o fim.
5. Rodar de novo o comando 1 (contagem de cartões no DOM) — comparar com o número de antes de rolar.
   - **Se o número não mudou:** os cartões já estavam todos no DOM (Modelo A).
   - **Se o número aumentou:** novos cartões entraram ao rolar (Modelo B ou C — ver passo 6).
6. Rolar de volta pro topo e rodar o comando 1 mais uma vez.
   - **Se o número continua o mesmo de depois de rolar:** os cartões carregados continuam no DOM
     mesmo fora da tela (Modelo B — "carrega ao rolar, mas não descarta").
   - **Se o número voltou a cair:** a lista está descartando cartões antigos ao rolar (Modelo C —
     virtualização; leitura passiva sozinha não garante cobertura total).
7. Checar se cada coluna (Em preparo/Pronto/Em rota/Finalizados) tem rolagem própria (rolagem
   independente dentro da coluna) ou se é uma rolagem só da página inteira.
8. Olhar o texto de 2-3 cartões (sem clicar) e confirmar visualmente: aparece código curto do
   iFood, status da coluna, tempo decorrido e "Atraso Xmin" **sem precisar abrir o pedido**?
9. Um pedido cancelado (se houver algum na tela) aparece com alguma marcação direta na lista (cor,
   selo, texto "Cancelado"), ou só se descobre abrindo o pedido?
10. Deixar a tela parada por 1-2 minutos sem tocar em nada e observar se o número de cartões muda
    sozinho (o painel atualiza automaticamente, sem F5) — importante para saber se a leitura passiva
    pode só reler periodicamente ou precisa de outro mecanismo.
11. (Opcional, avançado) Abrir a aba **Network** do DevTools, filtrar por "Fetch/XHR", e **só
    observar** (sem copiar nada) se aparecem chamadas sendo feitas periodicamente enquanto a tela
    está parada — isso indica se o painel busca dados por API em vez de recarregar a página inteira.
    **Não copiar nenhum cabeçalho, cookie ou token dessa aba.**
12. Anotar o nome genérico das classes/atributos usados nos cartões (ex.: `class="order-card"`) —
    **sem nenhum dado do cliente** — só a estrutura, para eu poder escrever um leitor depois.

### O que registrar (sem dado sensível)

- Quantidade de cartões no DOM antes/depois de rolar (números, só isso).
- Se existe iframe/shadow DOM (sim/não).
- Se existe botão "carregar mais" (sim/não, texto do botão).
- Se status/atraso/código aparecem sem abrir o pedido (sim/não).
- Se cancelamento aparece na lista sem abrir (sim/não).
- Nomes genéricos de classes/atributos (ex.: `.order-card`, `data-status`) — nunca nome de cliente,
  telefone, endereço ou valor.

### Classificação resultante (marcar uma, com base nas observações)

- **Modelo A** — número de cartões no DOM não muda ao rolar → leitura passiva é suficiente.
- **Modelo B** — número aumenta ao rolar e não cai ao voltar → precisa rolagem controlada (Nível 2/3).
- **Modelo C** — número cai ao rolar de volta (virtualização) → leitura passiva sozinha não cobre
  tudo; precisa de estudo adicional (talvez opção D abaixo).
- **Modelo D** — dados chegam por API observável no Network, mas nem tudo fica no DOM → avaliação
  técnica adicional necessária, sempre sem tocar em autenticação.

**Resultado desta rodada: não determinado — roteiro ainda não executado na loja.**

## 4. Roteiro — Parte 3: inspeção da fila de impressão (Epson TM-T20X)

**Somente leitura. Não pausar, não reconfigurar driver/porta, não marcar "manter documentos
impressos", não redirecionar a impressora.**

### Como executar (no computador do caixa, com privilégio de usuário comum — teste em segunda-feira de baixo movimento)

```powershell
# 1) Nome exato da fila/impressora e driver/porta usados
Get-Printer | Where-Object { $_.Name -match "TM|Epson|T20X" } | Format-List Name, DriverName, PortName, Shared, Type

# 2) Confirmar se a porta é USB ou rede (ajuda a saber se passa pelo spool normal)
Get-PrinterPort | Where-Object { $_.Name -eq (Get-Printer | Where-Object { $_.Name -match "TM|Epson|T20X" }).PortName }

# 3) Observar trabalhos na fila (rodar isso alguns segundos ANTES de um pedido ser impresso, e de
#    novo LOGO DEPOIS — sem pausar nada, só olhar)
Get-PrintJob -PrinterName (Get-Printer | Where-Object { $_.Name -match "TM|Epson|T20X" }).Name |
  Select-Object Id, DocumentName, JobStatus, TotalPages, SubmittedTime, DataType
```

- Repetir o comando 3 algumas vezes seguidas, próximo do momento em que um pedido real é impresso,
  **sem interferir** — só para ver se o trabalho aparece, por quanto tempo fica visível na fila, e
  o que aparece no campo `DataType` (isso responde se o formato é texto simples, RAW, EMF, ou outro
  — decide se dá pra ler o conteúdo direto ou se precisa de outra abordagem).
- **Não abrir o trabalho, não pausar, não reimprimir, não excluir.**

### O que registrar

1. Nome exato da fila/impressora (ex.: "EPSON TM-T20X Receipt").
2. Driver utilizado (nome do driver).
3. Porta utilizada (USB, rede/IP, ou compartilhada).
4. Confirmação de que o trabalho aparece na fila normal do Windows (sim/não — já indicado pelo
   César que sim, mas o teste confirma tecnicamente).
5. Quanto tempo o trabalho fica visível na fila antes de sumir (segundos? Instantâneo?).
6. Valor do campo `DataType` do trabalho (RAW, EMF, TEXT, ou outro).
7. Se algum conteúdo textual da comanda aparece acessível através do próprio job (via
   `DataType`/spool file), sem precisar reconfigurar nada.
8. Se rodar esses comandos causou qualquer atraso perceptível na impressão real (deve ser "não").

**Resultado desta rodada: não determinado — roteiro ainda não executado na loja com a Epson real.**
A validação de sintaxe (§2) confirma que os comandos funcionam nesta máquina sem erro e sem
privilégio especial — falta só rodar contra a impressora e a fila reais.

## 5. Parte 2 — Níveis de isolamento (documentado, independente da inspeção)

**Segundo monitor não é isolamento técnico.** Um segundo monitor ligado ao mesmo computador só muda
onde a imagem aparece — não impede que uma automação de navegador roube foco, mova o mouse, ou
compita por CPU/memória com o que a equipe está fazendo na tela principal. Isolamento real é sobre
**processo e sessão**, não sobre quantidade de telas.

| Nível | Configuração | Suficiente quando |
|---|---|---|
| **Nível 1** | Mesmo computador, perfil de navegador dedicado, **leitura passiva, nenhuma interação** (rolar/clicar) | Gestor classificado como **Modelo A** (tudo no DOM) — cenário mais provável dado que os itens já vêm pela fila de impressão, então o Gestor só precisa entregar status/atraso/cancelamento visível sem interação |
| **Nível 2** | Mesmo computador, **usuário/sessão do Windows separada** (se tecnicamente viável) | Gestor classificado como **Modelo B** — reduz risco de a automação de rolagem competir por foco com a sessão da equipe, mesmo estando na mesma máquina |
| **Nível 3** | Mini-PC ou computador dedicado só para o DeliveryOS | Gestor classificado como **Modelo C** ou se qualquer automação de clique/abertura de pedido for necessária — isola qualquer travamento ou erro da automação de afetar o caixa real |

**A operação principal nunca deve depender da janela automatizada** — se ela travar, o pior caso é
o DeliveryOS ficar desatualizado, nunca a operação real parar.

## 6. Riscos encontrados nesta etapa de preparação

Nenhum — nada tocou sistema real da loja, nenhuma automação foi criada, nenhuma senha/cookie foi
manuseada. O único "risco" é de expectativa: os resultados desta rodada são só validação de sintaxe
+ roteiro, não a inspeção real.

## 7. O que pode ser implementado com segurança (depois da inspeção real)

Nada ainda — esta é uma missão de preparação. A implementação de qualquer capturador só começa
depois que a Parte 1 e a Parte 3 forem executadas na loja e o resultado real classificar o Gestor
(Modelo A/B/C/D) e confirmar o comportamento real da fila de impressão.

## 8. O que ainda não pode ser implementado

Capturador definitivo, scraper, automação de navegador (Playwright/Puppeteer/Selenium/extensão),
serviço Windows, qualquer alteração de driver/porta de impressão — todos dependem do resultado real
da inspeção.

## 9. Próximo teste

**Você (ou alguém da equipe) executar os roteiros das Partes 1 e 3 no computador real da loja**,
numa segunda-feira de baixo movimento, e me passar os resultados (os números/observações pedidos em
"O que registrar" — nunca nomes, telefones, endereços ou valores). Com isso, decido entre as opções
1-5 abaixo com evidência real, não hipótese.

## 10. Decisão (Parte 6) — ainda não pode ser tomada com confiança

Das 5 opções possíveis, **nenhuma pode ser escolhida com confiança ainda**, porque a inspeção real
não foi executada:

- **Opção 1** (fila de impressão + leitura passiva do DOM) — **hipótese mais provável**, dado que os
  itens já vêm da fila de impressão (reduzindo a exigência sobre o Gestor) e que painéis de cartão
  como o Gestor costumam carregar tudo no DOM. Mas isso precisa da confirmação do Modelo A.
- **Opção 2/3** — só entram em cena se a Parte 1 confirmar Modelo B ou C.
- **Opção 4** — cai como plano seguro se a fila de impressão (Parte 3) funcionar bem mas o Gestor se
  mostrar difícil de ler com segurança.
- **Opção 5 — recomendação desta rodada:** **a inspeção real ainda não foi feita, então nenhuma
  implementação real deve começar.** Esta é a opção que vale hoje, até os roteiros das Partes 1 e 3
  serem executados na loja e os resultados voltarem.

---

## Critério de sucesso — respostas com evidência (do que temos hoje)

1. Todos os pedidos estão no DOM? **Não determinado — pendente da Parte 1 real.**
2. É necessário rolar? **Não determinado — pendente.**
3. Existe virtualização? **Não determinado — pendente.**
4. Status/tempo/atraso/cancelamento visíveis sem abrir pedido? **Não determinado — pendente
   (mas o César já confirmou que o resumo do cartão mostra status/tempo/atraso; falta só confirmar
   se dá pra ler tudo isso sem abrir, via inspeção de DOM).**
5. Perfil dedicado no mesmo computador é suficiente? **Hipótese: sim, se Modelo A** — a confirmar.
6. Será necessário mini-PC/computador separado? **Hipótese: só se Modelo B/C ou se precisar de
   automação de clique** — a confirmar.
7. A fila da Epson TM-T20X pode ser observada com segurança? **Sintaxe validada nesta máquina (§2);
   comportamento real da fila da loja ainda não testado.**
8. O conteúdo da comanda é acessível no trabalho de impressão? **Não determinado — depende do
   `DataType` real do job, só descobrível na loja (§4).**
9. Qual arquitetura foi confirmada? **Nenhuma nova — seguem confirmadas só as informações
   operacionais já registradas em `docs/Auditoria_Fonte_Viva_Loja_V1.md` (impressora, comanda
   única, cancelamento via Gestor).**
10. Qual ainda é só hipótese? **Toda a arquitetura técnica de captura (Modelo A/B/C/D do Gestor,
    formato real do job de impressão) — nada disso vira fato até a inspeção real na loja.**
