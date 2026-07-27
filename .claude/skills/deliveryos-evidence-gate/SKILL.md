---
name: deliveryos-evidence-gate
description: >
  Regra de prova do DeliveryOS — o que conta como evidência e o que é só
  afirmação. Use ao escrever teste, ao reportar resultado, ao atualizar
  STATE.json ou EVIDENCE.jsonl, e SEMPRE antes de declarar qualquer coisa
  verificada, pronta, ou concluída. Também use quando uma ferramenta estiver
  ausente e a suíte puder ficar verde sem rodar.
---

# Gate de evidência do DeliveryOS

## Objetivo

Que "verificado" signifique verificado. Um placar verde que não distingue
"passou" de "não rodou" é pior que um vermelho — o vermelho pelo menos avisa.

## Quando usar

Antes de escrever `resultado: OK` em qualquer lugar. Ao criar suíte que depende
de recurso externo. Ao redigir relatório.

## Entradas

O resultado que você quer afirmar, e o comando que o produziu.

## Saídas

Linha em `docs/execution/EVIDENCE.jsonl`, ou a recusa em afirmar.

## As regras

### R1 — Sem medição, não entra

`EVIDENCE.jsonl` só recebe o que foi medido. Intenção vai para `DECISIONS.md`;
o que falta vai para `nao_comprovado` no `STATE.json`.

### R2 — Preflight antes de confiar no canal

Todo canal externo — banco, processo filho, HTTP — começa provando que executa,
devolvendo um valor combinado.

O `psql` do Windows já ignorou as flags após URL posicional: conectava, não
executava nada, saía com código 0. A suíte inteira ficou verde sem tocar no
banco.

```ts
if (psql(url, "select 'canal_ok'") !== "canal_ok") {
  console.error("FALHA DE PREFLIGHT: nenhum teste rodou."); process.exit(1);
}
```

### R3 — Comparar valores, nunca ausência de erro

`assert.doesNotThrow(...)` fica verde sem exercitar nada. Compare o valor
esperado: foi `'' !== '7'` que denunciou o canal quebrado.

### R4 — Filtrar saída pelo formato esperado

`psql -tA` imprime o rótulo do comando (`UPDATE 10`) junto com as linhas do
`RETURNING`. Filtre por `/^o-\d+$/`, nunca por "linha não vazia".

### R5 — Sincronizar por estado autoritativo

Saída redirecionada para arquivo fica **bufferada**. Sincronizar dois processos
por texto mede a hora errada. Use o estado que o sistema conhece —
`pg_stat_activity`, a porta escutando, o cliente sendo recusado.

### R6 — Verificar o estado antes de afirmar sobre ele

Um `pg_ctl start &` esquecido em segundo plano religou o banco no meio de um
teste de "banco fora do ar", e a conclusão apressada foi "o health check mente".

A porta está escutando? O cliente é recusado? Só então meça.

### R7 — Ausência de ferramenta é declarada, nunca verde

Suíte sem o recurso de que depende se declara **PULADA em voz alta** e sai com
sucesso:

```
PULADO: DELIVERYOS_PG_URL não definida — nenhum banco foi testado.
```

Auditoria que lê arquivo em vez de executar diz isso no próprio arquivo.

### R8 — Remova a garantia e exija a falha

Para todo teste que afirma uma garantia: tire a cláusula e confirme que o teste
quebra. Sem esse controle, o teste é uma opinião.

Vale para auditoria estática: injete o defeito e confirme que ela acusa.

### R9 — Comentário não é código

Remova comentários antes de afirmar sobre código. TypeScript, SQL (`--`), YAML
(`#`). Teste estrutural já casou com termo proibido dentro do comentário que
explicava a proibição.

### R10 — Confira o que entrou no Git

Depois de `git add`, rode `git ls-files` no caminho. `.gitignore` amplo já
engoliu um `.example` que a auditoria lia, e a falha só apareceria no primeiro
clone limpo.

## Formato da linha de evidência

```jsonc
{"id":"E42","tipo":"...","afirmacao":"o que foi afirmado",
 "medicao":"como foi medido e o que devolveu",
 "controle_antifalso_positivo":"o que foi removido para exigir a falha"}
```

`controle_antifalso_positivo` é obrigatório quando a evidência sustenta uma
garantia de concorrência, transacionalidade, idempotência, isolamento ou
privacidade.

## Ações permitidas

Registrar o que mediu. Declarar PULADO. Dizer "NÃO DETERMINADO".

## Ações proibidas

Afirmar sem medir · usar a própria execução como prova · declarar verde suíte que
não rodou · apagar evidência · arredondar contagem · reportar número estimado
como medido.

## Verificadores

```bash
node -e "require('fs').readFileSync('docs/execution/EVIDENCE.jsonl','utf8').split('\n').filter(Boolean).forEach((l,i)=>{try{JSON.parse(l)}catch(e){console.log('linha',i+1,'invalida');process.exit(1)}});console.log('ok')"
```

## Limite de iterações

Duas. Se a evidência não se sustenta em duas tentativas, o que você quer afirmar
provavelmente não é verdade.

## Condição de sucesso

Toda afirmação do relatório tem linha correspondente em `EVIDENCE.jsonl`, e todo
gate de alto risco tem controle antifalso-positivo.

## Condição de parada

Impossibilidade de medir. Registre em `nao_comprovado` com motivo, substituto
usado e o que exatamente falta.

## Evidências produzidas

`EVIDENCE.jsonl` · `STATE.json.nao_comprovado` · saída literal dos comandos.
