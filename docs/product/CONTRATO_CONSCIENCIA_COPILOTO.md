# Contrato: Operação Viva · Copiloto · Garantias Shadow · Conference Brain

> Define **quem decide o quê** antes de qualquer conexão de runtime.
> Exigido pela `FASE DE RECUPERAÇÃO DO PRODUTO OPERACIONAL` §6.
> **Nenhuma conexão foi feita.** D43 continua de pé: os dois motores não são ligados até este
> contrato ser testado.
> Criado em 2026-08-01 sobre HEAD `b3fc4c1`.

---

## Por que este contrato existe antes do código

Existem hoje dois produtores de recomendação no repositório, e eles não se conhecem. Ligá-los sem
decidir quem manda recria o defeito exato que foi medido em **30,8% dos onsets de foco** e corrigido
no commit `37ca1c9` (05/07/2026): a ação exibida ter causa raiz diferente da tensão que abriu o foco.

A regra que fechou aquele defeito é a espinha deste contrato:

> **`sess.active.sit` é a fonte da verdade da atenção.** A ação pode **refinar** o foco (mesma causa,
> alvo mais específico), **nunca trocar** de causa raiz. Sem ação segura dentro do escopo do foco
> ativo, cai para o foco puro.
> — `docs/Contrato_Motor_Decisao.md` §10 · `docs/Decisao_Correcao_Motor_Decisao.md`

---

## 1. Operação Viva — dona do estado cognitivo

**É a única que decide.** Nenhum outro componente cria Foco.

| Responsabilidade | Detalhe |
|---|---|
| Consolidar sinais | recebe fatos dos domínios; nenhum domínio cria Foco (`Mapa_Mestre` §2.2, §2.3) |
| Determinar o estado | Calmo · Ambiente · Foco, por severidade + persistência + janela |
| Manter tudo visível | todos os problemas relevantes permanecem na tela, em registros distintos (D42) |
| Eleger o Foco | uma situação por vez; as demais recuam para Ambiente, nunca somem |
| Fechar o ciclo | Resolução: distinguir resolvido-de-fato de demovido-por-teto |

**Mecanismos medidos que não se negociam:** `DEBOUNCE` 3 min · `COOLDOWN` 45 min · `MAXFOCUS` 8 min ·
`STALE` 120 min · exclusividade de slot. Vieram de medição da operação real
(`FLOORS`, `motor.js:34`), não de palpite.

**Saída do contrato:**
```
{ modo: "calmo" | "ambiente" | "foco",
  pulso: <número de pedidos em andamento>,
  ambientes: [ { area, cor, motivo_curto } ],       // até 2 rótulos; 6 áreas com cor
  foco: { causa_raiz, severidade, evidencias } | null }
```

**Nome:** a divergência entre "Operação Viva = núcleo cognitivo" e o arquivo
`src/platform/projections/operacao-viva.ts` (projeção de viagens) **permanece aberta** (conflito C2).
Este contrato descreve o **papel**, não o arquivo.

---

## 2. Motor original do Copiloto — dono da orientação

**Não decide se interrompe. Decide o que fazer quando já foi decidido interromper.**

| Recebe | Devolve |
|---|---|
| um Foco **legitimamente produzido** pela Operação Viva | uma orientação, ou **silêncio** |

**Restrição de escopo, inegociável:** um candidato só pode vencer se for causalmente ligado à **mesma
causa raiz** do foco ativo. Implementada em `dentroDoEscopo()` (`decisao.js`, commit `37ca1c9`).
Sem candidato dentro do escopo → **foco puro**, sem bloco de ação.

**Formato da orientação** (`Camada_Decisao_Operacional` §"hierarquia oficial"):
1. **AÇÃO** — imperativo, ≤4 palavras
2. **Por quê** — uma linha
3. **Primeiro olhar** — uma linha, o pedido ou praça exato
4. **Impacto** — uma linha
5. **Confiança** — sussurro, **só quando não for alta**. A certeza é silenciosa.

**Máximo: 4 linhas + sussurro.** Ranking por impacto físico: `unblock×2 + carga×0,5 + severidade`.
Silêncio quando calmo — `null` é resposta válida e desejada.

**O que ele NÃO faz:** não coleta dado novo · não decide interromper · não escolhe outra causa raiz ·
não executa nada.

---

## 3. Garantias Shadow — dono da confiabilidade

**Não produz orientação. Valida a que existe.** É a camada construída na Unidade 5, e ela cobre
exatamente o que o motor original não tem.

| Garantia | Origem |
|---|---|
| Procedência declarada (real · simulado · controle) | `conference-bridge.ts` |
| Evidência rastreável obrigatória | idem — recomendação sem evidência é recusada |
| Confiança em faixa válida, nunca sem lastro | `exigirConfianca` |
| Validade e expiração | ciclo de vida `proposed → expired` |
| Retirada e invalidação, com motivo | `dismissed`, `invalidated` |
| PII sanitizada antes de persistir | `PiiGuard` |
| Persistência idempotente e auditável | store JSONL do Brain |
| **Ausência de execução automática** | `requires_human` literal; estado `executed` não existe |

**Relação com o motor:** as garantias **envolvem** a orientação; não a substituem. O motor diz *o
quê*; as garantias provam *que se pode confiar*. São complementares — nunca concorrentes.

---

## 4. Conference Brain — infraestrutura de raciocínio e auditoria

- **Permanece infraestrutura.** Não é a experiência principal da operação.
- **Não cria Foco diretamente.**
- Observa dimensões de pedido, reconcilia histórico, mantém saúde de fonte e store auditável.
- Sua superfície na Unidade 6 é **console de inspeção**, não jornada de operação.
- Não aparece em nenhuma fonte de produto original — é infraestrutura **adotada**, e isso está
  registrado.

---

## 5. O fluxo completo, e onde cada um entra

```
domínios (Entregas, Suprimentos…) ── fatos ──▶ OPERAÇÃO VIVA
                                                    │  decide o estado
                                    ┌───────────────┼───────────────┐
                                 CALMO           AMBIENTE          FOCO
                                    │               │               │
                              pulso + atenções   até 2 rótulos   causa raiz eleita
                              práticas           + 6 áreas com        │
                              (sem ação)         cor (sem ação)       ▼
                                                              MOTOR DO COPILOTO
                                                              ranqueia dentro do escopo
                                                                     │
                                                              orientação (4 linhas) ou silêncio
                                                                     │
                                                              GARANTIAS SHADOW
                                                              procedência · evidência · validade
                                                              · retirada · PII · sem execução
                                                                     │
                                                                     ▼
                                                                  HUMANO decide
```

**Conference Brain** fica ao lado, alimentando raciocínio e auditoria — nunca no caminho do Foco.

---

## 6. Invariantes que o contrato precisa provar antes de qualquer conexão

Nenhuma destas foi testada ainda. São o gate da ação **R5** do mapa de recuperação.

| # | Invariante | Como se prova |
|---|---|---|
| I1 | A ação nunca troca a causa raiz do foco | mutação: remover `dentroDoEscopo()` → o gate cai |
| I2 | Sem candidato no escopo, sai foco puro (nunca ação de outra causa) | fixture com foco sem candidato compatível |
| I3 | Calmo devolve `null` de orientação | fixture sem situação acima do piso |
| I4 | Ambiente nunca carrega bloco de ação | asserção estrutural na view model |
| I5 | Um ambiente vermelho nunca fica oculto | fixture com 2 vermelhos simultâneos |
| I6 | Área sem fonte nunca aparece verde | fixture Caixa/Conferência sem dado |
| I7 | Exclusividade de slot: nunca dois focos | fixture com duas situações severas |
| I8 | Nenhuma orientação executa ação | asserção sobre vocabulário e ausência de controle |
| I9 | Confiança sem evidência não é apresentada | já provado na Unidade 6; reaplicar aqui |
| I10 | Procedência declarada em toda orientação | real × simulado × controle distinguíveis |

**Regra de parada:** enquanto I1 a I10 não estiverem verdes, **os dois motores não se conectam**.
É a aplicação direta de D43.

---

## 7. O que este contrato deliberadamente não resolve

- **C2** — qual dos dois artefatos fica com o nome "Operação Viva". Decisão do César.
- **C1** — se Ambiente pode carregar orientação de ação. O César pediu "dicas práticas" nos
  secundários; `Modelo` §3 e `Mapa_Ambientes` §11 proíbem bloco de ação em Ambiente. **Conflito real,
  não resolvido por hierarquia de fontes** — precisa dele.
- **C3** — qual motor é o dono final da atenção quando ambos existirem em runtime.

Estes três não são ambiguidade de redação: são escolhas de produto.
