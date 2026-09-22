---
lifecycle:
  artefato: docs/etapa-4-8/D4-EVIDENCIA.md
  status: ACTIVE
  authority_scope: d4_politica_de_evidencias
  superseded_by: null
  atualizado_em: "2026-09-22"
  state_basis: ae5b046
  question_refs: []
---

# D4 — Política de evidências do Lab V4

> Base: `ae5b0468180682b0d80b211c0f2b89bc6ac92b64`.
> Critério do César: **rodar um teste nunca pode destruir evidência histórica, e
> regenerar evidência histórica precisa ser um ato explícito, completo e
> rastreável.**

## O defeito, na linha exata

`labs/operacao-viva-v4/testes/run-lab-v4-browser.ts`, como estava:

```ts
177:  rmSync(EVID, { recursive: true, force: true });   // apaga
178:  mkdirSync(EVID, { recursive: true });
...
182:  browser = await chromium.launch();                // depois tenta subir
```

Apaga **antes** da operação que pode falhar, e `EVID` tinha como padrão o
diretório **versionado**. Quando o navegador não abria — e não abriu, por
descompasso de build do Playwright — os 13 arquivos rastreados já tinham ido, e
nada os regenerava. Reproduzido 3 de 3 na sessão do PB19.

Inverter as duas linhas conserta o sintoma. Não conserta a classe: rodar um
teste continuaria sendo, por padrão, um ato de escrita sobre patrimônio.

## O desenho

Duas superfícies, com responsabilidades diferentes:

| | |
|---|---|
| `npm run test:lab:v4:browser` | prova comportamento · grava em temporário e **descarta** · nunca alcança o versionado |
| `npm run evidence:lab:v4:refresh` | **único** caminho que substitui o conjunto versionado · inteiro ou nada |

Quatro mecanismos, e cada um existe por um motivo medido:

**1. Temporário por padrão.** Sem `LAB_V4_EVIDENCIAS`, o gate cria
`mkdtemp()` fora da worktree e o apaga no fim — inclusive quando morre, porque
o temporário nasce no carregamento do módulo, antes de qualquer `try`. Só
descarta o que ele mesmo criou: apagar um diretório que veio por variável
repetiria o D4 com outro nome.

**2. Recusa estrutural.** Se `LAB_V4_EVIDENCIAS` resolver para o diretório
versionado, o gate sai `2` e aponta o comando certo. A comparação é por
**caminho real**, então symlink e `..` não contornam — os dois estão medidos em
`E2`. Isto é o que fecha a classe: apontar o gate normal para o patrimônio
deixou de ser possível, e não apenas de ser o padrão.

**3. A ordem, ainda assim.** O `launch()` acontece antes de qualquer `rmSync`.
Redundante com (1) e (2) de propósito: `MD1` mostra que, com a ordem antiga,
**0 de 14** arquivos sobrevivem num destino declarado quando o navegador não
abre.

**4. Publicação atômica.** O refresh gera num estágio **adjacente** ao alvo —
adjacente porque `rename` só é atômico dentro do mesmo sistema de arquivos, e
um `/tmp` noutro dispositivo forçaria cópia arquivo a arquivo, que é exatamente
o estado "metade e metade" que a ferramenta existe para impedir. O estágio é
gitignorado, então execução morta no meio não suja `git status` (`E8`).
Publica só depois de: o gate **inteiro** verde, o conjunto completo **nome a
nome**, nenhum arquivo de 0 byte, assinatura PNG válida em cada um, e o
manifesto presente. Então dois `rename`: o velho sai, o novo entra; se o
segundo falhar, o velho volta.

## Procedência

`labs/operacao-viva-v4/evidencias/procedencia.json`, legível por máquina.

Quando há regeneração deliberada, ele carrega: commit · versão exata do
Playwright · **executável que de fato rodou** e seu build · versão reportada do
Chromium · plataforma e Node · viewports · cenas · script responsável ·
timestamp · declaração `fixture: true` · e, por arquivo, SHA-256, tamanho e
dimensão medida no cabeçalho PNG.

### Por que "o executável que de fato rodou" exigiu trabalho

A primeira versão registrava `chromium.executablePath()`. Medido, neste
ambiente ele devolve `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome` —
**um arquivo que não existe**, porque `launch()` em headless usa o *headless
shell*, outro caminho. Anotar isso no manifesto seria registrar um binário que
nunca rodou: procedência inventada com aparência de medida.

O manifesto passou a medir por `launchServer().process().spawnfile`, que é o
arquivo que o sistema operacional executou, e a guardar os **dois** caminhos:

```json
"executavel_pedido": ".../chromium_headless_shell-1228/.../chrome-headless-shell",
"executavel_real":   "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
"build_diretorio":   "chromium_headless_shell-1194",
"divergencia_de_build": true
```

O Playwright pede o `1228`, o arquivo por trás do symlink é o `1194`. Guardar
só um dos dois esconderia exatamente essa diferença.

### As 12 imagens atuais: UNKNOWN

```
browser_provenance: UNKNOWN_FOR_EXISTING_BASELINE
```

Nenhum registro diz qual build de Chromium, qual Playwright ou qual plataforma
as produziu. `chromium`, `playwright`, `gerado_por` e `gerado_em` ficam `null`,
e `E11` reprova se qualquer um deles deixar de ser nulo sem medição.

Nenhum build foi eleito referência canônica. **UNKNOWN não é motivo para
apagar**: as imagens ficam preservadas até uma regeneração deliberada medir a
procedência de verdade.

O que **é** demonstrável sobre elas foi medido e está no manifesto: SHA-256,
tamanho e dimensão real de cada uma — as larguras saem `390`, `768` e `1280`,
que batem com as três viewports, então os nomes de arquivo não estão mentindo —
e a procedência de **commit**, que é outra coisa e está rotulada como outra
coisa: os 12 blobs atuais vêm todos de `0f1dd50`, conjunto homogêneo, de uma
execução só.

## Controles adversariais — `npm run test:lab:v4:evidencias`

11/11, `D4_GREEN`. Cada um **executa** o caminho real e mede a impressão
digital do diretório versionado (nome + conteúdo de cada arquivo, agregado)
antes e depois. Nenhum lê código à procura de `rmSync`.

| | |
|---|---|
| `E1` | o gate recusa `LAB_V4_EVIDENCIAS` apontando para o versionado |
| `E2` | a recusa não se contorna por symlink nem por caminho com `..` |
| `E3` | navegador inexistente reprova o gate e **não encosta** no patrimônio |
| `E4` | gate normal verde deixa o patrimônio byte a byte idêntico |
| `E5` | o temporário é descartado, e fica fora da worktree |
| `E6` | refresh com geração reprovada **recusa** e preserva o conjunto velho |
| `E7` | refresh **morto no meio** deixa o conjunto velho inteiro |
| `E8` | estágio morto não suja `git status`, e a regra não engole o versionado |
| `E9` | refresh completo publica 12 + README + manifesto coerentes |
| `E10` | build alternativo roda sem redefinir a referência versionada |
| `E11` | o baseline continua declarado UNKNOWN |

`E7` mata de verdade: espera a primeira captura chegar ao estágio e mata o
grupo de processos — sem cronômetro fixo, que daria falso verde numa máquina
lenta.

**Nenhuma comparação pixel a pixel entre builds.** Builds diferentes desenham
diferente, e transformar isso em vermelho elegeria um build canônico por
acidente.

## O erro que esta suíte cometeu, e o que ele ensinou

A primeira versão dos controles rodava dois casos do refresh com `cwd` no
**repositório**, contando que cada um falhasse antes de publicar. `E6` abria um
servidor para ocupar a porta do gate com `listen()` — assíncrono — e emendava
`spawnSync`, que trava o event loop antes de a porta ligar. **O bloqueio nunca
existiu.** O gate rodou inteiro, o refresh publicou, e a suíte de controle
substituiu os 12 PNGs versionados: o D4, cometido pela ferramenta escrita para
impedi-lo.

Restaurado por `git checkout --`, com os 12 conferidos byte a byte contra um
snapshot externo.

A lição não é "corrigir aquele controle". É que **um controle que PODE alcançar
o patrimônio vai alcançá-lo no dia em que tiver um defeito.** Todo exercício do
refresh passou a rodar numa **raiz espelho** — o repositório inteiro por
symlink, com uma cópia do diretório de evidências — e o patrimônio real é
medido depois de cada um, como rede final. `E6` trocou a corrida de porta por
falha determinística.

A raiz espelho mora em `raiz-espelho.ts`, um módulo só: duas noções de "cópia
segura" divergem, e a permissiva é a que ninguém percebe. Ela espelha o **topo
inteiro** porque escolher a dedo não funcionou — a primeira tentativa ligou só
`labs/`, `node_modules` e `package.json`, e o gate morreu procurando
`data/cardapio_knowledge_seed.json`; ligado o `data/`, morreu noutro módulo.
Lista que persegue dependência vira falso vermelho no dia em que alguém
acrescenta um import. `.git` fica de fora: raiz de teste não deve poder
escrever no repositório nem falar por ele.

## Mutações — `npm run test:lab:v4:evidencias:mutacoes`

**6/6, zero controles cegos.** Cada mutação restaura o defeito no disco e
exige que a propriedade se perca **de forma observável**. Todas rodam contra a
raiz espelho; o patrimônio é conferido no fim.

| | mutação | perda medida |
|---|---|---|
| `MD1` | limpar antes do `launch()` | restaram **0 de 14** arquivos no destino |
| `MD2` | padrão volta ao versionado | o gate normal **apagou o diretório inteiro** |
| `MD3` | remover a recusa | saiu `0` e reescreveu o conjunto versionado |
| `MD4` | refresh ignora o código de saída | publicou 12 capturas de execução **vermelha** |
| `MD5` | remover a conferência nome a nome | publicou **9** em vez de 12 |
| `MD6` | filtrar console só pelo texto | build alternativo reprova o gate |

### Três achados que só a suíte de mutação produziu

**`MD2` revelou dano maior que o previsto.** Com o padrão revertido, não é só
reescrita: o descarte do "temporário" no fim do gate **apaga o diretório
versionado inteiro**. A primeira medição estourou em `scandir` de um diretório
inexistente — erro de instrumento escondendo defeito observado. Sumir passou a
contar como perda.

**`MD1` deu controle cego por engano.** O exercício apontava o gate para o
`evidencias/` do espelho, e a **recusa** disparava primeiro (saída 2), salvando
a cópia: media a recusa, não a ordem. Cada mutação precisa exercitar UMA
propriedade — passou a usar um destino declarado com cópia dentro.

**`MD4` esbarrou num segundo guarda.** Removido o teste do código de saída, o
refresh ainda parava na conferência de manifesto. Não era controle cego: era
defesa em profundidade. Para tornar a guarda carga, o exercício passou a
produzir o caso que importa — **geração completa e prova vermelha** —, e aí o
refresh publicou 12 capturas de uma execução reprovada.

## Uma correção que o `E10` forçou

O filtro de console do gate era `erroMaterial(texto)`, com `favicon` no texto.
Medido: o Chrome completo pede `/favicon.ico` e o headless shell **não pede**;
quando pede, a mensagem é só `Failed to load resource: the server responded
with a status of 404 (Not Found)` — sem a palavra `favicon`, que vive em
`location().url`.

Um filtro que lê só o texto reprova o gate **conforme o build do navegador**, o
que elegeria um build canônico por acidente. O filtro passou a ver a URL
também, e `MD6` prova que sem isso o build alternativo fica vermelho.

## Regressão

46 gates isolados, com PostgreSQL 16.13 real.

```
PASS: 42   FAIL: 4
```

| classificação | quais |
|---|---|
| PASS | 42, inclusive os dois gates novos de D4 |
| FAIL_PREEXISTENTE | `governanca` (G6b+G9), `governanca:mutacoes` (cascata), `entregas` (fixture com data fixa) |
| BLOCKED | `m1b-perceptual` — exige servidor M1 na 5292, `ECONNREFUSED` |
| **FAIL_NOVO** | **0** |
| NOT_RUN | 0 |

As três pré-existentes foram conferidas **byte a byte** contra o baseline C0 e
são idênticas.

Seis gates (`pg`, `repos`, `backup`, `all`, `pb19`, `spine:processos`) caíram
na primeira passada e foram **reprovados por ambiente, não por código**: o
PostgreSQL desta sessão foi morto durante o intervalo — `database system was
interrupted; last known up at 09:42:47` no log do servidor. Religado, os seis
voltaram verdes na mesma árvore. Registrado aqui em vez de virar "flake".

### O teste de fogo

Depois da regressão inteira — com `test:lab` dentro, que roda o gate de
navegador de verdade — `git status` trouxe só as edições desta missão. Nenhum
PNG modificado, nenhum arquivo apagado, e os 12 conferidos byte a byte contra
um snapshot externo à suíte.

Antes desta correção, a mesma regressão apagava 13 arquivos rastreados.

## O que fica aberto

Uma regeneração deliberada com procedência completa **não foi feita** de
propósito: os 12 PNGs atuais seguem preservados, e trocá-los só para "deixar
tudo novo" é exatamente o que a decisão do César proíbe. Quando houver motivo
de produto para regenerá-los, `npm run evidence:lab:v4:refresh` mede a
procedência e o `UNKNOWN` do baseline some por medição, não por conveniência.
