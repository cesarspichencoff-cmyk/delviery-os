# Q-003 — autoridade da atenção do Copiloto

Data: 2026-09-30
Decisão humana: César

## Decisão

A autoridade de qual tensão ocupa a atenção é o MOTOR, por `sess.active.sit`.

`decisao.js` não disputa essa autoridade: escolhe a melhor ação dentro da mesma causa-raiz do Foco ativo. A correção histórica Motor × Decisão permanece vinculante.

O Copiloto `shadow.ts` não abre, troca nem encerra Foco. Uma recomendação em sombra só pode ser considerada para a atenção humana quando já existe Foco ativo vindo do MOTOR, existe uma âncora causal explícita e legitimamente provada, e essa âncora pertence à mesma causa-raiz.

Sem qualquer uma dessas condições, a recomendação permanece em sombra.

## O que não foi inferido

Nenhum external_id, texto parecido, recommended_action ou evento é convertido automaticamente em sit.id, praça ou saída.

Na cadeia real atual, a Intelligence Spine não possui uma ponte legítima de identidade até o Foco do Perfil Delivery. Portanto, zero recomendações atuais são promovidas automaticamente ao Foco. Isso é comportamento correto, não ausência de implementação.

## Implementação mínima

- `src/perfil-delivery/decisao.js` expõe `focoCanonico(active)`, normalização sem efeito colateral de `sess.active.sit`.
- `src/platform/copiloto/attention-authority.ts` implementa o gate causal.
- O gate recebe apenas o Foco já escolhido e uma âncora explícita; não importa MOTOR nem decisão.
- `shadow.ts` continua produtor de propostas, sem poder de atenção.
- Nenhuma fórmula de score, confiança, debounce, cooldown ou política Shadow foi alterada.

## Fronteira

Este fechamento é de governança + contrato executável. Não há ativação de recomendação Shadow na interface porque a identidade causal necessária ainda não existe na cadeia atual.

Promover uma recomendação sem essa identidade recriaria a troca silenciosa de causa-raiz que a correção Motor × Decisão eliminou.
