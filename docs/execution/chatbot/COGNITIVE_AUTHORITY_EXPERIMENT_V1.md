# Experimento de teto arquitetural — autoridade cognitiva V1

## BASELINE

A variante A permaneceu no commit `0cdc09f030938c84dcaf6a6d69276ceb7e5b78b7`, sem alteração retroativa. Pela rota real, a abertura composta foi reduzida a saudação genérica; depois de três sushis do iFood, pedidos de amplitude e justificativa repetiram exatamente a mesma lista.

## VARIANT B

B adiciona uma única bifurcação experimental antes da publicação: Gemma recebe histórico compacto, estado determinístico e resultados autorizados do catálogo e devolve um `Conversation Plan` estruturado com movimento, objetivo interpretado, escopo, fatos/ferramentas necessários, próximo passo e texto. Catálogo, canal, preços, alergênicos, safety, políticas, ferramentas e pós-validação continuam determinísticos. A não foi modificada.

## FIRST DIVERGENCE

No primeiro turno, A respondeu apenas “Olá! Como posso ajudar você hoje?”. B reconheceu a indecisão entre pedir e ir ao restaurante, mas sua condução oscilou: em execuções diferentes perguntou pelo cardápio ou introduziu entrega/retirada em vez de preservar com precisão as duas alternativas declaradas.

## PAIRED RESULT

- Uma conversa pareada real foi concluída antes do hard stop; B foi preferida no primeiro turno por compreensão e utilidade, mas o veredito é `ADVISORY_NOT_INDEPENDENT`.
- O turno pareado levou 81 segundos após redução do contrato; a medição anterior levou 126 segundos.
- O golden B-only registrou 69 s, 46 s, 81 s, 84 s e 90 s por turno.
- Em “iFood”, B inferiu incorretamente que já havia pedido de expansão; o pós-validador bloqueou e publicou o fallback A.
- No pedido real de expansão, Gemma encontrou oito opções oficiais adicionais. O primeiro bloqueio era falso positivo por sobreposição de nomes e foi corrigido sem relaxar a allowlist.
- Na pergunta sobre o critério, B voltou a escolher `expand` e não explicou a seleção. O golden obrigatório permaneceu reprovado.
- As 30 conversas pareadas não foram executadas: a condição de parada foi atingida no golden por falha semântica e latência incompatível. Continuar produziria volume, não nova evidência de direção.

## HARD SAFETY

Turnos sensíveis e críticos não entram na autoridade cognitiva B. Safety, alergia, canal, preço, ações e unsupported claims permanecem nos gates determinísticos. Os testes específicos passaram, assim como Conversation 765/765, Conference 314/314, Live 243/243, Capacidade 43/43, Copiloto 53/53, catálogo 200/200, cardápio 199 itens e privacidade sem achados. Nenhum driver real ou acesso externo foi ativado.

## GENERALIZATION

O código experimental não contém handlers literais para as paráfrases de homologação. Ainda assim, a generalização não foi certificada: B falhou no próprio golden antes da bateria de expressões inéditas. Declarar vitória com novos exemplos ou regras violaria a condição de parada.

## LIMIT

O experimento encontrou capacidade conversacional parcial no desenho B, mas o Gemma local não demonstrou planejamento semântico confiável nem latência utilizável para essa autoridade. O contexto fornecido era suficiente para reconhecer o objetivo e recuperar candidatos oficiais, porém o modelo perdeu a ordem conversacional e confundiu refino de canal, expansão e explicação. Um estreitamento excessivo do validador também apareceu, foi reproduzido e corrigido; ele não explica a falha final de planejamento.

## DECISION

`INCONCLUSIVE`

Há evidência de que dar mais contexto e autoridade ao modelo melhora a compreensão de algumas aberturas, mas não há evidência suficiente para afirmar que o determinístico dominante é a causa principal. B não cumpriu o golden, a regra de vitória nem o teste pareado mínimo.

## RECOMMENDATION

Não migrar B. A próxima decisão mínima é escolher entre encerrar esta hipótese ou autorizar futuramente um experimento separado de capacidade local com o mesmo contrato e hard gates. Nenhum modelo, hardware ou arquitetura deve ser trocado automaticamente a partir deste resultado.

## STATE

- Branch: `experiment/hospitality-cognitive-authority-v1`.
- Base: `0cdc09f030938c84dcaf6a6d69276ceb7e5b78b7`.
- Variante A preservada e executável.
- Custo externo: `R$ 0,00`.
- Zero push, merge, deploy, WhatsApp, API paga ou dado real de cliente.
- Painel A/B local e diagnóstico pós-voto permanecem exclusivamente experimentais.
