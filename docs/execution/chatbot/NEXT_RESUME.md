# Retomada única — Mudança 005

- Diretório: raiz atual do projeto
- Branch: `feature/conversation-portable-local-ai-node-v1`
- Base: `4f8a66f1be26f44995e814f7cffaadc499292f7e`
- Checkpoint comportamental: `a1bef237b9540794660b136423e38bd0b57effbd`
- Upstream: ausente; nenhum push
- Working tree esperado: limpo após commit documental final
- Bridge: outbound HTTPS claim/lease, store em memória testado e contrato PostgreSQL injetável
- AI Node: instalador, Doctor, updater, repair, uninstall, modo offline, DPAPI, ACL e loopback
- Modelos avaliados: Qwen3 4B Q4_K_M e Qwen3 1.7B Q8_0
- Bake-off: 260 casos; hash público `d911147cec578b628fb4666366b98f86b2d113a194c74837560c094966b69261`
- 4B: 250/260 aceitas; p95 8,43 s; 10 fallbacks
- 1.7B: 217/260 aceitas; p95 5,30 s; 43 fallbacks
- Vencedor humano: nenhum
- Regressão: Conversation 480/480; catálogo 200/200; privacidade aprovada; Conference 350/350; Live 243/243; Capacidade 43/43; Copiloto 53/53; Playwright 11/11; cardápio 199; fonte histórica aprovada
- Pacote externo: `deliveryos-review-packets/chatbot-change-005-portable-ai-node/`
- Próximo passo: César executar `LOCAL_AI_HOMOLOGATION_GUIDE.md`
- Não fazer: produção, cliente real, push, merge, deploy, API paga ou instalação no restaurante antes dos três gates externos.
