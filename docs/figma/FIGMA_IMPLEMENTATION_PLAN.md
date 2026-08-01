# Plano de implementação no Figma — e o que foi realmente feito

> Arquivo: `DeliveryOS — Product System` · `IMWH8ZKMF5ra3QJYiR6vGa` · editorType `design`.
> Acesso verificado nesta sessão: `whoami` = Cesar Spichencoff, seat **View**, plano Starter.
> **Escrita permitida e exercida** — 6 scripts de escrita executados com sucesso.

## 1. O que foi encontrado antes de editar

A memória executável (`STATE.json.figma_fatos_verificados_nao_reinvestigar`) afirmava páginas
`01` e `02` **vazias** e **0 variáveis/estilos**. O estado real, lido pela API do plugin:

| Página | Estado encontrado |
|---|---|
| `00 — Overview & Architecture` (`0:1`) | capa `DeliveryOS — Product System Cover` (1440×900) |
| `01 — Design System` (`2:2`) | **4 seções**: `01.1 Foundations` e `01.2 Severidade e estados de RUNTIME` completas; `01.3` e `01.4` **vazias** |
| `02 — Product Flows & Screens` (`2:3`) | **vazia** |
| Variáveis | **49**, coleção `DeliveryOS` |
| Estilos de texto | **9** · efeito **3** · cor **0** |

Alguma sessão anterior escreveu no Figma e **não registrou**. O registro foi corrigido.

**Armadilha confirmada de novo:** `get_metadata` sem `nodeId` listou **uma** página. A API do
plugin é a autoridade.

## 2. Decisão: preservar, não substituir

`01.1` e `01.2` são bons e não foram tocados — `01.2` já resolve os cinco estados de runtime com
glifos que funcionam sem cor (`cell/solid`, `cell/hatch`, `cell/dashed`, `cell/x`), e o vocabulário
de estados desta unidade **estendeu** essa ideia em vez de competir com ela.

As 49 variáveis foram **extraídas** para `DESIGN_TOKENS.json`, não redefinidas.

## 3. O que foi construído

| Página | Nó | Conteúdo | Nós criados |
|---|---|---|---|
| `01` | `01.3` (`8:66`) | 22 estados semânticos em 6 eixos, cada um com badge (glifo + rótulo + padrão), descrição e o seletor CSS correspondente | 1 raiz + 22 cartões |
| `01` | `01.4` (`8:67`) | catálogo de componentes: `ds-state` (4 variantes), `campo` (2), `metric` (2), `estado-tela` (4), `bloco-evidencia`, `bloco-limitacao` | 6 componentes, 4 variant sets |
| `01` | coleção | **7 variáveis novas**: `ink/calm · age · reduce · lost · fail · prep · faint` | 7 |
| `02` | 8 frames | `02.1–02.4`, desktop 1440×900 e mobile 375×812, para Entregas, Operação Viva, Conference Brain e Copiloto Shadow | 8 frames |
| `02` | `02.5` (`26:2`) | 10 estados essenciais de tela | 1 seção + 10 cartões |
| `00` | `00.1` (`27:2`) | mapa dos 11 módulos, cadeia Op. Viva → Brain → Copiloto, caminho crítico × assíncrono, legenda de procedência, 7 verdades operacionais | 1 seção |

Tudo em Auto Layout, com variáveis vinculadas por `setBoundVariableForPaint` e estilos de texto
aplicados por `setTextStyleIdAsync`. Nenhum frame solto, duplicado ou sem finalidade.
**Nenhuma página nova foi criada. O arquivo não foi renomeado. Nenhum segundo arquivo existe.**

## 4. Defeitos próprios no caminho

1. **`Spectral Light` não carregado.** `Display / Atencao soberana` usa esse peso; `setTextAutoResize`
   lançou. O script é atômico — nada foi escrito. Corrigido carregando a fonte.
2. **Frame de tela não era Auto Layout.** `figma.createFrame()` devolve frame comum, e os filhos não
   podem usar `FILL`. Corrigido tornando o próprio frame da tela um Auto Layout `FIXED × FIXED`.
3. **Colisão de glifo.** `controle` e `planejado` compartilhavam `◇`, `dotted` e `ink/faint` —
   indistinguíveis em preto e branco. Achado pelo **teste de código**, não pelo olho, e corrigido
   nos dois lados (`▷` para planejado).

## 5. Variáveis criadas, e por quê

Os sete `ink/*` **não existiam** no Figma. Eles nasceram de uma medição feita nesta unidade:
`signal/calm` dá 3,72:1 e `text/faint` dá 3,77:1 sobre `surface/work` — os dois reprovam em 4,5:1.
As cores de sinal servem a ponto, traço e glifo; texto pequeno precisava de versões escuras.
Elas foram criadas **no Figma e no CSS ao mesmo tempo**, com o mesmo valor, e o gate proíbe divergência.

## 6. Limites do que o Figma prova

- Os frames são **representações fiéis**, não capturas do app. A paridade é garantida por
  nomenclatura idêntica e por `FIGMA_CODE_PARITY_MATRIX.md`, não por pixel.
- Não há protótipo interativo (ligações entre frames). O comportamento vive no código, e a
  navegação real foi verificada no navegador.
- Não há Code Connect configurado.
- Os frames desktop mostram o conteúdo cortado em 900px de altura, como uma tela real cortaria.
