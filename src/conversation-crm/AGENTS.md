# Chatbot nativo TATÁ — contrato de implementação

## Arquitetura

O chatbot conversa. O DeliveryOS observa, decide, executa, registra e comprova. Decisão e linguagem são camadas distintas: uma futura humanização transforma a superfície de comunicação, não cria um novo cérebro.

O runtime usa somente o catálogo operacional. O oráculo de 200 cenários permanece fisicamente isolado e nunca influencia classificação, roteamento ou resposta. A base atual declara 51 intenções cobertas pelo oráculo, 39 capacidades simuladas, 35 blocos legados e CRM append-only.

## Contratos preservados

- multiturno conserva contexto sem sobrescrita silenciosa;
- R05 reconhece grupo acima de oito e pergunta somente o que falta;
- O02 prioriza ocorrência de item errado ou faltando sobre palavras genéricas;
- TATA-SC-194 produz uma única notificação confirmada;
- segurança alimentar acolhe e escala sem diagnóstico, causalidade ou compensação;
- drivers reais, leitura real e escrita real permanecem desativados;
- fatos públicos só podem vir do catálogo operacional confirmado;
- toda ação afirmada exige resultado ou evidência observável.

## Privacidade e autoridade

Nunca persistir mensagem bruta, PII, token, cookie, credencial ou erro sensível. Não oferecer crédito, reembolso, cortesia, diagnóstico ou atribuição de culpa automaticamente. Não transformar unknown em fato, fixture em dado real ou handoff solicitado em handoff confirmado.

Perguntar somente o mínimo ainda ausente. Não repetir pergunta já respondida. Preservar correções, múltiplos pedidos, múltiplos casos e reabertura.

## Mudanças de linguagem

Templates, estratégias, perfil de voz, compositor, validador e fallback pertencem a mudança própria. Devem receber um plano decidido pelo DeliveryOS, preservar fatos e autoridade e passar por verificador independente. Não editar essas áreas durante uma missão de baseline.
