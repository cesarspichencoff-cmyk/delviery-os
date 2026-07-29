# Pesquisa de modelos abertos atuais — Mudança 005B

Consulta realizada em 2026-07-29 somente em páginas, repositórios, model cards,
licenças e releases oficiais. O objetivo é comparar modelos locais na arquitetura
certificada da Mudança 005, sem API, nuvem ou alteração do instalador aprovado.

## Resultado executivo

| Papel | Candidato | Decisão de pesquisa |
|---|---|---|
| baseline | Qwen3 4B Q4_K_M | preservar versão, configuração e resultados da Mudança 005 |
| candidato B | Google Gemma 4 E4B IT QAT Q4_0 | executar o GGUF oficial publicado pela organização `google` |
| candidato C | Qwen3.5 4B pós-treinado | executar apenas com conversão GGUF secundária de proveniência fixada |
| opcional D | Google Gemma 4 12B Unified IT QAT Q4_0 | decidir somente depois dos dois candidatos obrigatórios e de novo Doctor |

## Google Gemma 4 E4B Instruction-Tuned

- organização proprietária: Google DeepMind;
- lançamento da família: 2026-04-02;
- variante: `google/gemma-4-E4B-it`, instruction-tuned oficial;
- revisão dos pesos IT: `ee0ef6023621cff504d758262d4e04895a5af4a2`;
- arquitetura: modelo denso multimodal, 4,5 bilhões de parâmetros efetivos e
  aproximadamente 8 bilhões incluindo embeddings por camada;
- idiomas: mais de 140, incluindo português;
- contexto: 128K no modelo pequeno;
- thinking: configurável; o teste será textual e com raciocínio desativado;
- structured output e ferramentas: suporte depende do runtime; serão certificados
  por grammar, parsing estrito e validação semântica, não por promessa do card;
- licença e uso comercial: Apache-2.0;
- pesos originais: safetensors, 15.992.595.884 bytes;
- GGUF oficial escolhido: `google/gemma-4-E4B-it-qat-q4_0-gguf`, revisão
  `4b4a2c1d584be7264f87aac328a1bc739ce81b6c`;
- arquivo textual: `gemma-4-E4B_q4_0-it.gguf`, 5.154.941.280 bytes, SHA-256
  `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`;
- memória publicada para Q4_0: aproximadamente 4,5 GB, antes do contexto e do
  overhead específico do runtime;
- runtime declarado: llama.cpp possui suporte oficial; o baseline b10172 é
  posterior à introdução de Gemma 4, mas será provado localmente antes do corpus;
- risco principal: embeddings grandes e cache de contexto; usar 8K, texto puro,
  uma sessão e nenhum projetor multimodal.

Fontes: [anúncio oficial](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/),
[documentação oficial](https://ai.google.dev/gemma/docs/core),
[model card oficial](https://huggingface.co/google/gemma-4-E4B-it) e
[GGUF QAT oficial](https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf).

## Qwen3.5 4B pós-treinado

- organização proprietária: Qwen Team / Alibaba Cloud;
- lançamento da família: 2026-02-16; variante 4B publicada em 2026-03-02;
- variante: `Qwen/Qwen3.5-4B`, pós-treinada e conversacional, não o modelo base;
- revisão oficial: `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`;
- arquitetura: 4B, 32 camadas, Gated DeltaNet e Gated Attention, MTP treinado;
- idiomas: 201 idiomas e dialetos, incluindo português;
- contexto nativo: 262.144 tokens; o teste usará 8K porque thinking estará
  desativado e a tarefa não exige contexto longo;
- thinking: ligado por padrão; o modo direto oficial requer
  `chat_template_kwargs.enable_thinking=false` e não aceita `/nothink` como
  chave semântica equivalente;
- amostragem oficial para non-thinking geral: temperatura 0,7, top-p 0,8,
  top-k 20, min-p 0 e presence penalty 1,5;
- licença e uso comercial: Apache-2.0;
- pesos oficiais: dois safetensors, 9.319.828.096 bytes no total;
- GGUF oficial no namespace Qwen: não localizado em 2026-07-29;
- conversão secundária admissível: `bartowski/Qwen_Qwen3.5-4B-GGUF`, revisão
  `4168f45a16a1290d65a4ec0fa312ae917a4c15d6`, gerada a partir do modelo
  oficial com llama.cpp b9222 e imatrix documentada;
- quantização escolhida: `Qwen_Qwen3.5-4B-Q4_K_M.gguf`, 3.013.027.808 bytes,
  SHA-256 `13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983`;
- risco principal: conversão de terceiro e arquitetura híbrida recente; qualquer
  erro de carga, template, grammar ou saída encerra o candidato sem relaxamento.

Fontes: [anúncio oficial](https://qwen.ai/blog?id=qwen3.5),
[repositório oficial](https://github.com/QwenLM/Qwen3.5),
[model card oficial](https://huggingface.co/Qwen/Qwen3.5-4B) e
[conversão fixada](https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF).

## Google Gemma 4 12B Unified Instruction-Tuned

- lançamento: 2026-06-03;
- organização: Google DeepMind;
- revisão IT oficial: `707f0a3b8a3c7ad586ed01e27eafbad8a27dd0f7`;
- revisão GGUF QAT oficial: `29d097773436b69ff9feafd636ab4cf873786537`;
- arquivo: `gemma-4-12b-it-qat-q4_0.gguf`, 6.975.879.296 bytes, SHA-256
  `93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b`;
- arquitetura: 11,95B Unified, encoder-free e multimodal;
- contexto: 256K; o eventual teste usará 8K e somente texto;
- licença: Apache-2.0;
- memória Q4_0 publicada: aproximadamente 6,7 GB antes do contexto e overhead;
- decisão atual: opcional, ainda não baixar. RAM nominal de 32 GB não é
  aprovação; estabilidade, temperatura, paginação e latência precisam passar.

Fontes: [anúncio oficial](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12B/)
e [documentação de memória](https://ai.google.dev/gemma/docs/core).

## Runtime e limite de escopo

- runtime anterior: llama.cpp b10172, commit
  `bc71c24c9da1e7ba6f5993da0e61476155720b06`, MIT, arquivo CPU de
  18.338.109 bytes e SHA-256
  `9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62`;
- release atual consultada: b10173, commit
  `e9fa0781f1c25fc4fe8c86be1edc6970661ad6f0`, publicada 37 minutos depois;
- nenhuma atualização é justificada antes de provar falha do b10172;
- o ZIP da Mudança 005 permanece externo e imutável, SHA-256
  `9ec05a9223e6b1b3ea76bb88d4c29d5a9280750b60b6a9a600841df4c88756c9`.

Fonte: [releases oficiais do llama.cpp](https://github.com/ggml-org/llama.cpp/releases).
