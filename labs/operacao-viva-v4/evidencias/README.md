# Evidências — Lab Operação Viva V4

Capturas de tela das cenas do Lab, em três viewports. Todas as cenas são
**FIXTURE**: nenhuma captura mostra operação real, e nenhuma contém PII.

## Como este conjunto se atualiza

Rodar teste e publicar evidência são **duas ações diferentes**, e isso não é
formalidade: enquanto foram a mesma, o gate apagou este diretório três vezes
numa sessão só, porque limpava antes de tentar abrir o navegador (D4).

| | |
|---|---|
| `npm run test:lab:v4:browser` | prova comportamento · grava em diretório **temporário** e descarta · **nunca toca neste diretório** |
| `npm run evidence:lab:v4:refresh` | **único** caminho que substitui este conjunto · publica os 12 inteiros ou não publica nada |

O gate normal recusa rodar apontado para cá, por comparação de caminho real —
`LAB_V4_EVIDENCIAS` não contorna. Guarda: `npm run test:lab:v4:evidencias`.

## Procedência

`procedencia.json` carrega o que a máquina conseguiu **medir**: hash, tamanho e
dimensão real de cada imagem, e — quando houver regeneração deliberada — o
build de Chromium que de fato rodou, a versão de Playwright, a plataforma e o
commit.

As imagens **atuais** são anteriores ao manifesto, e nada registra qual
navegador as gerou. Por isso o manifesto diz:

```
browser_provenance: UNKNOWN_FOR_EXISTING_BASELINE
```

Nenhum build foi eleito referência canônica por conveniência. UNKNOWN também
não é motivo para apagar: as imagens ficam preservadas até uma regeneração
deliberada medir a procedência de verdade.

Viewports: desktop 1280×800 · tablet 768×1024 · celular 390×844
(a altura das capturas é `fullPage`, maior que a viewport — a dimensão medida
de cada arquivo está em `procedencia.json`)

- `ausencia-de-dados--celular.png`
- `ausencia-de-dados--desktop.png`
- `ausencia-de-dados--tablet.png`
- `calma-real--celular.png`
- `calma-real--desktop.png`
- `calma-real--tablet.png`
- `recomendacao-corrigida--celular.png`
- `recomendacao-corrigida--desktop.png`
- `recomendacao-corrigida--tablet.png`
- `sushi-quentes-isolado--celular.png`
- `sushi-quentes-isolado--desktop.png`
- `sushi-quentes-isolado--tablet.png`
