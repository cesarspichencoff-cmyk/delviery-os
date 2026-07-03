# Política de Dados — o que entra no Git e o que não entra

> Nasce da Fase de Continuidade e Portabilidade (jul/2026), depois da Auditoria Nível 2 ter confirmado
> que os dados batem com a documentação, mas que o dado bruto vive só em `Downloads`, fora de qualquer
> controle de versão ou backup. Este documento fixa a regra para não depender mais disso.
> **Nenhum dado bruto foi movido para o GitHub por conta deste documento** — só a estrutura de pastas e
> as regras. Mover dado de verdade para dentro do repositório continua exigindo decisão explícita.

## As três categorias

| Categoria | Onde vive | Entra no Git? | Exemplo |
|---|---|---|---|
| **Bruto (raw)** | `data/raw/` (novo, não classificado → `data/raw/incoming/<lote>/`) | **Não** — gitignorado | relatórios iFood (.xlsx/.xlsx.zip/.html), exports de WhatsApp, PDFs do Bloco 3 |
| **Gerado/derivado** | `data/*.jsonl`, `data/canonico/`, `data/generated/` | **Não** — gitignorado | `data/ifood_real.jsonl`, os 5 `.jsonl` canônicos do `Mapa_Canonico_Dados.md` (quando aprovados), saídas exploratórias de parser (ex.: `itens_pedido_reais_*.jsonl`) |
| **Referência/conhecimento (set-once)** | `data/*.json`, `data/*.txt` | **Sim** — versionado | `cardapio_knowledge_seed.json`, `cardapio_fonte.txt`, `exemplo_noite_real.csv` |

A regra de decisão é simples: **se um comando do repositório consegue regerar o arquivo a partir de
outra coisa, ele não precisa estar no Git.** Se o arquivo *é* a própria fonte de verdade (cadastro
set-once, pequeno, sem dado de cliente), ele pode e deve estar no Git — é isso que já vale para o
cardápio.

## `data/raw/` — dado bruto, local, nunca versionado

Convenção de nome esperada pelos scripts (todos com fallback documentado — ver `.env.example`):

```
data/raw/relatorio_pedidos_ifood.xlsx     ← export de pedidos do iFood (usado por npm run ingest
                                              e por node tools/autoteste_8pracas.js)
```

**`data/raw/incoming/<lote>/`** — recepção de lotes novos ainda não classificados (ex.:
`data/raw/incoming/ifood_2026-07-01/`). Todo arquivo recebido entra primeiro aqui, é registrado em
`docs/Inventario_Dados_Primarios.md`, e só então (se aprovado) ganha um parser e um destino oficial.
Gitignorado do mesmo jeito que `data/raw/`.

Só existe um `.gitkeep` versionado em cada uma dessas pastas — ele existe só para a pasta aparecer num
clone novo; qualquer arquivo de dado real que você colocar aqui **nunca é adicionado ao Git** (regra em
`.gitignore`: `/data/raw/*` com exceção do próprio `.gitkeep`).

Outras fontes brutas do projeto (não entram na convenção de nome fixo acima porque nenhum script ainda
as lê programaticamente — ver `docs/Auditoria_Nivel2_Validacao_Base.md` §5) continuam onde estão hoje,
em `Downloads` no computador do César: os outros 15 arquivos de `Dados Claude.zip`, as 13 conversas de
WhatsApp e os 8 PDFs do Bloco 3. Recomendação (não é decisão automática — ver "Backup", abaixo): quando
algum desses ganhar um parser, ele deveria passar a viver também em `data/raw/` por convenção, com o
nome documentado no próprio script que o lê.

## `data/canonico/` — dado gerado, local, nunca versionado

Reservado para os 5 arquivos `.jsonl` propostos em `docs/Mapa_Canonico_Dados.md` (pedidos, eventos
logísticos, desfechos, popularidade, qualidade). Hoje vazio — a pasta existe só como convenção de
destino; a geração continua **aguardando aprovação humana**, como já registrado naquele documento. Se
algum dia entrar dado com granularidade suficiente para reidentificar pessoas, ele deve continuar aqui
(fora do Git) mesmo depois de gerado.

## `data/generated/` — saída de parser exploratório, local, nunca versionado

Diferente de `data/canonico/` (reservado só para os 5 arquivos oficiais do Mapa Canônico, depois de
aprovados), `data/generated/` é para **saída de parser em fase de exploração/validação** — antes de
qualquer decisão de integração. Exemplo: `itens_pedido_reais_2026-07-01.jsonl`, gerado por
`tools/parse_relatorio_pedidos_html.js` a partir de um lote em `data/raw/incoming/`, usado só para
testar hipótese (ver `docs/Relatorio_Fonte_Real_Itens_2026-07-01.md`), nunca lido pelo motor oficial.

## Por que dado gerado não é versionado

Não é regra sobre sensibilidade — é regra sobre **honestidade de fonte única**: se `data/ifood_real.jsonl`
estivesse no Git, ele viraria uma segunda verdade que pode divergir silenciosamente do relatório bruto
que o gerou (o mesmo erro estrutural que a Lei 10 dos `Leis_Fundamentais.md` proíbe para o núcleo do
produto — aqui aplicado à própria engenharia de dados do projeto). O comando que gera cada artefato
derivado é a fonte de verdade sobre como reproduzi-lo, não o arquivo em si.

## Sensibilidade — o que já foi checado

A Auditoria Nível 2 abriu e conferiu as 56 colunas de `data/ifood_real.jsonl` e dos relatórios mensais:
**nenhum campo de cliente identificável** (nome, telefone, endereço, CPF, e-mail) existe nesses arquivos
— só dados operacionais e financeiros da loja. Isso [reduz o risco de vazar dado sensível se algum
arquivo entrar no Git por engano], mas **não é autorização** para versionar nada — a regra acima (raw e
gerado nunca entram) vale independente de conter ou não PII, porque a razão de não versionar é sobre
fonte única, não só sobre privacidade.

As conversas de WhatsApp (`Bloco 2`) **têm nomes de pessoas reais da equipe** — essas nunca devem ser
consideradas para versionamento, sob nenhuma circunstância, mesmo que algum dia ganhem um parser.

## Backup do dado primário (recomendação, não decisão automática)

A Auditoria Nível 2 (`docs/Auditoria_Nivel2_Validacao_Base.md`, §7-8) já registrou o risco: o pacote de
16 arquivos do iFood, as 13 conversas de WhatsApp e os 8 PDFs do Bloco 3 vivem só em
`C:\Users\italo\Downloads`, sem backup confirmado. Esta política de dados resolve **onde as coisas
vivem dentro do repositório**; não resolve backup fora dele. Isso continua sendo uma decisão do César —
opções levantadas na Auditoria Nível 2: bucket externo com versionamento (S3/Drive), ou pasta local com
backup automático do sistema operacional. Nenhuma delas foi executada por conta deste documento.

## Checklist rápido antes de adicionar qualquer arquivo de dado ao Git

1. Este arquivo é regenerável por um comando do repositório? → **não versiona**.
2. Este arquivo tem qualquer coluna/campo que identifique uma pessoa (cliente ou equipe)? → **nunca
   versiona**, mesmo que pequeno ou regenerável fosse permitido por outro motivo.
3. Este arquivo é cadastro de referência, pequeno, set-once, sem dado de pessoa? → pode versionar (é o
   que já vale para `cardapio_knowledge_seed.json`).
4. Na dúvida → pergunte antes. Esta política existe para que a resposta nunca precise ser "parece que
   tudo bem", e sim uma checagem objetiva.
