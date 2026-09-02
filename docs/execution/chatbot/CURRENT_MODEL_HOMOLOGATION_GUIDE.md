# Guia de homologação — modelos atuais da Mudança 005B

## Estado atual

Não iniciar votação humana para os candidatos da 005B. Gemma 4 E4B e Qwen3.5
4B falharam o gate do Director; Gemma 12B não passou o Doctor. Não há bundle de
rodada atual e `human_winner` permanece `null`.

## O que permanece disponível

A infraestrutura cega da Mudança 005 continua intacta e foi testada:

```powershell
$env:PORT = "4189"
npm run conversation-local-ai:bakeoff-panel -- --bundle-root <bundle-aprovado> --votes-root <pasta-privada>
```

Endereço local: `http://127.0.0.1:4189`.

Esse comando só deve ser usado com bundle tecnicamente aprovado. O pacote 005B
não fornece esse bundle e não deve apontar para os resultados privados dos
modelos reprovados.

## Condição para futura rodada

Uma mudança futura precisa apresentar, antes da votação:

- Director correto e dentro da latência;
- Writer seguro com ganho mensurável;
- bateria adversarial real aprovada;
- licença e distribuição reproduzível;
- Doctor no hardware-alvo;
- bundle público cego e mapeamento privado com hashes;
- `human_winner=null` até o voto de César.

## Rollback e isolamento

Nenhuma ativação foi feita. Manter
`CONVERSATION_LOCAL_AI_ENABLED=false` e
`CONVERSATION_AI_FALLBACK=deterministic` preserva o comportamento anterior. O
ZIP e o manifesto da Mudança 005 não foram modificados. Não há serviço do
restaurante, bridge real, API paga ou endpoint novo para desligar.
