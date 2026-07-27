---
name: deliveryos-adversarial-review
description: >
  Revisão adversarial do DeliveryOS — tentar invalidar a própria prova antes que
  a realidade o faça. Use ao fechar gate de alto risco: concorrência,
  transacionalidade, idempotência, replay, isolamento, privacidade, PII,
  source_mode, ou qualquer auditoria que leia arquivo em vez de executar.
---

# Revisão adversarial do DeliveryOS

## Objetivo

Encontrar o defeito antes do motoboy encontrar. A pergunta não é "passou?" — é
"o que faria isso passar mesmo estando errado?".

## Quando usar

Ao fechar gate de alto risco. Depois de uma correção que "funcionou de primeira".
Sempre que um teste ficar verde mais fácil do que você esperava.

## Entradas

O gate que você quer declarar verde, e a evidência que o sustenta.

## Saídas

`CONFIRMADO` com o controle que foi aplicado, ou o defeito reproduzido.

## A técnica central: remova a garantia e exija a falha

Um teste que não falha quando a garantia some não está testando nada.

| Garantia | Remova | Deve acontecer |
|---|---|---|
| `FOR UPDATE SKIP LOCKED` | a cláusula | segundo worker bloqueia, teste falha |
| transação | o `transaction()` | fato sobrevive sem a mensagem |
| trigger append-only | a trigger | `UPDATE` passa |
| idempotência | a chave | duplicata entra |
| `ports:` ausente no compose | adicione um | auditoria acusa |
| TLS obrigatório | desligue | boot deveria recusar |

Se removeu e continuou verde, você encontrou um teste falso — que vale mais que
o gate, porque ele estava mentindo em silêncio.

## Roteiro por área

### Entregas
mesmo lote cem vezes · lotes fora de ordem · evento faltante · evento atrasado ·
perda de rede · reinício do processo · banco indisponível e de volta · viagem
encerrada recebendo GPS · GPS antigo · GPS impreciso · device revogado · token
inválido · dois dispositivos na mesma viagem.

### Ponte
outbox acumulada · consumidor reiniciado · lease expirado · replay · evento
incompatível · simulado marcado como real · duplicata gerando recomendação
duplicada · projeção reconstruída com resultado diferente.

### Copiloto
ausência de sinal · sinal antigo · agrupamento removido · agendamento desativado
· indicador desaparecido · crítico voltando ao normal · Conference Brain fora ·
recomendação expirada · mapping mode · PII em log · source mode trocado ·
confidence ausente · versão incompatível.

### Isolamento
assíncrono parado · Copiloto travado · Copiloto consumindo CPU · Copiloto em
loop de erro · Copiloto sem banco · crítico sob carga enquanto o assíncrono
falha.

Em todos: **o Entregas continua dentro da meta**. Se não continuar, o isolamento
é retórico.

## Armadilhas que já enganaram esta base

1. **canal que não executa** — ferramenta que ignora flags em silêncio e sai com
   código 0. Preflight com valor combinado;
2. **rótulo virando dado** — `UPDATE 10` entrando na lista do `RETURNING`.
   Filtre por formato;
3. **saída bufferada** — sincronizar processos por texto mede a hora errada. Use
   estado autoritativo;
4. **efeito em segundo plano** — um `start &` esquecido religou o banco no meio
   da medição;
5. **comentário casando com a regra** — remova comentários antes de medir;
6. **evento sem ouvinte** — `pool.on('error')` ausente mata o processo inteiro;
7. **informação derrubando diagnóstico** — contagem informativa que falha junto
   e esconde o motivo real;
8. **gate no lugar errado** — validação na configuração do Gradle derrubou
   `assembleDebug`, que nem era o alvo.

## Sobre PII

Procure ativamente, não confie na intenção: nome, telefone, endereço, CPF, token,
cookie, credencial — em log, em payload, em fixture, em modo de mapeamento, em
mensagem de erro. Fixture precisa se declarar sintética.

O teste de fixture que procura termo proibido também deve **encontrar** um termo
que você sabe estar lá — senão o método de varredura é que está quebrado.

## Ações permitidas

Injetar defeito em cópia · remover garantia temporariamente · executar carga ·
matar processo · derrubar dependência · restaurar tudo ao fim.

## Ações proibidas

Deixar defeito injetado no repositório · rodar carga contra produção · usar dado
real de cliente · editar o mesmo arquivo que outro agente está editando · apagar
evidência de falha encontrada.

## Verificadores

Restaure e confirme:

```bash
git status --short   # precisa estar limpo depois da injeção
```

## Limite de iterações

Três por gate. Se três controles adversariais não derrubaram a prova, ela se
sustenta — siga.

## Condição de sucesso

Todo gate de alto risco tem pelo menos um controle antifalso-positivo aplicado e
registrado, e o repositório está limpo.

## Condição de parada

Defeito reproduzido que não se corrige dentro do limite. Documente com o caminho
exato da reprodução — um defeito bem reproduzido vale mais que um gate verde.

## Evidências produzidas

Linha em `EVIDENCE.jsonl` com `controle_antifalso_positivo` preenchido, dizendo
o que foi removido e que a falha aconteceu como esperado.
