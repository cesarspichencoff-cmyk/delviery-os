# Decisão Arquitetural — Composição Real é Pré-Condição

> Documento de decisão, não de exploração. Nasce de `docs/Relatorio_Evidencia_Composicao_Real_12_Janelas.md`.
> A partir de hoje, esta decisão governa qualquer trabalho futuro no Motor B, na Camada de Decisão,
> em calibração e em roadmap. Mudá-la exige revisitar a evidência que a sustenta, não apenas preferência.

## 1. Decisão

**O DeliveryOS não deve tratar composição sintética como base confiável para decisão operacional.**

A composição sintética (`MOTOR.makeFonteSintetica`) pode continuar existindo, mas só como:

- fallback, quando a fonte real falhar ou estiver indisponível;
- demo/homologação de interface;
- teste de carga do motor;
- modo degradado, explicitamente rotulado como tal;
- comparação histórica (a própria evidência desta fase depende de rodar as duas lado a lado).

Ela **não pode** ser base de calibração de baseline, de tuning, de decisão operacional real, nem de
validação final de produto. Qualquer resultado gerado a partir dela deve carregar rótulo de origem
sintética em qualquer lugar onde apareça — documento, tela, ou log.

## 2. Evidência

12 janelas reais, 3.526 pedidos, 10.565 itens (+ 790 da janela de 01/07), cobertura média 99,7%,
2 fontes de timing independentes, 2 formatos de export diferentes:

| Métrica | Real | Sintético | Sobreposição de intervalo? |
|---|---:|---:|---|
| Praça única | 17% (11-30%) | 64% (58-69%) | **nenhuma** |
| 2ª sacola/kit | 59% (47-74%) | 21% (17-27%) | **nenhuma** |
| Confiança alta nas recomendações | 99,3% (92-100%) | 16,7% (0-50%) | quase nenhuma |
| Tempo em foco | maior | menor | **em 12 de 12 janelas, sem exceção** |

Isso não é ruído de amostragem nem erro numérico tolerável: os intervalos real e sintético **não se
tocam** nas métricas que mais pesam na Camada de Decisão. Uma diferença de médias se discute; uma
ausência total de sobreposição, em 12 amostras independentes, é sinal estrutural — a síntese não está
"quase certa com uma margem de erro", está descrevendo uma operação diferente da real. Por isso a
decisão é arquitetural, não um ajuste fino: **é erro de decisão, não erro de precisão.**

## 3. Impacto operacional (o que a síntese fazia, medido)

- Fazia o sistema imaginar pedidos mais simples do que são: praça única real é metade a um terço da
  sintética.
- Criava **fechamento fantasma** em 10 das 12 janelas — recomendava "fechar pedidos simples" para
  pedidos que, na realidade, tinham combinado + 2ª sacola + kit.
- Reduzia artificialmente o risco de conferência visível (2ª sacola/kit invisível em ~40 pontos
  percentuais).
- Escondia bebida, kit e sobremesa nos pedidos onde mais importam (a fonte de erro mais crônica do
  histórico de WhatsApp da operação).
- Distorcia a pressão por praça — subestimava sistematicamente Enrolados e Enrolados Quentes,
  acertando por acaso só em Duplas (que concentra mais itens do cardápio, não por acerto de composição).
- Mudava **qual ação ganhava o slot único de atenção** — o achado da "competição por atenção": mesmo
  sinais de timing que o motor já enxergava corretamente perdiam prioridade para focos de composição
  fantasma ou, ao contrário, deixavam de competir com focos de composição reais que não existiam na síntese.

## 4. Impacto arquitetural

Qualquer camada nova, a partir de agora, precisa nascer considerando:

- fonte real de item por pedido como insumo de primeira classe, não acessório;
- observações do cliente (destravadas nesta fase pela primeira vez — incluindo alergia);
- quantidade por item, status do pedido, UUID completo;
- join com logística sempre por UUID (nunca ID curto sem evidência de match, como já praticado);
- **confiança rotulada por fonte** — o padrão `fonteReal` da Camada de Decisão deixa de ser
  característica isolada e vira princípio geral: todo componente que produz número para decisão
  precisa saber e declarar se seu insumo é real ou sintético;
- **modo degradado explícito** — se a fonte real falhar, o sistema deve dizer que está em modo
  degradado, não silenciosamente voltar a fingir.

## 5. Impacto no roadmap

Nova ordem de prioridade (substitui qualquer sequência anterior que tratava composição real como
"nice to have"):

1. Fonte contínua de composição real (pedido formal ao iFood já preparado).
2. Fonte contínua de logística/timing (par obrigatório da composição — sem isso, não há como validar).
3. Parser/adaptador estável para a fonte contínua (hoje os parsers são exploratórios, por formato de
   export específico; a fonte contínua exige um adaptador único e resiliente a variação de layout).
4. Validação de cobertura como rito permanente (o portão ≥95% por UUID, já praticado nos replays,
   vira exigência de qualquer integração futura, não só de experimento).
5. **Só depois**: calibração de baseline — e só com dado real, nunca sintético.
6. **Só depois**: tuning.
7. **Só depois**: design operacional final, informado pelos sinais que a composição real revelou
   (conferência dirigida, observação, alergia) — não pelos sinais que a síntese sugeria.

## 6. O que fica proibido

- Calibrar baseline com composição sintética.
- Usar número sintético como verdade operacional em qualquer relatório, tela ou decisão de produto.
- Apresentar métricas geradas por composição sintética como performance real do sistema.
- Tratar "praça única" ou "fechamento" sintéticos como insight operacional — eles são artefato do
  gerador aleatório, não da operação.
- Fazer design de foco/atenção sem considerar como a composição real muda a distribuição de sinais.
- Integrar qualquer fonte nova ao fluxo oficial sem passar pelo portão de cobertura (§5.4).

## 7. Exceções permitidas (sempre rotuladas)

Sintético continua legítimo para: fallback quando a fonte real falhar; demos e testes de layout
visual; testes de carga/performance do motor; a própria comparação real×sintético (o método desta
fase); e ambientes onde nenhum dado real ainda exista (ex.: uma unidade nova, sem histórico). Em todos
os casos, o rótulo de origem sintética precisa estar visível em qualquer lugar onde o número apareça —
nunca implícito.

## 8. Frase final

> A composição real não aumenta apenas a precisão do DeliveryOS.
> Ela altera a ação correta.
> Por isso, deixou de ser melhoria futura e virou condição arquitetural.
