# Baseline de revisão humana

Este diretório contém 50 conversas exclusivamente sintéticas para medir o
comportamento atual do chatbot, antes de qualquer humanização.

- O corpus não contém resposta ideal.
- Cada conversa começa em um runtime temporário novo.
- Turnos da mesma conversa compartilham estado.
- O executor usa a API pública de `NativeConversationRuntime`.
- Nenhuma intenção esperada ou `scenario_id` é enviada ao runtime.
- Os contratos servem apenas ao verificador externo, depois da resposta.

Comandos:

```powershell
node scripts/verifiers/chatbot/run-baseline.js
node scripts/verifiers/chatbot/analyze-baseline.js
node scripts/verifiers/chatbot/verify-baseline.js
node scripts/verifiers/chatbot/negative-controls.js
```

O verificador do baseline pode terminar com código diferente de zero quando
encontra lacunas reais. Isso é evidência da linha de base, não falha técnica do
executor.
