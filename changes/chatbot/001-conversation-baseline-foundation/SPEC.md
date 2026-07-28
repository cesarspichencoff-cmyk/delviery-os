# Especificação — Mudança 001

## Problema

O chatbot possui banco operacional amplo, mas a experiência atual é percebida como pronta, seca e menos rica. Não existe baseline independente que separe impressão humana de repetição, extensão, continuidade e segurança factual mensuráveis.

## Estado atual

Base `26922b9`, conteúdo público confirmado, oráculo isolado, drivers reais desativados e baseline histórico verde.

## Objetivo

Criar regras permanentes, memória executável, skills, corpus sintético de 50 conversas, verificadores independentes, métricas reproduzíveis e critérios da Mudança 002 sem alterar respostas.

## Escopo

Documentação, avaliação, scripts de verificação, testes dos verificadores e pacote externo.

## Fora de escopo

Compositor, estratégia de linguagem, templates, políticas, integrações, provider, painel funcional e produção.

## Contratos afetados

Somente governança e avaliação. O hash comportamental do corpus deve permanecer estável durante a mudança.

## Riscos

Verificador tautológico, heurística tratada como verdade, corpus contaminado por resposta ideal e alteração acidental de código produtivo.

## Artefatos

`AGENTS.md`, memória em `docs/execution/chatbot`, três skills, corpus em `evals/human-review`, scripts em `scripts/verifiers/chatbot`, relatórios e esqueleto da Mudança 002.

