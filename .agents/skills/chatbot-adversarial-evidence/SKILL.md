---
name: chatbot-adversarial-evidence
description: Audit chatbot behavior with independent evidence, negative controls and mutation checks. Use for gates involving factual safety, promises, continuity, privacy, oracle isolation, idempotency, recovery or claims that tests prove a chatbot contract.
---

# Evidência adversarial do chatbot

1. Converter cada afirmação em requisito reproduzível.
2. Usar saída pública e fonte independente; não importar expectativa privada do compositor.
3. Executar controle positivo e controle negativo.
4. Aplicar mutação pequena para provar que o gate fica vermelho.
5. Verificar fatos, links, valores, promessas, compensações, contexto, privacidade e comportamento proibido.
6. Confirmar código de saída diferente de zero para violação material.
7. Tratar “verde” sem mutação, diff ou evidência como inconclusivo.
8. Registrar comando, esperado, obtido, hash, impacto e limitação.

Proibir: `scenario_id` influenciar classificação, oráculo dentro do runtime, snapshot permissivo e atualização de expectativa feita apenas para passar.
