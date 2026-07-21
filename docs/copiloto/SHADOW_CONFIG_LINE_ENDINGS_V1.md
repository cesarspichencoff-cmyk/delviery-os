# Reprodutibilidade da configuração de sombra — finais de linha

> Branch `fix/shadow-config-line-endings-v1`, a partir do baseline congelado `101680a`.
> Correção isolada de dívida **preexistente**. Não pertence às células operacionais
> (`82d300c` / `97fd799`) e não as incorpora.

## Causa-raiz

A configuração da Capacidade Viva em modo sombra é validada por **SHA-256** na
inicialização (`src/capacidade-viva/shadow/config.js`): se o hash do arquivo não
corresponder ao canônico, o motor sombra **corretamente se recusa a iniciar**
(`ready:false`, `config:null`) — comportamento de segurança, não bug.

Em **checkout novo no Windows** com `core.autocrlf=true` e **sem `.gitattributes`**,
o Git materializava esse arquivo convertendo LF→CRLF. Os bytes mudavam, o hash
deixava de bater, a configuração vinha nula e os testes que dependem dela falhavam
em cascata.

Ponto decisivo: **o blob armazenado no Git sempre foi canônico** (7030 bytes, 0 CR,
203 LF, SHA-256 `f248a173…`). A corrupção acontecia **apenas na materialização do
checkout** — por isso um working tree antigo (nunca re-materializado) passava nos
testes, enquanto qualquer clone/worktree novo falhava. Isso explica a divergência
entre o relatório original (verde) e a auditoria independente (17 falhas).

## Arquivo afetado

```
data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json
```

| | Valor |
|---|---|
| Hash canônico esperado (no carregador) | `f248a17328ca71fc8608e0897d24ee3966bf0b7bcd55afbebb6feaa4cc7534dc` |
| Blob no Git | 7030 bytes · 0 CR · 203 LF · hash canônico |
| Checkout corrompido (antes da correção) | 7233 bytes · CRLF · `734a10f9…` |
| Impacto | 16 falhas em Capacidade Viva + 1 em Live |

## Comportamento com `core.autocrlf=true` (antes × depois)

| | Antes | Depois |
|---|---|---|
| Bytes no checkout | 7233 | **7030** |
| CR | presentes | **0** |
| SHA-256 | `734a10f9…` | **`f248a173…`** |
| `loadShadowConfig()` | `ready:false`, `config:null` | **`ready:true`** |
| Capacidade Viva | 27/16 | **43/0** |
| Live | 217/1 | **218/0** |

## Regra adicionada (`.gitattributes`)

```
data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json text eol=lf
```

- Mantém LF **no índice** (onde o blob já estava) e força LF **no checkout**, independentemente de `core.autocrlf`.
- Deliberadamente **específica ao caminho**: sem regra ampla (`*.json`), sem `* text=auto`, sem marcar o repositório como binário.
- `text eol=lf` em vez de `-text` porque o arquivo **é** texto — assim o diff continua legível e o versionamento normal.
- É o **único** arquivo em disco validado por SHA-256 neste repositório (verificado; `src/live/normalizar.js` hasheia objetos em memória, não arquivo).

## Preservação do conteúdo canônico

`git add --renormalize` do arquivo foi **no-op** — o blob já era LF, então **o
config não aparece no diff**. Nenhum valor, limite, regra, rótulo, versão de
calibração, cenário, parâmetro ou hash esperado foi alterado. O único arquivo do
commit é o `.gitattributes`.

## Comandos de validação

```bash
git check-attr text eol -- data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json
sha256sum data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json
node -e "console.log(require('./src/capacidade-viva/shadow/config.js').loadShadowConfig().ready)"

node --test tests/live/*.test.js tests/live/simulator/*.test.js
npm run copiloto:test
npm run capacidade:test
```

## Resultados nos dois modos de checkout (worktrees novos a partir do commit da correção)

| Verificação | `core.autocrlf=true` | `core.autocrlf=false` |
|---|---|---|
| `check-attr` | `text: set` · `eol: lf` | `text: set` · `eol: lf` |
| Bytes | 7030 | 7030 |
| CR | 0 | 0 |
| SHA-256 | `f248a173…` ✅ | `f248a173…` ✅ |
| `loadShadowConfig()` | `ready:true` | `ready:true` |
| Live | **218 / 0** | **218 / 0** |
| Copiloto | **53 / 0** | **53 / 0** |
| Capacidade Viva | **43 / 0** | **43 / 0** |

## Teste de regressão

Nenhum teste novo foi criado. O teste existente **`hash correto habilita o motor
sombra`** (`tests/capacidade-viva/run.js`) já compara o SHA-256 do arquivo
materializado com o canônico e exige `ready:true` — ele era, inclusive, uma das 16
falhas antes da correção. Portanto já impede a recorrência, não depende de caminho
absoluto e não altera configuração global do Git. Duplicá-lo seria redundante.

## Limitações

- **O restante do repositório continua sem regra de finais de linha.** Só o arquivo
  validado por hash foi protegido (escopo mínimo, conforme instruído). Num checkout
  com `core.autocrlf=false` após materialização sob `true`, os demais arquivos
  aparecem como modificados — verificado: **271 arquivos, 63845 inserções / 63845
  deleções, e 0 arquivos com diferença real de conteúdo** (`git diff
  --ignore-cr-at-eol` vazio). É churn preexistente de finais de linha, não afeta o
  config protegido (que permanece limpo) nem nenhum resultado de teste.
- Normalizar o repositório inteiro (ex.: `* text=auto`) reescreveria os finais de
  linha de todos os arquivos versionados — mudança ampla, fora do escopo desta
  missão. Fica registrada como **recomendação para decisão do César**, não aplicada.
- A correção não altera nada funcional: células operacionais, ENTREGAS, Capacidade
  Viva, motor, launcher, contratos e calibração permanecem intocados.
