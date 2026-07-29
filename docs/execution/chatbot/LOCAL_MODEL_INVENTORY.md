# Inventário de runtime e modelos locais

Pesquisa feita em 2026-07-28 somente em releases, repositórios, model cards e
licenças oficiais. Nenhum modelo foi escolhido por benchmark de terceiros.

## Runtime fixado

| Item | Versão | Licença | Artefato | SHA-256 | Tamanho |
|---|---|---|---|---|---:|
| llama.cpp CPU Windows x64 | b10172 | MIT | `llama-b10172-bin-win-cpu-x64.zip` | `9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62` | 18.338.109 B |
| llama.cpp CUDA 12.4 | b10172 | MIT | `llama-b10172-bin-win-cuda-12.4-x64.zip` | `ef3bad0d84f92adcbd9b750e0864e258c2c15715112c5872cba14efa4c9617b2` | 246.759.877 B |
| CUDA runtime complementar | b10172 | redistribuição NVIDIA aplicável | `cudart-llama-bin-win-cuda-12.4-x64.zip` | `8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6` | 391.443.627 B |
| Node portátil Windows x64 | 24.18.0 LTS | MIT | `node-v24.18.0-win-x64.zip` | `0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821` | ver release oficial |

Origens: `github.com/ggml-org/llama.cpp/releases/tag/b10172` e
`nodejs.org/dist/v24.18.0/`. O instalador baixa primeiro, valida e só então
extrai. Nunca executa script remoto por pipe.

## Seleção limitada

| Papel | Modelo/arquivo | Revisão | Licença | SHA-256 | Tamanho | Decisão |
|---|---|---|---|---|---:|---|
| principal básico/intermediário | `Qwen/Qwen3-4B-GGUF` · `Qwen3-4B-Q4_K_M.gguf` | `bc640142c66e1fdd12af0bd68f40445458f3869b` | Apache-2.0 | `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` | 2.497.280.256 B | primeiro bake-off real |
| principal avançado | `ggml-org/gpt-oss-20b-GGUF` · `gpt-oss-20b-MXFP4.gguf` | `ef9b12f2ff56c69cf32153a02784e7a3c88bf524` | Apache-2.0 + usage policy OpenAI | `27cd6c432c7672cb812a92f611cf3ba7bbc35928262bb1e1253ff4ee6ae35901` | 12.109.566.624 B | não baixar sem perfil avançado |
| fallback leve | `Qwen/Qwen3-1.7B-GGUF` · `Qwen3-1.7B-Q8_0.gguf` | `90862c4b9d2787eaed51d12237eafdfe7c5f6077` | Apache-2.0 | `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a` | 1.834.426.016 B | usar se 4B reprovar latência/memória |

Qwen3 declara mais de 100 idiomas, diálogo multiturno, GGUF oficial e suporte a
llama.cpp. O 4B oferece Q4_K_M de 2,5 GB e contexto nativo de 32.768 tokens; a
homologação usará contexto menor e sem thinking para reduzir latência. O
gpt-oss-20b declara structured output e execução em 16 GB, mas seu GGUF de
12,1 GB não é adequado ao perfil básico.

Gemma 3 foi considerada: o model card oficial declara mais de 140 idiomas e
tamanhos 1B/4B, mas os termos Gemma são próprios e o GGUF mais direto não está
sob a organização Google. Como já há dois candidatos Apache-2.0 com GGUF
direto, Gemma não entra no primeiro pacote. Isso não é reprovação de qualidade.

Fontes oficiais: `huggingface.co/Qwen/Qwen3-4B-GGUF`,
`huggingface.co/Qwen/Qwen3-1.7B-GGUF`, `huggingface.co/openai/gpt-oss-20b`,
`huggingface.co/ggml-org/gpt-oss-20b-GGUF`, `ai.google.dev/gemma/docs/core/model_card_3`
e `github.com/ggml-org/llama.cpp`.

