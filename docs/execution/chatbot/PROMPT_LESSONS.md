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

## Mudança 002

- validar o texto final com regras independentes do compositor detecta omissão
  de pergunta, fato e limite que testes do compositor isolado não veem;
- recuperação deve reconstruir a visão anterior ao turno corrente para não
  transformar retry em divergência;
- reduzir fallback genérico exige estratégias concretas e taxonomia, não
  sinônimos;
- hashes de artefato que incluem texto podem mudar legitimamente mesmo quando
  fatos e decisões permanecem equivalentes;
- uma frase operacional canônica deve ser transportada sem alteração semântica
  quando já contém a orientação autorizada.
