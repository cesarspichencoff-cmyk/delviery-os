---
name: chatbot-checkpoint-resume
description: Create, verify or resume an atomic DeliveryOS chatbot checkpoint while preserving partial work and controlling execution budget. Use when starting, pausing, continuing or closing a chatbot change, especially with dirty working trees, low remaining credits or multiple local branches.
---

# Checkpoint e retomada do chatbot

1. Conferir diretório, branch, HEAD, upstream, status, stashes e worktrees.
2. Classificar cada arquivo como concluído, parcial, desconhecido ou fora de escopo.
3. Nunca descartar trabalho desconhecido nem usar limpeza destrutiva.
4. Executar uma unidade atômica por vez e testar antes do commit.
5. Registrar estado, evidências append-only, decisões, bloqueadores e próximo comando único.
6. Preservar unidade parcial como patch versionado, stash nomeado ou branch WIP.
7. Com 70% de créditos usados, não iniciar unidade grande; com 82%, criar checkpoint; acima de 90%, apenas preservar, testar o essencial, commitar e parar.
8. Encerrar com working tree limpo, commit local claro e confirmação de ausência de push, merge e deploy.

Controle negativo: bloquear qualquer retomada que proponha sobrescrever arquivos desconhecidos ou misturar duas mudanças.
