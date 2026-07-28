# Lições de execução

## Instruções eficazes

- uma mudança por execução;
- baseline antes da branch;
- expectativa externa ao runtime;
- controles negativos obrigatórios;
- memória pequena e executável.

## Riscos de falso verde

- relatório verde sem diff e sem código de saída;
- verificador que importa `ideal_response`;
- cenário que injeta intenção esperada;
- snapshot amplo que aceita qualquer texto;
- métrica subjetiva apresentada como fato.

## Melhoria promovida

As regras acima foram promovidas para `AGENTS.md` e para as skills locais. A ferramenta deve registrar comandos, hashes e limitações em vez de depender do histórico da conversa.

## Retrabalho evitável identificado

Um hash de evidência não deve incluir o HEAD de documentação quando mede somente
comportamento. A mutação do commit, sem mutação do runtime, revelou a falha e a
regra foi promovida para a decisão D-003.

O baseline também mostrou que cobertura de intenção não equivale a riqueza de
superfície: estado lembrado pelo CRM pode continuar invisível na frase.
