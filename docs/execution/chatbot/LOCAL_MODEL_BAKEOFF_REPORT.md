# Relatório do bake-off local

## Conclusão executiva

A infraestrutura técnica e o painel cego estão prontos para homologação humana. Não existe vencedor porque César ainda não votou. Produção permanece bloqueada.

## Configuração

- seed: `TATA-LOCAL-AI-BAKEOFF-V1`;
- corpus: 260 casos sintéticos, 12 categorias e 20 conversas livres com pelo menos oito turnos;
- runtime: llama.cpp b10172 CPU Windows x64, reasoning desligado;
- contexto: 4096;
- GPU layers: 0;
- controle A: Mudança 004 determinística;
- candidato local principal: Qwen3 4B Q4_K_M;
- candidato local leve: Qwen3 1.7B Q8_0;
- pesos, binários e resultados privados ficaram fora do Git.

## Integridade dos artefatos finais

- hash público canônico: `d911147cec578b628fb4666366b98f86b2d113a194c74837560c094966b69261`;
- hash privado canônico: `92bc0889d958d5015570551b6102f5af9ecd685f8b6695ee89727231df772d09`;
- vencedor humano: `null`;
- payload público não contém modelo, versão, natureza, latência ou caminho privado;
- scanner: zero padrão de PII nos artefatos;
- contexto exibido é específico do cenário, nunca “Mensagem sintética do cenário”.

## Resultado técnico

| Candidato | Aceitas | Fallbacks | Taxa | p50 | p95 | Máximo |
|---|---:|---:|---:|---:|---:|---:|
| Mudança 004 determinística | 260 | 0 | 100% | 0 ms | 0 ms | 0 ms |
| Qwen3 4B Q4_K_M | 250 | 10 | 96,15% | 3.945,53 ms | 8.425,83 ms | 17.024,35 ms |
| Qwen3 1.7B Q8_0 | 217 | 43 | 83,46% | 2.721,54 ms | 5.300,68 ms | 9.482,32 ms |

Os 10 fallbacks do 4B foram `WRITER_REQUIRED_QUESTION_MISSING`. No 1.7B foram 41 desse motivo, um `WRITER_TEXT_TOO_LONG` e um `WRITER_UNAPPROVED_NUMBER`. Todos usaram fallback; nenhum foi promovido silenciosamente.

## Aprendizado entre rodadas

A primeira rodada expôs que o Writer validava pergunta obrigatória, mas o prompt não instruía o modelo a usá-la: 4B 53,85% e 1.7B 41,54%. A instrução genérica e seed por caso elevaram as taxas para 96,15% e 83,46%, sem enfraquecer validação.

A QA visual encontrou contexto público genérico. A correção alterou somente `turns`. A prova `CONTEXT_REBIND_PROOF.json` registra zero divergências de `writer_input`, zero mudança nas opções e hash idêntico para todos os resultados privados. As inferências não foram repetidas porque suas entradas, seeds, textos e métricas permaneceram byte a byte iguais.

## Smokes reais

No Qwen3 4B, reasoning automático consumiu 295 tokens e 37,7 s para uma saudação curta. Com `--reasoning off`, a mesma resposta usou 17 tokens e 8,6 s. Um caso com pergunta obrigatória foi repetido com a mesma seed: texto idêntico, aceito; 9,36 s na primeira chamada e 1,45 s com cache.

O 1.7B produziu a saudação validada em 6,0 s. A rodada final de inferência dos dois modelos levou 31 min 10 s nesta máquina de desenvolvimento em CPU.

## Painel

QA visual real confirmou:

- contexto coerente;
- três opções A/B/C sem identidade pré-voto;
- oito critérios de 1 a 5;
- identidade revelada somente depois do voto;
- avanço automático para o próximo caso;
- zero erro de console;
- votos append-only em raiz externa.

## Limitações

- julgamento de naturalidade, utilidade, confiança e “César enviaria” continua humano;
- algumas respostas aceitas podem soar prolixas ou pouco naturais, exatamente o que o voto deve medir;
- hardware do restaurante não foi medido;
- CPU apresentou máximo acima de 15 s no 4B, embora p95 tenha ficado abaixo;
- CUDA não foi homologado;
- nenhum candidato está autorizado para clientes reais.

Veredito técnico: painel pronto; vencedor humano inexistente.
