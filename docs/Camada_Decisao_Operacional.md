# Camada de Decisão Operacional — especificação prática

> **"O DeliveryOS não mostra mais problemas. Ele reduz decisões."**
> Camada pequena acima dos sinais. Não decide pela equipe; diz: *"se você olhar uma coisa agora, olhe isso."*
> Código: [`src/perfil-delivery/decisao.js`](../src/perfil-delivery/decisao.js) — compartilhado Node + browser, como o motor.

## O que entra

```
DECISAO.decidir(snap, INFO, { fonteReal })
```
- **snap** — a fotografia do minuto que o `MOTOR.step` já produz: situações classificadas (`sits`) + contexto vivo (`ctx: pedidos em produção, prontos, carga por praça`);
- **INFO** — o conhecimento de cada pedido vivo (do resolver: praças, âncora, sacolas, bebida/kit/observação, praça única);
- **fonteReal** — flag que diz se a composição veio de itens reais ou da síntese. **Nenhum dado novo é coletado**: a camada só ranqueia o que os sinais já provaram.

## O que sai

Uma única recomendação (ou `null` quando calmo — silêncio é feature):

```
AÇÃO RECOMENDADA — Priorizar Duplas
por quê: 6 pedidos saem se Duplas liberar agora
primeiro olhar: Pedido #8565 (combinado — segura o pedido inteiro)
impacto: libera 6 saídas · reduz risco de atraso
confiança: média
dados: tempos reais (iFood) · cardápio real (199 itens) · composição sintética
```

Campos: `acao · porque · primeiro · impacto · confianca (alta/média/baixa) · dados · tipo · todas` (ranking completo, para auditoria/backtest).

## Como ranqueia (simples de propósito — sem previsão inventada)

| Tipo | Cálculo | Base do score |
|---|---|---|
| `priorizar_praca` | **release impact**: nº de pedidos cuja única praça pendente é esta (saem se ela liberar) + **pedido âncora** (espera × nº de bancadas; combinado ganha desempate) | `unblock×2 + carga×0,5 + severidade` |
| `fechar_simples` | pedidos que dependem de **uma única praça** e já esperam > 50% do piso | `qtd×1,5 + 1` |
| `chamar_motoboy` | prontos parados > piso de expedição (surge) | `qtd×1,8 + 2` |
| `conferencia` | 2 sacolas / bebida / kit / **observação do cliente** | `2-3 + 2 se 2ª sacola` |
| `conferir_saida` / `olhar_pedido` | outlier individual (pedido preso/sem sair) | `pico/25 + severidade` |

Maior score vence. Empate → maior severidade.

## Confiança proporcional à fonte (regra de honestidade)

| Situação | Confiança |
|---|---|
| Ação de **tempo/estado** (motoboy, pedido sem sair) — motor A é real | **alta** já hoje |
| Ação de **composição** (praça, fechável, conferência) com composição sintética | **média** (teto) |
| Idem, com **itens reais** (`fonteReal: true`) | sobe para **alta** automaticamente |
| Evidência fraca (severidade 1 e nada a destravar) | **baixa** |

A fonte real é detectada pelo mesmo seam de sempre: `makeFonteItensFromCsv/Json` expõe `.stats`; a sintética não. Trocar a fonte muda a confiança **sem tocar em nenhuma regra**.

## Quais decisões difíceis ela já elimina

- **"O que eu olho primeiro?"** → ranking único por impacto físico; a tela mostra 1 ação, não uma lista;
- **"Qual praça está segurando mais?"** → release impact calculado, não intuído;
- **"Qual pedido destrava mais saídas?"** → pedido âncora nomeado (o combinado que segura o fluxo);
- **"Dá pra fechar algum agora?"** → pedidos de praça única listados prontos;
- **"Esse risco pode esperar?"** → o que não é a ação top não interrompe ninguém (vira ambiente).

## Quais ainda NÃO elimina (e por quê)

- **"Qual item pausar?"** → precisa de estoque/ruptura real (futuro; não vem de cardápio nem de timing);
- **"Quanto reforço chamar / escala"** → decisão de gestão, fora do escopo do pico;
- **"Confio no número da praça?"** → só com **item real por pedido** (o desbloqueio principal continua sendo a [Fonte Real de Itens](Fonte_Real_Itens_Plano.md));
- **"O pedido está completo de fato?"** → só com pronto-por-praça (KDS, o destino).

## O que depende de item real

Números do backtest (30 dias): **460 recomendações**, das quais **56 (12%) dependem de composição** — hoje limitadas a confiança média; sobem para alta no dia em que uma noite real entrar pelo modo ponte (`pedido_id, item_nome, quantidade, observacao, horario`). As outras 404 (88%, dominadas por *chamar motoboy*) já operam com dado 100% real.

## Onde aparece

- **Protótipo**: só quando há foco — o foco vira *situação + recomendação + porquê + impacto + confiança* (bloco `AÇÃO RECOMENDADA` abaixo do comando; nenhum redesenho);
- **Auto Teste**: seção "Camada de Decisão" com volume por tipo, distribuição de confiança e exemplos reais gerados do mês.

## Guarda-corpos

Sem tuning · sem baseline · sem módulo novo · sem IA solta · sem previsão inventada · **não aumenta a quantidade de alertas** (a recomendação nasce dentro do foco que já existia; calmo continua mudo).
