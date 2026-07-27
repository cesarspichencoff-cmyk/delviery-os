---
name: deliveryos-execution-loop
description: >
  Ciclo de execução obrigatório do DeliveryOS — DISCOVER, REPRODUCE, FIX,
  VERIFY, ADVERSARIAL CHECK, RECORD, DECIDE. Use ao iniciar qualquer missão
  longa, ao atacar um bloqueador, ao corrigir defeito, ou quando a mesma causa
  reaparecer. Também use quando estiver tentado a corrigir antes de reproduzir.
---

# Ciclo de execução do DeliveryOS

## Objetivo

Impedir os dois modos de falha caros: corrigir o que não foi reproduzido, e
girar em loop sem condição de saída.

## Quando usar

Toda missão com mais de um bloqueador. Todo defeito. Toda vez que uma correção
não funcionou de primeira.

## O ciclo

### 1. DISCOVER — qual é o MAIOR bloqueador agora

Um só. Se você listou cinco, ordene e ataque o primeiro. Trabalhar em cinco
frentes ao mesmo tempo é como nenhuma fecha.

### 2. REPRODUCE — prove que o problema existe

Antes de tocar em código de correção, produza a evidência de que o defeito é
real. Um teste que falha, uma medição, uma saída de comando.

**Esta é a etapa que mais se pula, e a que mais custa pular.** No Macro-Prompt 1,
dois testes passavam sem testar nada; só apareceram quando a garantia foi
removida de propósito e o teste continuou verde.

Se você não consegue reproduzir, você não sabe o que está corrigindo.

### 3. FIX — a menor mudança estrutural adequada

"Menor" não é "mais rápida". É a que resolve a causa, não o sintoma, com o menor
raio de alcance.

### 4. VERIFY — verificador objetivo, não sua própria afirmação

O executor não pode ser a verificação. Rode o comando. Leia a saída. Compare com
o esperado.

Comparar **valores**, nunca "não deu erro": `assert.doesNotThrow` fica verde sem
exercitar nada.

### 5. ADVERSARIAL CHECK — quando o risco for alto

Tente invalidar sua própria prova:

- **remova a garantia e exija a falha.** Se o teste continua verde sem a
  cláusula que ele testa, o teste é uma opinião;
- injete o defeito e confirme que a auditoria acusa;
- verifique se o canal externo executa (preflight) antes de confiar no resultado.

Obrigatório para: concorrência, transacionalidade, idempotência, isolamento,
privacidade, e qualquer auditoria que leia arquivo em vez de executar.

### 6. RECORD — evidência e estado

Linha em `docs/execution/EVIDENCE.jsonl`: o que foi afirmado, como foi medido, o
que a medição devolveu. Se não foi medido, não entra.

Atualize `STATE.json` — inclusive o campo `nao_comprovado`.

### 7. DECIDE — próximo bloqueador, sucesso, ou parada legítima

## Limites

- **máximo seis ciclos** de correção por gate técnico;
- se a **mesma causa reaparecer duas vezes**, a hipótese está errada — pare de
  corrigir e reavalie;
- não repita a mesma correção sem evidência nova;
- não deixe loop sem condição de saída.

## Saídas legítimas do loop

| Saída | Quando |
|---|---|
| gate verde | verificador objetivo passou, evidência registrada |
| bloqueador externo | precisa de credencial, aparelho, autorização, login |
| falha reproduzida e não solucionável | dentro do limite de ciclos |
| risco | dado, segurança ou cobrança |

**Não encerre porque a primeira tentativa falhou.** Uma tentativa falha é o
começo do ciclo, não o fim dele.

## Ações permitidas

Reproduzir, corrigir causa raiz, medir, registrar, escalar com precisão.

## Ações proibidas

Corrigir sem reproduzir · usar afirmação própria como verificação · declarar
verde o que não rodou · repetir correção idêntica · loop infinito · inflar a
execução com verificação duplicada.

## Verificadores

O verificador é específico do gate. O que é universal:

```bash
git status --short      # antes e depois de script que escreve arquivo
```

## Limite de iterações

Seis por gate. Dois ciclos com a mesma causa = reavaliar hipótese.

## Condição de sucesso

Todos os gates do escopo verdes, com evidência reproduzível.

## Condição de parada

Bloqueador externo específico, ou limite de ciclos atingido com a falha
documentada.

## Evidências produzidas

`docs/execution/EVIDENCE.jsonl` · `STATE.json` atualizado · quando houver lição,
entrada em `PROMPT_LESSONS.md`.
