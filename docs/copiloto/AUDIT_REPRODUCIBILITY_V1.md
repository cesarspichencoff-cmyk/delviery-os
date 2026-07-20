# Análise de Reprodutibilidade — Auditoria das Células V1

> Branch `fix/copiloto-celulas-v1-audit` (a partir de `82d300c`). Investigação da
> divergência de suítes relatada pela auditoria independente. **Nenhuma falha
> preexistente foi corrigida** — apenas diagnosticada e classificada (§4 da missão).

## Ambiente

| Item | Valor |
|---|---|
| SO | Windows 10.0.22631 (MINGW64) |
| Node | v24.18.0 |
| npm | 11.16.0 |
| Env vars de shadow/porta/modo | **nenhuma** definida |
| Servidor Copiloto rodando | nenhum |
| `git config core.autocrlf` | **true** |
| `.gitattributes` | **ausente** |

## Divergência relatada × reproduzida

| Suíte | Relatado (auditoria) | Meu working tree in-place | Fresh checkout `82d300c` | Fresh checkout `101680a` |
|---|---|---|---|---|
| Live | 239 pass / 1 fail | 240 / 0 | **239 / 1** | 217 / 1 |
| Copiloto | 53 / 0 | 53 / 0 | 53 / 0 | 53 / 0 |
| Capacidade | 27 / 16 | 43 / 0 | **27 / 16** | 27 / 16 |

Comparação feita com o **mesmo** Node/npm/SO, mesmas env vars, mesma ordem, via `git worktree add --detach` (checkout limpo).

## Causa-raiz

**`core.autocrlf=true` + ausência de `.gitattributes`** corrompe o arquivo de configuração validado por hash na checkout.

- O config `data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json` é validado por SHA-256 (`f248a173…`) na inicialização do motor sombra (`src/capacidade-viva/shadow/config.js`).
- Em **checkout limpo** (clone/worktree novo), o git aplica LF→CRLF ao arquivo (tratado como "texto"): 7030 → 7233 bytes → hash **`734a10f9…` ≠ `f248a173…`**.
- `loadShadowConfig()` então retorna `ready:false, config:null` (comportamento correto e seguro: "não inicia com config não validada").
- Todos os testes de sombra que leem `config.xxx` lançam `Cannot read properties of null/undefined` → **16 falhas de Capacidade + 1 de Live**.
- No meu working tree **in-place**, o arquivo manteve os bytes originais (LF, 7030 bytes) — nunca foi re-checkout através do autocrlf —, então o hash bate e as suítes passam (43/0, 240/0). É por isso que o relatório original informou verde: reflete o working tree in-place, não uma checkout limpa.

## Classificação de cada falha

Conjunto de falhas **idêntico** em `82d300c` e `101680a` (diff vazio entre as listas). Portanto:

| Falha | Suíte | Classificação |
|---|---|---|
| `hash correto habilita o motor sombra` | Capacidade | **PREEXISTENTE + DEPENDENTE DE AMBIENTE (checkout)** |
| `hash incorreto bloqueia somente o motor sombra` | Capacidade | idem |
| `saída do human-v2 não altera estado oficial` | Capacidade | idem |
| `nenhuma decisão automática é emitida` | Capacidade | idem |
| `qualidade da fonte tem precedência` | Capacidade | idem |
| `motoboy 5–9.99 / 10–14.99 / 15–19.99 / 20+ min` (4) | Capacidade | idem |
| `pronto sem saída <25 / 25–35 / 35–40 / 40+` (4) | Capacidade | idem |
| `volume/ evidência… nome de funcionário ou ranking` | Capacidade | idem |
| `multiplicidade: zumbi + normal + crítico` | Capacidade | idem |
| `deduplicação: sequência real de 8 ticks` | Capacidade | idem |
| `launcher tools/servir_v1_shadow.js liga a flag / observação sombra real` | Live | idem |

**Total: 17 falhas (16 Capacidade + 1 Live).**

- **Regressões introduzidas por `82d300c`: 0.** O commit das células adicionou 22 testes (todos verdes) e não tocou config, motor sombra, launcher ou calibração.
- **Dependentes de ambiente: 17** (todas). Reproduzem só em checkout limpo (autocrlf).
- **Não reproduzidas: 0** — todas reproduzidas.

## Regra aplicada (§4)

As 17 falhas **existem igualmente em `101680a`** (baseline congelado). Por instrução, **não** foram corrigidas nesta branch: não se tocou shadow launcher, Capacidade Viva, calibração, config nem infraestrutura. Registradas como **dívida preexistente e dependência de integração**.

## Recomendação (fora do escopo desta missão — decisão do César)

Adicionar um `.gitattributes` marcando o config validado por hash (e, idealmente, os `.json` de dados sensíveis a hash) como `-text` / `eol=lf`, para que a checkout não altere seus bytes. Isso tornaria as suítes de sombra reprodutíveis em qualquer clone. **Não aplicado aqui** — é infraestrutura preexistente, fora do escopo (correção do rótulo da Cozinha) e afeta o repositório todo; requer decisão explícita.

## Resultado após a correção do rótulo (D2)

No working tree in-place (config íntegro): **Live 243 / 0 · Copiloto 53 / 0 · Capacidade 43 / 0** (3 testes de regressão novos incluídos). A correção do rótulo é ortogonal às 17 falhas de checkout — não as cria nem as resolve.
