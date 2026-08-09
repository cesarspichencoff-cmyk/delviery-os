# Local Planner Capacity Probe V1

## Escopo

Prova isolada de capacidade para o papel de `Conversation Planner`. Não testa Writer,
chatbot completo nem experiência visual. A e B permaneceram inalterados. Não houve
download, API externa, custo, push, merge ou deploy.

## Inventário

| MODEL | FORMAT | SIZE | RUNTIME | ALREADY_PRESENT | READY_TO_RUN |
|---|---|---:|---|---|---|
| `google/gemma-4-E4B-it` | GGUF QAT Q4_0 | 5.154.941.280 bytes | `llama.cpp b10172` | sim | sim |

O cache Hugging Face contém somente uma referência sem pesos de
`gokaygokay/Florence-2-Flux-Large`; ela não é um candidato executável. Não foram
encontrados pesos ou runtimes utilizáveis de Ollama, LM Studio, Jan ou GPT4All.

Verificação do candidato:

- modelo SHA-256: `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`;
- pacote de runtime SHA-256: `9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62`;
- runtime reportado: `llama.cpp 10172 (bc71c24c9)`;
- bind local: `127.0.0.1:4293`;
- custo externo: `R$ 0,00`.

## Método

- 20 casos obrigatórios A–T e quatro paráfrases U–X;
- mesmo prompt, contrato e parâmetros em todos os casos;
- oráculo separado da entrada de runtime e verificado por teste;
- seed fixa derivada do ID de cada caso;
- uma carga do modelo, um warm-up declarado e excluído das métricas;
- nenhuma resposta em cache;
- saída estruturada sem texto final para o cliente.

Gate pré-definido: zero erro crítico de safety, semântica >= 90%, estrutura >= 95%,
distinção entre `EXPAND`, `EXPLAIN`, `CORRECT` e `SWITCH`, generalização e p95 <= 20 s.

## Resultado

| Métrica | Resultado |
|---|---:|
| Casos | 24 |
| Structured validity | 100% |
| Semantic correctness | 4,17% (1/24) |
| Transition correctness | 12,5% |
| Repair correctness | 0% |
| Reference correctness | 50% |
| Generalização nas paráfrases | 0% |
| Safety preservation | 100% |
| Erros críticos de safety | 0 |
| Outputs inválidos | 0 |
| Fallback necessário | 23/24 |
| p50 | 39.134 ms |
| p95 | 43.700 ms |
| máximo | 44.285 ms |
| warm-up excluído | 33.040 ms |

O candidato produziu JSON válido, mas colapsou 22 casos em `OPEN -> ANSWER`.
Somente o caso R passou. A compreensão textual parcial não se transformou no plano
operacional exigido pelo contrato.

Falhas semânticas materiais:

- A/B/D/O/U/V: não distinguiu expansão de explicação;
- G/N/W: reconheceu correção no texto, mas não emitiu `CORRECT`;
- I/X: reconheceu mudança no texto, mas não emitiu `SWITCH`; em I interpretou o
  número 7 como horário e não como quantidade de pessoas;
- H: interpretou “vou aí” como confirmação de uma das opções, não como possível ida
  ao salão;
- K: escolheu `RESUME` como ação, mas marcou a relação como `OPEN`;
- T: preservou a urgência no conteúdo, sem erro crítico de safety, porém marcou a
  relação como `RESUME`.

## Veredito

`LOCAL_PLANNER_CAPACITY_NOT_FOUND`

O único modelo local executável não atingiu capacidade semântica nem latência para o
papel. Isso encerra o desconhecido dentro do envelope atual. Não prova que outro
modelo, hardware, quantização ou tuning futuro falharia; nenhum deles foi testado.

Artefato canônico da execução:
`1e901eb9191f4f464d2a1fe882d1a853982103b0ffb7f15003612f8cc4bee64b`.
