# Avaliação independente — REVOLUTION 0-A

> **O contexto desta avaliação foi fixado e registrado ANTES de o relatório ser gravado**, por
> determinação do César. A §2 é a resposta **literal** do avaliador, sem alteração de achado,
> severidade ou veredito. Qualquer leitura do construtor vive na §3, separada e identificada.

---

## 1. Contexto fixado da avaliação

### 1.1 Commit avaliado

| Campo | Valor |
|---|---|
| Branch | `feature/deliveryos-hybrid-platform-foundation-v1` |
| **HEAD no lançamento do avaliador** | **`f164520`** |
| HEAD ao fim da avaliação | `e1dc67a` |
| Commits ocorridos durante a avaliação | `f28fcf1` · `5306074` · `e1dc67a` |

**Os três commits durante a avaliação são SOMENTE de documentação.** Verificado por Git, não
assumido:

```
git diff --name-only f164520..e1dc67a -- labs/ src/ package.json
(vazio)
```

Logo **o código avaliado é idêntico em qualquer um desses HEADs**. O que mudou entre eles foi
`BLOCKERS.md`, `DECISIONS.md`, `PROMPT_LESSONS.md`, `STATE.json`, a auditoria do construtor, o
ponteiro no estado canônico e a tabela de progresso. Nenhum arquivo do Lab, nenhum arquivo de `src/`,
nenhum script de `package.json`.

**Registro honesto:** o avaliador não recebeu instrução de fixar um commit. Se o `git rev-parse HEAD`
do relatório dele apontar para qualquer um dos quatro, é o mesmo código.

### 1.2 Working tree

| Momento | Estado |
|---|---|
| No lançamento do avaliador | **limpo** |
| Durante a avaliação | 4 PNGs de evidência modificados — `calma-real--celular`, `calma-real--tablet`, `sushi-quentes-isolado--desktop`, `sushi-quentes-isolado--tablet` |

Esses quatro foram regravados pelo **próprio avaliador** ao executar `npm run test:lab:v4:browser`,
que recria o diretório de evidências. Medido: **mesmas dimensões e mesmo tamanho** dos commitados —
é ruído sub-pixel de codificação PNG, não mudança de conteúdo. Restaurados ao fechamento.

**Nenhum arquivo de código, documentação, fixture ou teste foi alterado pelo avaliador.**

### 1.3 Quem avaliou

| Campo | Valor |
|---|---|
| **Modelo do avaliador** | **Sonnet 5** (`claude-sonnet-5`) |
| Modelo do construtor | Opus 5 (`claude-opus-5`) |
| Contexto | novo e mínimo — sem a justificativa, o raciocínio, as limitações escritas pelo construtor, a defesa das decisões, o checkpoint pretendido ou qualquer conclusão sugerida |
| Modo | read-only: proibido editar código, documentação, fixture ou teste, e proibido commitar |

A escolha do modelo segue `docs/execution/DELIVERYOS_MODEL_ROUTING.md`, que manda usar, para
auditoria final independente, **modelo diferente do que implementou**. A decisão foi de política do
repositório, não de conveniência — e o custo está declarado na §3.

### 1.4 O que o avaliador recebeu

Somente: a Constituição do produto · os critérios de aceitação da 0-A · o comando e a URL para abrir
o Lab · os 18 cenários obrigatórios · a rubrica de 15 itens · os caminhos das evidências · a restrição
read-only. Mais uma lista de ataques a tentar.

### 1.5 Comandos autorizados

```bash
npm run ui:lab
npm run typecheck:lab:v4
npm run test:lab:v4
npm run test:lab:v4:browser
```

Mais as ferramentas de navegador para abrir a rota, ler o DOM, o console e a rede.

### 1.6 URL

```
http://127.0.0.1:5291/lab/operacao-viva-v4/
```

Cena específica: `?cena=<id>`

### 1.7 Viewports

| Nome | Dimensão |
|---|---|
| desktop | 1280 × 800 |
| tablet | 768 × 1024 |
| celular | 390 × 844 |

### 1.8 Cenários submetidos

`calma-real` · `ausencia-de-dados` · `fonte-atrasada` · `fonte-indisponivel` · `fonte-divergente` ·
`foco-com-secundarios` · `ambiente-critico-persistente` · `pedido-so-quente` ·
`duas-sacolas-sustentada` · `duas-sacolas-sem-evidencia` · `risco-de-conferencia` ·
`recomendacao-validada` · `recomendacao-corrigida` · `recomendacao-expirada` ·
`sushi-quentes-isolado` · `consolidacao-com-sushi` · `consolidacao-caixa-comprovada` ·
`consolidacao-caixa-nao-observada`

---

## 2. Relatório do avaliador — literal

> **Nada nesta seção foi editado.** Achados, severidades, notas e veredito são como o avaliador os
> escreveu. A saída bruta e integral está preservada em
> `docs/auditoria/evidencias-0a/avaliacao-independente-bruta.md`.

*(Aguardando o retorno do avaliador. Esta seção será preenchida com a resposta literal, sem alteração,
e o commit correspondente será registrado. Enquanto ela estiver assim, o checkpoint
`INDEPENDENTLY_EVALUATED` NÃO está declarado.)*

---

## 3. Comentários do construtor — seção separada

*(A ser preenchida depois da §2, e claramente identificada como leitura do construtor, não do
avaliador. Correção material só é aplicada depois de o primeiro veredito estar registrado.)*

---

## 4. Estado do ciclo

| Item | Estado |
|---|---|
| Primeiro veredito registrado | **pendente** |
| Correções materiais aplicadas | — |
| Reverificação pelo mesmo avaliador | — |
| Delta do veredito | — |

**Checkpoint máximo permitido nesta missão:** `AWAITING_CESAR_REVIEW`.
`HUMAN_APPROVED` e `RELEASED` **não** podem ser registrados antes de o César abrir e avaliar
pessoalmente o Lab.
