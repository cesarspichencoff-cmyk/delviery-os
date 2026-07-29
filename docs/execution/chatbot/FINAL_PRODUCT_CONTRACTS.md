# Contratos do produto final — Mudança 006

## Regra soberana

O fluxo aprovado é determinístico até a superfície de linguagem:

`Pattern Engine → Journey State → Response Plan → ApprovedResponseEnvelope → Writer local → validação independente`

O Writer só pode redigir. Ele não escolhe jornada, fato, cliente, item, canal,
ação, custo, pergunta ou política. Uma saída recusada devolve o texto
determinístico já aprovado.

## Contextos opcionais preparados

| Contexto | Uso permitido agora | Fora de escopo |
|---|---|---|
| Customer Context | validar estrutura, separar confirmado/inferido e bloquear identidade ambígua | consulta ou união de clientes reais |
| Menu Context | validar canal/unidade, registrar lacunas e transportar referências | catálogo definitivo, disponibilidade ou recomendação real |
| Recommendation Context | transportar objetivo, restrições e candidatos sem ranking | ranqueamento ou composição automática |
| Channel Policy | bloquear canal não oficial, falta de consentimento e envio não autorizado | integração com WhatsApp |
| Cost Policy | permitir somente custo externo comprovadamente zero | compra, trial, API paga ou upgrade |

Os mocks de ferramentas retornam `unavailable` e nunca ecoam a entrada. Eles
existem para fixar interfaces das Mudanças 007 e 008, não para simular acesso
real.

## ApprovedResponseEnvelope V1

O envelope contém: reconhecimento social, resposta direta, explicação,
contexto de jornada, resumos de cliente/cardápio/recomendação/canal/custo,
fatos, ação verdadeira, pergunta exata, tom, gravidade, alegações proibidas,
frases recentes, links e números autorizados e limite de tamanho.

Valores do Customer Context não são copiados ao resumo do Writer. Somente
nomes de campos, estados, restrições declaradas e desconhecidos podem ser
transportados. A pergunta aprovada deve aparecer sem alteração na saída.

## Gate financeiro e painel futuro

`FINANCIAL_MODE=ZERO_EXTERNAL_COST` e gasto externo máximo `0`. Estado
desconhecido, cobrança possível, valor acima de zero, trial com cobrança
automática ou provedor externo com risco financeiro bloqueiam a execução.

O painel futuro “Custos e bloqueios” deverá mostrar somente: recurso, status de
verificação, custo estimado, evidência, desconhecidos, razão do bloqueio e
momento da última revisão. Não deve ativar compras, trials ou provedores.

## Limites desta mudança

- zero consulta real de cliente ou cardápio;
- zero integração, leitura ou escrita em WhatsApp;
- zero modelo em função de Director;
- zero promoção automática de Gemma ou Qwen;
- zero custo externo novo;
- Mudanças 007–010 permanecem apenas sequenciadas.
