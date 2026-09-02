# Compatibilidade do runtime llama.cpp — Mudança 005B

## Resultado

O runtime canônico `llama.cpp b10172`, commit
`bc71c24c9da1e7ba6f5993da0e61476155720b06`, foi preservado. Não houve motivo
reproduzível para atualizar nem para alterar o ZIP da Mudança 005.

| Item | Gemma 4 E4B | Qwen3.5 4B |
|---|---|---|
| carga do GGUF | aprovada | aprovada |
| chat template | `--jinja`, adapter `gemma4` | `--jinja`, adapter `qwen35` |
| non-thinking | `--reasoning off` + kwargs do adapter | `--reasoning off` + `enable_thinking=false` |
| GBNF fixada | aprovada | aprovada |
| JSON estrito | aprovado | aprovado |
| contexto usado | 8.192 | 8.192 |
| GPU layers | 0 | 0 |
| bind | somente `127.0.0.1` | somente `127.0.0.1` |
| cancelamento | contrato do runtime preservado | contrato do runtime preservado |
| streaming | não utilizado no bake-off | não utilizado no bake-off |

## Artefato do runtime

- release: `b10172`;
- SHA-256 do ZIP CPU: `9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62`;
- licença: MIT;
- execução: CPU, uma sessão, sem multimodal e sem endpoint externo;
- rollback: o mesmo runtime e o instalador anterior permanecem canônicos.

## Falhas reproduzidas e correções confinadas

O primeiro probe real do Gemma mostrou que a gramática aceitava arrays em mapas
que o validador semântico recusava. O schema foi alinhado ao contrato escalar e
a GBNF regenerada antes de qualquer corpus. O primeiro probe Qwen revelou a
sentinela textual `"none"` em `active_journey`; ela passou a ser recusada pela
semântica antes de qualquer ação. Nenhuma correção relaxou parsing ou allowlist.

## Conclusão

O runtime é compatível com os dois candidatos obrigatórios. A reprovação dos
modelos ocorreu por qualidade e latência do Director, não por falha de carga,
template, grammar ou infraestrutura.
