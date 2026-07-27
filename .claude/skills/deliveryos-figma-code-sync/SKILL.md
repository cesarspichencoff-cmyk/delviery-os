---
name: deliveryos-figma-code-sync
description: >
  Sincronização entre o Figma "DeliveryOS — Product System" e o código real.
  Use ao criar ou atualizar telas, componentes, tokens e estados no Figma; ao
  mapear componente Figma para componente de código; e ao registrar divergência
  entre design e implementação. Também use antes de desenhar qualquer tela nova.
---

# Figma ↔ código do DeliveryOS

## Objetivo

Que o Figma documente a experiência operacional **real**, e não uma que não
existe. Design que mostra função inexistente sem marcação vira promessa que
alguém cobra.

## Arquivo oficial

```
https://www.figma.com/design/IMWH8ZKMF5ra3QJYiR6vGa
fileKey: IMWH8ZKMF5ra3QJYiR6vGa
```

Três páginas, e **somente** três. Use sections e frames dentro delas.

| Página | id | Conteúdo |
|---|---|---|
| `00 — Overview & Architecture` | `0:1` | arquitetura, runtimes, jornada do evento, gates |
| `01 — Design System` | `2:2` | foundations, componentes, estados |
| `02 — Product Flows & Screens` | `2:3` | shell, Entregas, Android, Copiloto shadow |

O Figma **não é fonte de verdade do domínio**. O código é. Divergência se
resolve olhando o código primeiro.

## Quando usar

Antes de desenhar qualquer coisa. Antes de mapear componente. Ao encontrar
divergência.

## Ordem obrigatória: observar antes de inventar

1. execute a interface atual;
2. inventarie telas e componentes que já existem;
3. capture a interface existente;
4. identifique o reutilizável e as divergências;
5. **preserve identidade válida** — não redesenhe o que já está certo;
6. corrija só a inconsistência que atrapalha de verdade.

Redesenhar tudo sem olhar o código produz um Figma bonito e mentiroso.

## Estados que não podem parecer iguais

Runtime: `healthy` `degraded` `read_only` `blocked` `unavailable`

Conexão/observação: `initializing` `ready` `replaying` `stale` `disconnected`
`degraded` `failed` `stopped`

Cada um precisa ser distinguível **sem ler o rótulo** — por forma, peso ou
posição, não só por cor. Distinguir apenas por matiz falha para quem tem
daltonismo, e falha num balcão com sol batendo na tela.

`stale` e `healthy` parecidos é o pior par possível: é exatamente a confusão que
faz alguém confiar num dado velho.

## Classificação obrigatória de cada tela

```
implemented · designed_and_approved · designed_future
deprecated · missing_in_code · missing_in_figma
```

Tela `designed_future` **precisa** de marcação visível no próprio frame. Sem
isso ela é indistinguível de função pronta.

## Registro por componente

```
figma_node · component_name · code_path · framework
states · variants · accessibility_notes · sync_status
```

## Code Connect

Quando disponível: mapeie React/JS para a interface web, Compose/Kotlin para o
Android. **Nunca mapeie frame genérico para componente inexistente** — um
mapeamento falso é pior que nenhum, porque some na lista dos verdadeiros.

Quando indisponível: produza o plano com caminhos reais e
`sync_status: pending_external_sync`.

## Regras da API do Figma que já custaram tempo

- carregue a orientação `figma-use` **antes** de `use_figma` — é pré-requisito;
- `figma.currentPage` reseta entre chamadas; use
  `await figma.setCurrentPageAsync(page)`, e **no máximo uma troca por script**;
- trabalho multi-página: uma chamada por página, todas na **mesma mensagem**;
- cores em 0–1, não 0–255;
- texto exige `loadFontAsync` antes de mutar;
- `HUG`/`FILL` só depois de `appendChild`;
- `get_metadata` lista apenas a página carregada — para saber quantas páginas
  existem de verdade, pergunte pela API do plugin. Ela é a autoridade.

## Ações permitidas

Criar e atualizar sections, frames, componentes, variáveis e estilos dentro das
três páginas. Registrar divergência. Marcar futuro como futuro.

## Ações proibidas

Criar página nova · criar arquivo novo · tratar Figma como fonte de verdade do
domínio · desenhar função inexistente sem marcação · mapeamento falso de Code
Connect · apagar trabalho de design existente sem registro.

## Verificadores

**`npm run test:platform:figma` AINDA NÃO EXISTE.** Ele será escrito junto com
os artefatos de `docs/figma/`, e deve afirmar que todo `code_path` do
`COMPONENT_MAPPING.md` existe no repositório, que todo estado crítico aparece no
inventário, e que nenhuma tela `designed_future` está sem marcação.

Até lá, o verificador executável é este — ele pega o defeito que mais importa,
que é mapeamento apontando para arquivo inexistente:

```bash
node -e "const fs=require('fs');const p='docs/figma/COMPONENT_MAPPING.md';if(!fs.existsSync(p)){console.log('handoff ainda nao existe');process.exit(0)}const faltando=[...fs.readFileSync(p,'utf8').matchAll(/code_path[:\s|]+([^\s|]+\.[a-z]+)/g)].map(m=>m[1]).filter(c=>!fs.existsSync(c));console.log(faltando.length?'code_path inexistente: '+faltando.join(', '):'todos os code_path existem');process.exit(faltando.length?1:0)"
```

Complementos manuais, no Figma:

- `get_metadata` confirma a estrutura criada (contagem, hierarquia, nomes);
- `get_screenshot` confirma que nada ficou cortado ou sobreposto — texto clipado
  por line-height é o defeito visual mais fácil de não ver.

## Limite de iterações

Três por página. Se a mesma seção falhar três vezes, quebre em pedaços menores —
o limite prático é ~10 operações lógicas por chamada.

## Condição de sucesso

Três páginas povoadas · estados críticos distinguíveis · inventário completo ·
divergências registradas · nenhuma tela futura sem marcação.

## Condição de parada

MCP indisponível ou arquivo somente leitura. Nesse caso produza o handoff em
`docs/figma/` e continue a missão — isso não bloqueia o resto.

## Evidências produzidas

`docs/figma/SCREEN_INVENTORY.md` · `COMPONENT_MAPPING.md` ·
`DESIGN_TOKENS.json` · `FIGMA_SYNC_MANIFEST.json` · ids de nó retornados por
`use_figma` · capturas.
