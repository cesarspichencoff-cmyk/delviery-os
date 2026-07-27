---
name: deliveryos-release-readiness
description: >
  Prontidão para campo do DeliveryOS. Use antes de declarar qualquer coisa
  pronta para piloto, antes de gerar APK de campo, antes de apontar para banco
  hospedado, e ao avaliar gates externos que envolvam credencial, licença ou
  cobrança. Também use ao redigir o veredito final de uma missão.
---

# Prontidão para campo do DeliveryOS

## Objetivo

Separar "funciona na minha máquina" de "aguenta uma sexta-feira de pico com um
motoboy na rua". E impedir que um gate externo vire cobrança silenciosa.

## Quando usar

Antes do veredito de qualquer missão. Antes de tocar em ambiente externo.

## Entradas

`docs/execution/STATE.json` · resultado das suítes · métricas medidas.

## Saídas

Veredito único, e a lista do que ficou aberto com o caminho de fechamento.

## Gate 1 — O que precisa estar provado

| Item | Prova aceita |
|---|---|
| persistência real | suítes de banco verdes contra PostgreSQL real |
| transacionalidade | fato e mensagem confirmam ou falham juntos |
| concorrência | dois workers, conjuntos disjuntos, sem bloqueio |
| idempotência | mesmo lote N vezes = mesmo estado lógico |
| replay | reprocessar produz o mesmo estado, sem duplicar efeito |
| offline | fila local sobrevive a queda de rede e a reinício |
| GPS | zero coleta fora de viagem ativa |
| revogação | aparelho revogado é recusado antes de qualquer análise |
| isolamento | assíncrono cai, crítico continua dentro da meta |
| backup | **restaurado**, não apenas criado |
| recuperação | banco volta, `/ready` volta a 200 sem reiniciar processo |

Backup sem restore testado **não é backup aprovado**. Restore devolve dados;
proteção é outra pergunta — teste também o que ele **impede** depois de
restaurado: trigger, constraint, índice parcial, fuso.

## Gate 2 — Métricas, medidas e não estimadas

```
aceite do lote GPS p95 · latência da API crítica p95 · idade da outbox
tempo de replay · tempo de reconstrução da projeção
tempo de recuperação após o banco voltar · tempo de restore
duplicações lógicas · eventos confirmados perdidos
impacto do assíncrono sobre o crítico
```

Meta sem medição é número verde inventado. Se não mediu, escreva "não medido".

## Gate 3 — Ação externa: pare NA ação, não antes

Quando o próximo passo exigir credencial, login, cartão, aparelho ou
autorização, continue **todo** o resto e pare somente naquele ponto. Informe:

```
AÇÃO NECESSÁRIA
MOTIVO
RISCO DE COBRANÇA
ALTERNATIVA GRATUITA
DADOS NECESSÁRIOS
PASSOS EXATOS
COMO REVERTER
```

Uma espera por credencial ou aparelho é **pausa externa da mesma missão**, não
relatório final.

## Gate 4 — Cobrança

Nunca, sem autorização explícita e informada: adicionar cartão · ativar billing ·
aceitar upgrade · criar recurso cobrável · exceder free tier conscientemente ·
instalar ferramenta de licença comercial.

Silêncio nunca é autorização. "Provavelmente é grátis" também não.

Armadilha registrada: plano gratuito que **pausa** o banco por inatividade é
inaceitável para operação — a primeira entrega do dia esperaria o banco acordar.

## Gate 5 — Campo real é campo real

Não declare executado um teste físico que foi simulado. Um teste em emulador é
evidência de emulador.

Antes do aparelho: variante correta · endpoint configurável · nenhuma credencial
no APK · assinatura · hash · versão · identidade do dispositivo · revogação ·
HTTPS · limite de lote · fila offline · retry · receipt durável.

## Veredito

Exatamente um, e nunca os dois:

- `READY_FOR_...` — tudo provado, rollback existe, nenhum P0/P1 aberto;
- `BLOCKED_FOR_...` — bloqueador **técnico** real não solucionável na missão.

Espera por credencial, aparelho ou autorização **não é** `BLOCKED`. É pausa.

## Ações permitidas

Medir, declarar aberto, escalar com precisão, propor alternativa gratuita.

## Ações proibidas

Declarar pronto o que não foi provado em campo · inventar métrica · tratar
simulado como real · criar recurso pago · esconder pendência · usar `BLOCKED`
para o que é só espera externa.

## Verificadores

```bash
npm run test:platform:all      # declara PULADO sem banco, nunca verde falso
npm run test:entregas          # regressão do que já existia
npm run verificar:banco        # antes de apontar para banco novo
```

## Limite de iterações

Dois. Prontidão não se conquista insistindo; se dois ciclos não fecharam o gate,
falta algo estrutural.

## Condição de sucesso

Todos os gates verdes com evidência, ou abertos com caminho exato de fechamento.

## Condição de parada

Gate externo. Pare nele, siga o resto, e informe no formato do Gate 3.

## Evidências produzidas

`STATE.json` com `nao_comprovado` preenchido · `EVIDENCE.jsonl` · métricas com
o comando que as produziu · relatório final com veredito único.
