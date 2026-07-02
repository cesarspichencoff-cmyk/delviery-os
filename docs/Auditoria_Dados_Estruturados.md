# Auditoria — Dados Estruturados da Operação TATÁ

> **"Não estamos juntando planilhas. Estamos transformando a história operacional da TATÁ em memória estruturada do DeliveryOS."**
> Fonte: `Downloads/Dados Claude.zip` (16 arquivos). Auditoria feita ANTES de tocar no motor.
> Nada aqui altera regra, baseline ou interface.

## 1. Inventário e período

| Arquivo | Período | Linhas | Tipo | Confiança |
|---|---|---:|---|---|
| Relatorio Outubro 25 | 01–31/10/2025 | 7.188 | pedido-a-pedido, 56 col | alta (oficial iFood) |
| Relatorio Novembro 25 | 01–30/11/2025 | 7.974 | idem | alta |
| Relatorio Dezembro 25 | 01–30/12/2025 | 7.273 | idem | alta |
| Relatorio Janeiro | 02–31/01/2026 | 7.432 | idem | alta |
| Relatorio Fevereiro | 01–28/02/2026 | 7.412 | idem | alta |
| Relatorio Marco | 01–31/03/2026 | 7.861 | idem | alta |
| Logistica | 03/04–30/06/2026 | 24.905 | pedido-a-pedido, 29 col (foco logístico) | alta |
| *(já em uso)* relatorio-pedidos | 27/05–25/06/2026 | 8.305 | **99,7% contido na Logística** | alta |
| Relatorio Cancelamentos | 13/04–05/07/2026 | 464 | cancelamento-a-cancelamento, **com nomes de itens** | alta |
| Negociacoes Ifood | 03/04–30/06/2026 | 604 | negociação-a-negociação | alta |
| Cardapio (Funil/Itens/Complementos) | 03/04–01/07/2026 | 1 + 180 + 27 | **agregado** por item/complemento | alta (agregado) |
| Qualidade Abril · Maio e Junho | 01/04–30/06/2026 | ~200 (pivotado) | série diária de indicadores | média (parse pivotado) |
| Vendas Abril/Maio/Junho + consolidado | 03/04–01/07/2026 | pequenas | agregado mensal/hora/dia-semana | alta (agregado) |

**Cobertura pedido-a-pedido: 01/10/2025 → 30/06/2026 — 9 meses, ~70.000 pedidos** com timing completo (lacunas mínimas: 31/12, 01/01, 01–02/04).

## 2. Colunas principais (por família)

- **Relatórios mensais (56 col):** ids (completo+curto), data/hora, turno, status, **todos os valores** (itens, pago, taxas, incentivos, líquido), pagamento, tipo de entrega, canal, agendado, **cancelamento completo** (tipo/motivo/origem/data/valor/contestável), aceito pela loja, **todos os tempos** (preparo, alocação do entregador, botão pronto, entregador→loja, esperando na loja, entregador→cliente, esperando no cliente, prometido, realizado, atraso), distâncias, **negociações no preparo e pós-entrega**, problema pós-entrega.
- **Logística (29 col):** mesmos ids/tempos + `TEMPO GLOBAL DO ENTREGADOR ESPERANDO NA LOJA`, serviço logístico, agrupamento de rota, prioridade.
- **Cancelamentos:** motivo, origem, **`Itens cancelados` = NOMES REAIS por pedido** (~2,4 itens/pedido; 2 formatos: `A; B; C` e `[A, B, C]`), contestação, impacto no super.
- **Negociações:** momento, motivo, quem iniciou/respondeu, reembolso, cupom, tempo ofertado em atraso, **cancelamento evitado**.
- **Cardápio Itens (180):** item, categoria, **visitas, pedidos, conversão, vendas qty, valor** — popularidade REAL. **Complementos (27):** nome, classificação, pedidos, qty.
- **Qualidade:** série diária Indicador × Dia (pedidos totais, R$ cancelado, metas, nível Super).
- **Vendas:** total/ticket/novos clientes por mês + **pedidos por faixa de 2h × semana/fds** + dia da semana + pagamento.

## 3. O que os dados DESTRAVAM

1. **Motor A (tempo/estado) validável em 9 meses / ~70k pedidos** — o Auto Teste deixa de ser 1 mês; sazonalidade e dias extremos entram na validação.
2. **Baseline honesto de demanda** — pedidos por hora×dia-semana×turno medidos (não chutados). *(Uso: contexto/aprendizado — tuning continua adiado por decisão.)*
3. **Popularidade real de 180 itens + 27 complementos** — substitui os pesos INVENTADOS da fonte sintética. A síntese continua sintética por pedido, mas com frequências reais de venda.
4. **Sinal motoboy vira história**: alocação, a caminho da loja, **esperando na loja** — a dor nº1 das conversas (920 menções) agora tem série real por pedido.
5. **Camada de desfecho completa** (o `dominio.ts` já tem a dimensão `desfecho`): cancelamento (motivo/origem/valor), negociação (quem/quando/resposta/reembolso/**evitado**), problema pós-entrega. Liga direto na tese do "fechamento ressuscitado".
6. **Composição real PARCIAL**: 464 pedidos cancelados com itens nomeados — valida o cardápio-conhecimento (nomes batem com o seed), dá co-ocorrência real de cesta, e cria o primeiro corpus real de item-por-pedido.
7. **Série diária de qualidade** → matéria-prima do **aprendizado estrutural** (observação → evidência → proposta → aprovação humana).
8. **Financeiro por pedido** (valores/taxas/incentivos) → módulos futuros sem nova coleta.

## 4. O que os dados NÃO destravam (honestidade)

- **Item real por pedido (geral)** — nenhum arquivo tem `pedido_id + item + quantidade + observação` para pedidos normais. Os 464 cancelados são **enviesados** (só cancelamentos) e **sem quantidade/observação**. Cardápio agregado ≠ composição do pedido. **Sem isso, praça/âncora/2ª-sacola continuam ilustrativos por pedido.**
- **Eventos por praça** (pronto-por-praça) — inexistem; só KDS/produção dará.
- **Observações do cliente** — não aparecem em nenhum arquivo.
- **Estado ao vivo** — tudo aqui é D+1; nada substitui fonte de estado em tempo real no pico.

## 5. Campos → motor de decisão (quando a base canônica existir)

`tempo_esperando_na_loja` (motoboy), `tempo_alocacao` (antecipa gargalo de saída), `atraso`/`prometido` (promessa), `agendado` (pedido programado ≠ atrasado), `prioridade/rota` (agrupamento), desfechos (feedback de precisão do foco — substitui a proxy "bad" atual por desfecho rico).

## 6. Campos → aprendizado estrutural

Séries diárias de qualidade + cancelamentos por motivo/faixa-hora + negociações (evitáveis?) + popularidade por item ao longo do tempo + demanda hora×dia. Fluxo travado: **observação → padrão → evidência → proposta → aprovação humana → regra**. Nenhuma regra nasce sozinha.

## 7. Riscos de duplicidade

- Logística ∩ relatório antigo: **8.279/8.305 (99,7%)** — dedup por `ID COMPLETO` obrigatório; fontes se **complementam** em colunas (relatório = valores/desfecho; logística = tempos/rota).
- Vendas/Cardápio/Qualidade agregam os MESMOS pedidos — nunca somar agregado com pedido-a-pedido.

## 8. Riscos de junção (medidos)

- `ID CURTO` repete **33,9% dentro de um mês** (máx 6× o mesmo id) e **~1,4% até no MESMO dia** (105 casos em Março).
- Cancelamentos/Negociações **só têm ID curto** + data/hora → junção dia-nível com ambiguidade residual.
- **Política oficial** (aprovada): 1º `id_completo`; 2º `id_curto+data/hora aproximada+loja`; 3º `id_curto+dia+turno`; ambíguo → **`confianca:"baixa"`, nunca join silencioso**. Dado incompleto > dado errado.

## 9. Lacunas críticas

1. Item por pedido (geral) — **continua o desbloqueio nº1** (impressora/ponte/API).
2. Abril 01–02 + 31/12 + 01/01 (lacunas de cobertura, aceitáveis).
3. Qualidade em formato pivotado (precisa parser dedicado; risco de erro de leitura → conferir com totais dos relatórios).
4. Observações e complementos por pedido — só a impressora/API trarão.

## 10. Estratégia de fontes SEM API (avaliação crítica)

| Fonte | Captura | Não captura | Confiança | Dificuldade | Risco | Teste | Papel |
|---|---|---|---|---|---|---|---|
| **Impressora/comanda (spool)** | itens, qtd, **observações**, complementos, horário de produção, por pedido | estado pós-saída, entrega | alta | média (driver virtual/tee no PC do caixa) | baixo-médio (layout muda raro e é local) | 1-2 noites | **fonte de COMPOSIÇÃO — quase-definitiva** até a API |
| **Espelhamento da tela (Gestor)** | estado vivo (recebido/pronto/despachado) | composição confiável, histórico | média | média-alta | **alto** (UI muda, ToS cinza, máquina logada) | dias | ponte de ESTADO — mínima e descartável |
| **Exportações do portal** (estes arquivos) | tudo do §2, oficial | tempo real | alta | zero (já provado) | baixo | já feito | **RECONCILIAÇÃO D+1 — memória oficial que corrige o vivo** |
| Planilha ponte manual | 1 noite de itens | escala | alta (pontual) | zero (pronta) | baixo | 1 noite | validação |
| KDS próprio | pronto-por-praça | — | alta | alta (módulo novo — vetado agora) | — | meses | destino |
| Conferência própria (lacre) | item conferido na sacola | — | alta | alta (é a Camada 1, congelada) | médio (vira preenchimento se mal feito) | meses | destino com mérito |

**Recomendação (refinamento da sua proposta):** o tripé
**impressora (composição, vivo) + espelhamento MÍNIMO (só marcos de estado, vivo) + exportação do portal (reconciliação D+1)**.
O terceiro pilar é o que torna a ponte **segura e não-gambiarra**: se o espelho falhar numa noite, a memória se corrige sozinha no dia seguinte com dado oficial. Cada perna entra por um adapter no seam existente; a API futura substitui **apenas** a perna do espelho (e depois a da impressora), com o motor intacto — já provado com `makeFonteItensFromCsv`.

## 11. Perguntas obrigatórias — respostas

1. **Melhoram o quê?** Validação do motor A em 9 meses; pesos reais na síntese; história do motoboy; camada de desfecho; séries para aprendizado estrutural; financeiro futuro.
2. **O que falta p/ item real?** Composição geral por pedido (só 464 cancelados, sem qtd/obs). Impressora ou API.
3. **Impressora como fonte?** Driver de impressão virtual (tee) no PC do caixa → parser da comanda → `pedido_id, item, qtd, obs, horário` → `makeFonteItensFromRows`. Zero mudança de regra.
4. **Espelhamento como estado?** Leitura mínima do Gestor (marcos: recebido/pronto/despachado) → adapter `ifood-espelho` com `confianca:"media"` no núcleo → reconciliado D+1 pelo export oficial.
5. **Riscos?** Espelho frágil (UI/ToS/máquina); relógio local; ID curto ambíguo (1,4% no dia); viés dos cancelados; dupla contagem sem dedup por ID completo.
6. **Alternativa melhor sem API?** Não à impressora para composição — é o único lugar onde os itens **já são emitidos como subproduto do trabalho** (a tese do produto). O refinamento é o tripé com reconciliação D+1.
7. **Menor teste real?** **Uma noite**: capturar as comandas (spool ou até foto/planilha) → CSV ponte → replay no dia seguinte com composição real + estados do export D+1. Nem precisa do espelho para o 1º teste.
8. **Evolução p/ API?** API substitui perna a perna (estado primeiro, itens depois) atrás dos mesmos adapters. O cérebro não sabe de onde vem o dado — por construção.
