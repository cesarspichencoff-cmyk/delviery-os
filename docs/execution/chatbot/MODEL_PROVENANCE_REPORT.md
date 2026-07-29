# Proveniência dos candidatos — Mudança 005B

## Política

Pesos e binários ficam fora do Git. Cada download é individual, posterior ao
Doctor, fixado por revisão, tamanho e SHA-256. Arquivo parcial ou divergente não
pode ser executado. Nenhuma URL comunitária substitui a identificação do peso
oficial de origem.

## Matriz

| Candidato | Origem de treinamento | Artefato executável | Proveniência | Estado |
|---|---|---|---|---|
| Qwen3 4B | `Qwen/Qwen3-4B-GGUF` | Q4_K_M já certificado | oficial Qwen | baseline preservado |
| Gemma 4 E4B IT | `google/gemma-4-E4B-it` @ `ee0ef602…` | `google/gemma-4-E4B-it-qat-q4_0-gguf` @ `4b4a2c1…` | GGUF QAT oficial Google | aprovado para download |
| Qwen3.5 4B | `Qwen/Qwen3.5-4B` @ `851bf6e…` | `bartowski/Qwen_Qwen3.5-4B-GGUF` @ `4168f45…` | conversão secundária rastreada, llama.cpp b9222 + imatrix | aprovado condicionalmente para download |
| Gemma 4 12B IT | `google/gemma-4-12B-it` @ `707f0a3…` | `google/gemma-4-12B-it-qat-q4_0-gguf` @ `29d0977…` | GGUF QAT oficial Google | adiado ao Doctor pós-candidatos |

O Qwen3.5 é a única exceção de conversão secundária. Ela é aceitável para teste,
não para promoção automática: organização de origem, revisão, quantizador,
dataset de imatrix, tamanho e digest estão declarados. Uma futura distribuição
exigirá conversão própria ou artefato oficial do Qwen.

## Proibições preservadas

- nenhuma execução de script remoto por pipe;
- nenhum peso dentro do repositório ou do ZIP anterior;
- nenhuma credencial do Hugging Face;
- nenhum projetor multimodal, imagem, áudio ou conversa real;
- nenhuma promoção ao instalador antes de vencedor humano.

