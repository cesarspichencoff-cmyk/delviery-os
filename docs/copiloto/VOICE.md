# Voz operacional

## Intenções
`src/copiloto/voice-intents.js` — catálogo com exemplos, entidades, contexto, erro, ambiguidade, fallback, permissão, executable.

Categorias: estado, área, pedidos, previsão, comparação, ação, aprendizado, briefing, fechamento.

## Respostas por áudio
`src/copiloto/response-contract.js`
- conclusão nos primeiros segundos
- normal ≤ 20s; short ≤ 8s; detailed sob pedido
- uma ideia principal + ação final
- texto completo na tela
- não ler tabelas/UUIDs longos

## Proibições
Sem análise de emoção, sotaque ou sinceridade.
