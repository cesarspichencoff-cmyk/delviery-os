# Auditoria Nível 2 — Validação Real da Base

> Continuação da Auditoria de Continuidade (Nível 1). Aqui os arquivos brutos foram **abertos e
> parseados de fato** — XLSX lidos com a própria lib `xlsx` do repo, `ifood_real.jsonl` amostrado por
> inteiro, WhatsApp/Bloco 3 verificados por conteúdo (não só existência), e o código que faltava foi
> lido linha a linha. Nenhum arquivo do repositório foi alterado; nenhuma regra do motor foi tocada;
> nenhum tuning foi feito. Onde executei algo, rodei sempre em cópia isolada (scratchpad), nunca sobre
> os arquivos versionados.

---

## 1. Arquivos brutos validados

### 1.1 — Os 16 arquivos de `Downloads/Dados Claude.zip` (todos abertos e parseados)

| Arquivo | Abas | Linhas de dado (real) | Colunas | Período real (medido) | Bate com a auditoria anterior? |
|---|---|---:|---:|---|---|
| Relatorio Outubro 25.xlsx | 1 | 7.188 | 56 | 01/10/2025 → 31/10/2025 | ✅ exato |
| Relatorio Novembro 25.xlsx | 1 | 7.974 | 56 | 01/11/2025 → 30/11/2025 | ✅ exato |
| Relatorio Dezembro 25.xlsx | 1 | 7.273 | 56 | 01/12/2025 → **30**/12/2025 | ✅ exato — confirma a lacuna de 31/12 já citada |
| Relatorio Janeiro.xlsx | 1 | 7.432 | 56 | **02**/01/2026 → 31/01/2026 | ✅ exato — confirma a lacuna de 01/01 já citada |
| Relatorio Fevereiro.xlsx | 1 | 7.412 | 56 | 01/02/2026 → 28/02/2026 | ✅ exato |
| Relatorio Marco.xlsx | 1 | 7.861 | 56 | 01/03/2026 → 31/03/2026 | ✅ exato |
| Logistica.xlsx | 1 | 24.905 | 29 | 03/04/2026 → 30/06/2026 | ✅ exato |
| Cardapio.xlsx | 3 (Funil/Itens/Complementos) | 1 + 180 + 27 | 18/11/8 | 03/04/2026 → 01/07/2026 | ✅ exato |
| Relatorio Cancelament os.xlsx | 1 | 464 | 22 | (medido 03/04→30/06/2026, coerente com doc) | ✅ exato |
| Negociacoes Ifood.xlsx | 1 | 604 | 27 | (coerente com doc) | ✅ exato |
| Qualidade Operacao Abril.xlsx | 2 (dados+glossário) | ~100 (pivotado) | 30/2 | abril/2026 | ✅ confirma formato pivotado |
| Qualidade Operacao Maio e Junho.xlsx | 2 | ~103 (pivotado) | 63/2 | 01/05/2026 → 30/06/2026 | ✅ confirma formato pivotado |
| Vendas Abril/Maio/Junho.xlsx (3) | 4 cada | pequenas | 13/11/10/10 | mês respectivo | ✅ exato |
| Relatorio Vendas.xlsx | 4 | pequenas | idem | 03/04/2026 → 01/07/2026 (consolidado) | ✅ exato |

**Nenhuma divergência de linha/coluna/período encontrada.** Todos os 16 arquivos batem exatamente com
`Auditoria_Dados_Estruturados.md` — inclusive as duas lacunas de cobertura já citadas (31/12 e 01/01).

**Campos confirmados por família** (perguntados explicitamente):
- **ID:** `ID COMPLETO DO PEDIDO` (uuid) + `ID CURTO DO PEDIDO` presentes nos relatórios mensais e na Logística; Cancelamentos/Negociações só têm `Id do pedido` (curto) — confirma a política de junção de 3 níveis descrita no Mapa Canônico.
- **Horário:** `DATA E HORA DO PEDIDO` em todos; Logística tem colunas de tempo em **minutos** (durações), não carimbos absolutos — o relatório NÃO traz timestamp de cada etapa, só duração a partir do pedido (isso é crítico para o item 3 do Código, abaixo).
- **Status:** `STATUS FINAL DO PEDIDO` (CONCLUIDO/CANCELADO/CANCELAMENTO PARCIAL) em todos.
- **Logística:** `TEMPO DO ENTREGADOR ESPERANDO NA LOJA`, `AGRUPAMENTO DE ROTA`, `PRIORIDADE DO PEDIDO` confirmados em Logistica.xlsx.
- **Cancelamento:** `Itens cancelados` confirmado com nomes reais, nos dois formatos citados (`A; B; C` e `[A]`) — vi ambos na amostra.
- **Negociação:** `Cancelamento evitado`, `Quem iniciou/respondeu`, `Reembolso`, `Cupom` — todos presentes.
- **Cardápio agregado:** `Visitas`, `Pedidos`, `Conversão`, `Vendas total (quantidade)`, `Valor Total` por item — confirmado, 180 itens + 27 complementos.
- **Item por pedido (geral):** **confirmado ausente** — nenhum dos 16 arquivos tem uma coluna de item/quantidade por pedido normal (só existe em `Itens cancelados`, e só para os 464 cancelados). A lacuna nº1 do projeto está corretamente descrita.
- **Observação do cliente:** **confirmado ausente** em todos os 16 arquivos.

**Achado novo, não destacado antes:** `Logistica.xlsx` usa nomes de coluna ligeiramente diferentes dos
relatórios mensais para o mesmo conceito (`CÓDIGO DO CANCELAMENTO` vs `TIPO DE CANCELAMENTO`) — não é
contradição, é uma variação de nomenclatura entre as duas famílias de exportação do iFood que qualquer
parser futuro precisa mapear explicitamente (hoje só `ifoodRelatorio.ts`/`autoteste_8pracas.js` mapeiam
os relatórios mensais; nada no repo lê `Logistica.xlsx` ou `Cardapio.xlsx` ainda).

**Achado sobre `Qualidade Operacao *.xlsx`:** o formato não é "pivotado" de forma simples — é
**multi-bloco de largura variável**: cabeçalho de metadados (6 linhas) → bloco "Nível Super" → bloco
diário com **datas como colunas** (indo do dia mais recente para trás) e indicadores como linhas → bloco
horário → bloco por dia-da-semana, todos empilhados na mesma aba. Confirma a nota de "confiança média"
do documento original — isso exige um parser dedicado (não dá para usar `sheet_to_json` direto), mas o
conteúdo é rico: pedidos totais, cancelamentos com % de impacto no Super, chamados e taxa de resposta,
atrasos >5min, tempo médio de preparo — dia a dia.

### 1.2 — `data/cardapio_knowledge_seed.json` (repo)

Reconferido: `_meta.total_produtos_recebidos = 217`, `total_itens_canonicos = 199`, 8 praças todas
presentes e não-zeradas. Bate exatamente com `Auditoria_Cardapio_Conhecimento.md`.

## 2. Arquivos não validados (e motivo)

| Arquivo/dado | Por que não validei a fundo |
|---|---|
| Conteúdo completo de cada linha das 6 planilhas mensais (só amostra de 2-3 linhas por arquivo) | Volume (44k linhas); a amostra + contagem total já é validação estatisticamente forte (100% das linhas foram *contadas*, não só as amostradas) |
| `Qualidade Operacao *.xlsx` — extração completa dos indicadores diários | O formato multi-bloco exigiria escrever um parser dedicado; isso seria começar a "construir", fora do escopo desta auditoria (não fiz tuning nem parser novo) |
| Conteúdo integral das 13 conversas de WhatsApp (171k linhas) | Explicitamente fora de escopo pedido ("não precisa reler 171 mil mensagens") — validei existência, período e uma contagem aproximada (ver §4) |
| Conteúdo das 8 páginas restantes de cada PDF do Bloco 3 (só li a página 1 de 3 exemplos + o texto completo de 1) | Suficiente para responder à pergunta-chave (precisa de OCR ou não); ler as ~8 páginas de cada um dos 8 PDFs é extração de dado, não auditoria de base |
| `demo/camada0_demo.ts` execução real (só leitura de código) | É uma demo com dados fictícios (pedidos 330/412/415/420) — não teria o que "validar" contra dado real |
| `docs/AutoTeste_Operacional.md` (motor pré-8-praças, versão antiga) — não reproduzi este, só o v2 (8 praças) | O motor pré-8-praças foi substituído; validar o mais recente é o que importa para continuidade |

## 3. Divergências encontradas (documentação × realidade)

Esta é a seção mais importante. Encontrei **quatro divergências reais**, nenhuma catastrófica, todas
específicas:

### 3.1 — Bloco 3 NÃO precisa de OCR (correção importante, para melhor)
`docs/Estudo_Conversas_WhatsApp.md` afirma: *"o detalhe item-a-item está nos PDFs/imagens do Bloco 3,
que precisam de OCR (ainda não feito)."* **Isso está parcialmente incorreto.** Abri os 8 PDFs com
`pdftotext`: todos têm **camada de texto nativa extraível**, sem necessidade de OCR — extraí texto
estruturado real (totais de pedidos, cancelamentos por motivo, pedidos por dia-da-semana×turno,
avaliações por estrela, moderações) do primeiro PDF testado, e confirmei o título de todos os 8.
Correção adicional: o conteúdo é **agregado mensal** (parecido com `Qualidade Operacao xlsx`, mas para
2023-2024), **não é o detalhe item-a-item** que o documento sugeria — isso não está em nenhum arquivo
do Bloco 3. Os 4 arquivos `.jpeg` do Bloco 3, por sua vez, não são relatórios de erro: são fotos de
referência do **kit físico** (shoyu, wasabi, hashi, guardanapo, sacola — bate com `COMPONENTES_KIT` do
`normalizador.ts`), úteis para validar a ficha técnica, não para histórico de erro.

**Achado extra:** o arquivo `RELATORIO DE SETEMBRO.pdf` contém internamente o título *"RELATÓRIO DE
DADOS MÊS DE **OUTUBRO** 2024"* — o nome do arquivo não bate com o conteúdo. Pequena inconsistência de
nomenclatura na fonte, não um erro de análise.

**Período real coberto pelos 8 PDFs:** Janeiro/2023, Fevereiro/Maio/Junho/Agosto/"Setembro"(=Outubro)/
Novembro/Dezembro de 2024 — meses espalhados, não uma série contínua, e não cobre 2025-2026 (esse
período já vem dos XLSX).

### 3.2 — Contagem de mensagens do WhatsApp diverge ~9%
`docs/Estudo_Conversas_WhatsApp.md` cita **171.448 mensagens**. Minha contagem própria (regex sobre
linhas com timestamp `[dd/mm/aaaa, hh:mm:ss]` em todos os 13 `_chat.txt`) deu **155.333** — uma
diferença de **~16.100 mensagens (9,4%)**. Testei uma versão mais permissiva do regex (sem exigir
segundos, tolerando caractere invisível no início da linha) e o total mudou muito pouco (155.341).
**Não consegui explicar a diferença nesta auditoria** — pode ser metodologia de contagem diferente
(ex.: contar linhas de mídia/sistema separadamente, ou contar por um parser mais tolerante a quebras de
linha dentro de uma mesma mensagem). **Não afirmo que o documento está errado — registro a divergência
como não resolvida.** Os **períodos** por conversa, porém, batem exatamente (verifiquei Cinthia Tata:
23/07/2022 → 24/06/2026, idêntico ao documento).

### 3.3 — Duplicação de lógica entre `src/ingest/ifoodRelatorio.ts` e `tools/autoteste_8pracas.js`
**Achado de código, não documentado em lugar nenhum.** Existem **dois parsers independentes** do mesmo
relatório iFood:
- `src/ingest/ifoodRelatorio.ts` (Camada 0, TypeScript) — usado por `demo/ingest_real.ts` para gerar
  `data/ifood_real.jsonl`.
- `tools/autoteste_8pracas.js` (JavaScript solto) — **não importa `ifoodRelatorio.ts` nem usa
  `ifood_real.jsonl`**. Ele re-lê o `.xlsx` bruto direto do Downloads e reimplementa, com nomes de
  variável próprios (`pdh`, `num`, `COL`), a **mesma fórmula de reconstrução de "saiu para entrega"**
  (`recebido + tempo_entrega − tempo_caminho_cliente − tempo_esperando_cliente`) que já existe em
  `ifoodRelatorio.ts` (`saiu_em = addMin(recebido, tEnt - tCam - tEsp)`).

**Consequência prática:** o backtest que gerou `docs/AutoTeste_Operacional_8pracas.md` (nota 8.1/10) **não
passou pela Camada 0** (sem log append-only, sem `event_id`, sem dedup) — ele é um caminho paralelo que
recalcula tudo do zero a cada execução. Isso significa que **a Camada 0 (TypeScript) e o motor de 8
praças (JavaScript) hoje não estão de fato conectados em produção** — são dois pipelines que leem a
mesma fonte de forma independente. Se alguém corrigir um bug de parsing em um lado, o outro não herda a
correção automaticamente. Isso não invalida os números do Auto Teste (reproduzi e bateram — ver §3.4),
mas é uma dívida técnica real que nenhum documento menciona.

### 3.4 — Pequena divergência textual no Auto Teste 8 Praças (reproduzido e comparado byte a byte)
Copiei `tools/autoteste_8pracas.js` para um ambiente isolado, rodei contra o mesmo `.xlsx` do Downloads
e comparei a saída com `docs/AutoTeste_Operacional_8pracas.md` já commitado. **Resultado: idêntico em
absolutamente todos os números** (30 dias, 8305 pedidos, nota 8.1/10, precisão 70%, cobertura 98%, foco
13%, 536 focos, 532 recomendações, distribuição de confiança, praças, horários — tudo bateu exato).

A única diferença encontrada foi textual, numa linha de exemplo:
```
doc commitado:     "primeiro olhar: #5607 · pronto há 79 min"
reproduzido agora: "primeiro olhar: #5607 · 79 min"
```
Rastreei a causa: `src/perfil-delivery/decisao.js` (linha do candidato `chamar_motoboy`) hoje gera
`"#" + id + " · " + min + " min"`, sem o prefixo "pronto há". Ou seja, **o texto de `decisao.js` mudou
ligeiramente depois que o documento foi gerado pela última vez** — mudança cosmética de wording, não de
regra ou número. **O motor é 100% reprodutível e determinístico**, como os documentos afirmam; só esse
doc específico está uma execução desatualizado nesse detalhe textual.

## 4. Confirmações importantes

- **`ifood_real.jsonl` bate exatamente com o esperado:** 41.206 linhas = 8.305 pedidos × eventos
  (recebido+aceito sempre; pronto+saiu+entregue quando não cancelado; +177 cancelado; +104
  problema_pós_entrega). Contagem manual bate 100% com a soma. Período real medido:
  `2026-05-27T00:00:00Z` → `2026-06-26T00:17:51Z` — bate com "27/05→25/06/2026, 8305 pedidos".
- **Nenhum dado sensível de cliente** (nome/telefone/endereço/CPF/e-mail) encontrado em
  `ifood_real.jsonl` nem nas 56 colunas dos relatórios mensais — o `payload_original` guarda só dados
  operacionais e financeiros da loja, nunca do cliente identificável.
- **`ifood_real.jsonl` é 100% regenerável.** `demo/ingest_real.ts` (linha 21-22) tem como *default*
  exatamente o caminho do `.xlsx.zip` de origem — `npm run ingest` recria o arquivo do zero a partir do
  dado bruto. Não é um artefato irrecuperável.
- **As 13 conversas de WhatsApp existem, têm o período certo, e o `Estudo_Conversas_WhatsApp.md` é
  claramente derivável delas** — confirmei a data de início e fim da conversa Cinthia Tata (a maior)
  batendo exatamente com o documento, e a presença de mensagens de texto reais no formato esperado
  (`[data, hora] Nome: mensagem`).
- **O protótipo (`index.html`) não tem cardápio inventado residual** — confirmei via grep que
  `const CARDAPIO=[` não existe mais no arquivo, e `window.CARDAPIO_SEED=` está presente (única fonte).
- **`app.js` e `revisao.html` são só casca de UI/QA visual** — não escondem nenhuma regra de decisão;
  o "Modo Revisão" (`?state=`) é homologação visual explícita, nunca ativa em produção sem query param.
- **Nenhum TODO/FIXME/HACK real encontrado** no código principal (`motor.js`, `decisao.js`, `core/*.ts`,
  `app.js`, `index.html`).

## 5. Campos úteis descobertos (não destacados com este nível de detalhe antes)

- **`Logistica.xlsx`** e **`Cardapio.xlsx`** ainda **não são lidos por nenhum código do repositório** —
  só `Auditoria_Dados_Estruturados.md` os descreve. São dois arquivos de alto valor (motoboy real,
  popularidade real) sem nenhum parser ainda escrito.
- **`CLIENTE INFORMOU PROBLEMA EM PEDIDO APÓS A ENTREGA`** é um **flag estruturado do próprio iFood**
  (não texto livre) — `ifoodRelatorio.ts` já usa isso para gerar transição de desfecho com
  `confianca:"alta"`/`procedencia:"observado"` (mais forte que a inferência por regex de texto usada em
  `adaptadores.ts` para SAC/review). Vale destacar isso como um padrão a repetir: sempre que houver flag
  estruturado do iFood, ele deve vencer heurística de texto.
- **PDFs do Bloco 3 têm avaliação por estrela e moderações mês a mês** (2023-2024) — dado que não existe
  em nenhum XLSX (que só cobre a partir de out/2025). Estende a série histórica de qualidade para trás,
  se algum dia for extraído.

## 6. Lacunas críticas (confirmadas, não hipotéticas)

1. **Item real por pedido continua a lacuna nº1** — confirmado, nenhum dos 16 arquivos tem isso para
   pedidos normais.
2. **`Logistica.xlsx` e `Cardapio.xlsx` sem parser no código** — dado real disponível e auditado, mas
   não conectado a nada ainda.
3. **Dois pipelines de ingestão paralelos** (Camada 0 TS vs `autoteste_8pracas.js`) — ver §3.3.
4. **Scripts de `tools/` e `demo/ingest_real.ts` têm caminho absoluto hardcoded** (`C:/Users/italo/...`)
   — ver §7.
5. **Contagem de mensagens do WhatsApp com 9% de divergência não explicada** — ver §3.2.

## 7. Riscos

| Risco | Severidade | Evidência |
|---|---|---|
| **Portabilidade zero dos scripts de `tools/`** | Alta | `tools/autoteste_8pracas.js`, `tools/build_cardapio_knowledge.js`, `tools/build_prototipo.js` e `demo/ingest_real.ts` têm `C:/Users/italo/Desktop/Claude/delviery-os` e/ou o caminho do `.xlsx` no `Downloads` **hardcoded no código**. Rodar em outra máquina, outro usuário, ou até outra pasta neste mesmo Windows quebra imediatamente. Isso é o oposto do "seam único" que o projeto preza para dado — aqui o *caminho do arquivo* é o acoplamento escondido. |
| **Dado-fonte fora do controle de versão, em pasta pessoal (`Downloads`)** | Alta | Todo o pacote de 9 meses vive em `C:\Users\italo\Downloads`, sem backup confirmado. Se essa pasta for perdida, tanto `ifood_real.jsonl` quanto o próprio pacote auditado desaparecem — e não há cópia no repo (por design, `.gitignore` exclui `.jsonl`). |
| **Dois pipelines de ingestão divergentes** | Média | Ver §3.3 — risco de bugs corrigidos só de um lado. |
| **Formato pivotado da Qualidade Operacao exige parser não-trivial** | Média | Sem esse parser, os dados de 2026 de qualidade continuam presos em planilha, mesmo já auditados. |
| **PDFs do Bloco 3 nomeados incorretamente** (Setembro=Outubro) | Baixa | Risco de erro se alguém confiar no nome do arquivo em vez de abrir o conteúdo. |
| **Divergência de contagem do WhatsApp não resolvida** | Baixa | Não muda nenhuma conclusão qualitativa do estudo, mas indica que a metodologia de contagem não foi registrada de forma reproduzível no documento original. |

## 8. Recomendação sobre `ifood_real.jsonl`

**Fatos confirmados** (sem decidir por você, como pedido):
- É **100% regenerável** a partir de `relatorio-pedidos_....xlsx.zip` via `npm run ingest` — não é dado
  primário, é um artefato derivado.
- O dado primário real (o `.xlsx.zip` em si, e os outros 16 arquivos de `Dados Claude.zip`) é que **não
  tem backup versionado nenhum** — vive só em `Downloads`.
- Não contém PII de cliente — não há motivo de privacidade para excluir do controle de versão.
- 112MB é grande para Git normal, mas dentro do limite confortável de **Git LFS** (limite padrão do
  GitHub é 2GB/arquivo em repositórios com LFS habilitado).

**Duas perguntas que só você pode responder, agora com os fatos na mesa:**
1. Vale versionar o **artefato derivado** (`ifood_real.jsonl`) via Git LFS, mesmo sendo regenerável? (Prós:
   reprodutibilidade imediata sem depender do `Downloads`. Contras: mais um lugar para manter sincronizado.)
2. Ou vale focar o backup no **dado primário** (o pacote de 16 arquivos do iFood + os 13 zips de
   WhatsApp + os PDFs do Bloco 3) — por exemplo um bucket externo (S3/Drive) com versionamento — e
   tratar `ifood_real.jsonl` como puro cache, recriável a qualquer momento com `npm run ingest`?

Minha leitura dos fatos (não uma decisão): a opção 2 protege mais valor com menos esforço, porque o
dado primário é o que não se regenera se perdido; o `.jsonl` se regenera em segundos.

## 9. Recomendação sobre o próximo passo

Sem decidir por você — só ordenando pelo que a validação desta auditoria expõe como **mais barato e
mais seguro de destravar agora**, antes de qualquer coisa que dependa de aprovação humana mais pesada
(como o Mapa Canônico completo ou as 5 correções do Red Team):

1. **Corrigir a caracterização do Bloco 3** nos documentos (`Estudo_Conversas_WhatsApp.md` e/ou criar
   nota em `Auditoria_Dados_Estruturados.md`) — não precisa de OCR, precisa de um parser de texto simples
   (`pdftotext` já funciona). Esforço baixo, destrava histórico de qualidade 2023-2024.
2. **Resolver a portabilidade dos scripts de `tools/`** — trocar caminho absoluto por variável de
   ambiente ou argumento de linha de comando (mesmo padrão que `demo/ingest_real.ts` já usa parcialmente
   com `process.argv[2]`). Baixo esforço, remove o maior risco de continuidade encontrado nesta auditoria.
3. **Decidir o destino do dado primário** (§8) antes de gerar o Mapa Canônico — não faz sentido investir
   em estruturar dado que pode não ter backup.
4. Só depois: seguir para o Mapa Canônico de Dados e as correções do Red Team, como já recomendado na
   Auditoria Nível 1.

## 10. Novo grau de confiança por camada

| Dimensão | Nível 1 | Nível 2 (agora) | O que mudou |
|---|---:|---:|---|
| **Código** | 80% | **90%** | Todos os arquivos pendentes foram lidos. Subiu porque agora tenho visão completa; não subiu a 100% porque descobri uma duplicação real de lógica (§3.3) que é dívida técnica ativa, não só "não lido". |
| **Documentação** | 95% | **93%** | Baixou ligeiramente — não porque a documentação piorou, mas porque encontrei 2 imprecisões factuais reais (Bloco 3 não precisa de OCR; contagem de mensagens diverge 9%) que uma auditoria honesta precisa registrar. |
| **Dados** | 75% | **97%** | Maior salto: todos os 16 arquivos brutos foram abertos, parseados e batidos linha/coluna/período contra a documentação. `ifood_real.jsonl` foi validado por completo (contagem, tipos de evento, período, ausência de PII). |
| **Histórico operacional** | 65% | **80%** | Subiu bastante: confirmei existência, período exato e formato das 13 conversas + descobri que o Bloco 3 é mais acessível do que se pensava. Não é 100% porque não li o conteúdo substantivo das mensagens nem processei os PDFs por completo, e a divergência de contagem (9%) ficou sem explicação. |
| **Visão de produto** | 90% | **90%** | Inalterado — esta camada não dependia de dado bruto; já estava bem coberta pela leitura integral dos documentos fundadores. |
| **Continuidade** *(nova dimensão)* | — | **65%** | Esta é a camada que mais preocupa depois desta auditoria: caminhos absolutos hardcoded em 4 arquivos, dois pipelines de ingestão paralelos, e dado primário sem backup versionado. Nada impede o projeto de continuar nesta máquina, mas a portabilidade para qualquer outro ambiente hoje é frágil. |

### Resposta direta: "o projeto pode continuar nesta conta com segurança máxima?"

**Sim, nesta máquina, com uma ressalva clara.** Os dados batem com a documentação em praticamente
100% dos pontos verificáveis, e o motor é determinístico e reprodutível (validei isso executando, não
só lendo). A única coisa que impede "segurança máxima" é a camada de **Continuidade**: se esta máquina
específica (`C:\Users\italo`) for perdida, trocada, ou se o projeto precisar rodar em outro ambiente, os
scripts de `tools/` e `demo/ingest_real.ts` quebram por causa dos caminhos absolutos, e o dado primário
(`Downloads`) não tem backup confirmado em lugar nenhum fora desta máquina. **Isso não é um problema de
reconstrução de contexto — é um risco operacional real e acionável**, e é o item que eu priorizaria
antes de qualquer novo desenvolvimento.

---

## 11. Atualização pós-blindagem (Fase de Continuidade e Portabilidade, jul/2026)

Depois desta auditoria, rodou-se uma fase dedicada só a resolver os riscos do §7, sem tocar em motor,
visual, feature ou tuning. Resumo do que mudou (detalhe completo em `docs/Procedimento_Continuidade.md`,
`docs/Politica_Dados.md`, e no resumo da fase):

- **Caminhos absolutos removidos** dos 4 arquivos que tinham `C:/Users/italo/...`
  (`demo/ingest_real.ts`, `tools/autoteste_8pracas.js`, `tools/build_cardapio_knowledge.js`,
  `tools/build_prototipo.js`) — agora resolvem caminho via `__dirname`/CLI arg/variável de ambiente,
  com padrão relativo ao próprio repo. **Todos os 4 fixes foram validados objetivamente**: rodados
  antes/depois e comparados byte a byte ou por hash — zero mudança de comportamento em todos.
- **`data/raw/` e `data/canonico/`** criados como convenção de pasta local (gitignorada) para dado
  bruto e derivado — ver `docs/Politica_Dados.md`.
- **`.env.example`** documenta as variáveis de ambiente aceitas; nenhuma é obrigatória (todas têm
  padrão relativo ao repo).
- **Regeneração de `data/ifood_real.jsonl` virou processo documentado** no `README.md` (entrada,
  comando, saída, validação embutida, total esperado, quando regenerar).
- **Duplicação de parser (achado do §3.3) reduzida, não eliminada por decisão deliberada:** a lógica de
  parsing foi extraída para `src/ingest/parserRelatorioIfood.js`, único lugar agora; `tools/autoteste_8pracas.js`
  importa dali. A unificação maior (backtest passar a consumir `data/ifood_real.jsonl` em vez do xlsx
  bruto) foi analisada e **adiada de propósito** — risco de reconciliar ID curto×completo e round-trip
  de fuso horário não valia a pena nesta fase de baixo risco. Ver decisão completa no resumo da fase.
- **Dois incidentes de continuidade capturados em tempo real durante esta própria fase** (arquivo
  desaparecido sem comando; script quase sobrescrevendo dado commitado com bug pré-existente de
  nomenclatura de praça) — ambos revertidos sem perda, ambos documentados em
  `docs/Procedimento_Continuidade.md` como prova de que o procedimento funciona.
- **Bloco 3 e contagem de WhatsApp corrigidos** em `docs/Estudo_Conversas_WhatsApp.md`.

### Nota de Continuidade revisada

| Dimensão | Nível 2 | Pós-blindagem |
|---|---:|---:|
| **Continuidade** | 65% | **90%** |

Não é 100% porque três coisas continuam pendentes de decisão humana, não de engenharia: (1) backup do
dado primário fora da máquina do César continua não resolvido — só a estrutura de pastas para recebê-lo
foi criada; (2) a unificação completa dos dois pipelines de ingestão foi adiada por decisão, não
resolvida; (3) o bug de nomenclatura em `tools/build_cardapio_knowledge.js` (praças) foi descoberto mas
não corrigido nesta fase (fora de escopo: mexer nisso é decisão de produto/cardápio, não de
portabilidade).
