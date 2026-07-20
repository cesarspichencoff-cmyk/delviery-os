# Release Gates — DeliveryOS (Auditoria 2026-07-20)

> Três categorias que não se misturam: Demonstração ≠ Piloto ≠ Produção.
> Um item só sobe de gate quando TODOS os critérios do gate estão comprovados.

## Gate 1 — Pronto para Demonstração (local controlado)

Permite dados simulados **claramente rotulados** e ambiente local.

| Critério | Copiloto | Entregas | Seleção |
|---|---|---|---|
| Abre limpo pela entrada canônica | ✅ | ✅ (4 superfícies @`bb567a6`) | ❌ (não localizado) |
| Sem erro de console/rede | ✅ | — | — |
| Dado simulado rotulado | ✅ | — | — |
| Suítes verdes | ✅ 317/317 | — | — |
| Baseline visual congelado | ✅ (`6f04177`) | protótipo estático | — |
| Sem afirmação além da evidência | ✅ | ✅ (Gate Zero honesto) | — |

**Status:** Copiloto **PASSA** (`101680a`). Entregas-demo **PASSA** para Gate 1 (`bb567a6`: 99 testes, 4 superfícies, rotulado como demonstração). SELECAO **não localizado**.

> Nota: os critérios abaixo (dados reais, auth, DB, etc.) valem tanto para Copiloto quanto para o Entregas — nenhum dos dois passa do Gate 1 hoje.

## Gate 2 — Pronto para Piloto (operação real assistida)

Exige tudo do Gate 1 **mais**:

| Critério | Estado atual |
|---|---|
| Dados reais integrados (não simulador) | ❌ — composição é sintética (motor B); fonte viva iFood existe mas pipeline real não está ligado no Copiloto de demo |
| Autenticação | ❌ — nenhuma |
| Autorização / RBAC | ❌ |
| Logs de auditoria com retenção definida | ⚠️ parcial — log sombra existe, sem rotação/retenção |
| Monitoramento / alertas de saúde | ❌ |
| Rollback definido | ✅ (modo sombra) / ⚠️ (produto geral não) |
| Segurança: HTTPS, headers, bind seguro | ⚠️ — bind agora localhost por padrão; falta HTTPS/headers para exposição real |
| Privacidade: RLS verificado, PII mascarada | ⚠️ — sombra sem PII ✅; tata-house RLS não verificado |
| Operação assistida definida | ❌ |

**Status:** **NÃO** para nenhum módulo. Bloqueadores principais: dados reais, auth, monitoramento.

## Gate 3 — Pronto para Produção

Exige tudo do Gate 2 **mais**: validação em operação real por semanas, critérios de precisão do motor comprovados com dado real, suporte, backup/restore testado, DR, e — para o modo sombra — aprovação humana explícita registrada antes de qualquer ativação além de observação.

**Status:** **NÃO**. Distante. Nenhum módulo se aproxima.

## Gate específico — Capacidade Viva sombra → operação

Definido em [CAPACIDADE_VIVA_SHADOW.md](CAPACIDADE_VIVA_SHADOW.md). Resumo: semanas de observação real + confronto explícito do César + zero divergência sistemática + aprovação humana registrada. Decisão automática exige fase, flag e aprovação próprias — nunca decorre do sucesso da sombra.

## Notas de qualidade de teste (afetam confiança nos gates)

- **Flakiness de porta (P3):** os testes de servidor real usam `porta = base + (pid % 100)`. Colidem com processos que estejam ocupando a porta (ex.: dev server esquecido). Recomendação: portas efêmeras (`:0`) ou checagem de porta livre antes de subir. Rodar a suíte 2× reduz falso-negativo.
- **Isolamento de log:** resolvido nesta linha de trabalho (override de caminho por env) — testes concorrentes não disputam mais o mesmo `.jsonl`.
- **Sem CI:** todas as suítes rodam localmente. Nenhum gate automatizado impede regressão entre commits. **Recomendado antes de piloto.**
