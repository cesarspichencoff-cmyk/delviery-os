# Checklist — Fonte Contínua Ideal do iFood

> O que a fonte contínua precisa ter para o DeliveryOS considerar "pronta" (não "utilizável" — os
> exports pontuais já provaram que dão para usar em modo ponte/replay; "pronta" aqui significa apta a
> substituir a síntese como integração oficial, respeitando
> `docs/Decisao_Arquitetural_Composicao_Real.md`). Classificação em 4 níveis; critério de cada nível
> ao final.

## Campos de pedido/composição

| Campo | Classificação | Por quê |
|---|---|---|
| Order ID completo (uuid) | **Obrigatório** | única chave que já provou join confiável (100% nos 12 replays); sem ele, nada mais neste checklist funciona |
| Data/hora do pedido | **Obrigatório** | base de todo o eixo de tempo; sem ela não há minuto-do-dia |
| Status (concluído/cancelado/recusado) | **Obrigatório** | distingue pedido vivo de recusado (que nunca entra em produção) |
| Itens do pedido | **Obrigatório** | é a própria composição — sem isso, não há Motor B real |
| Quantidade por item | **Obrigatório** | sem ela, "2ª sacola"/"pedido grande" não são calculáveis |
| Observações do cliente | **Muito importante** | destravou o sinal de alergia/conferência dirigida nesta fase; hoje só 1 dos formatos de export tem |
| Valor total do pedido | **Muito importante** | usado em validação cruzada (GMV bate com o próprio KPI do arquivo) e em priorização por risco financeiro |
| Motivo do cancelamento/recusa | **Muito importante** | já usado na camada de desfecho (`ifoodRelatorio.ts`); explica o "porquê", não só o "que houve" |
| Preço unitário por item | **Útil** | hoje ausente em toda fonte de composição recebida; enriquece custo/margem por pedido, não bloqueia os sinais operacionais atuais |
| ID curto do iFood (junto do uuid) | **Útil** | hoje só existe nos exports de timing; tê-lo também na composição eliminaria o "join em dois saltos" usado com cancelamento/negociação |

## Campos de timing/logística

| Campo | Classificação | Por quê |
|---|---|---|
| Aceite | **Muito importante** | hoje sempre aproximado ao horário do pedido (nunca observado à parte); um carimbo real destravaria precisão no início do ciclo |
| Pronto (botão pronto) | **Obrigatório** | já provado, 100% presente nos exports de logística recebidos; sustenta o Motor A inteiro |
| Saiu para entrega | **Obrigatório** | hoje é sempre *derivado* (entrega − a caminho − esperando cliente); um carimbo direto eliminaria uma reconstrução |
| Entregue | **Obrigatório** | idem pronto — já provado, essencial |
| Tempo esperando na loja (motoboy) | **Muito importante** | a dor nº1 identificada nos 4 anos de WhatsApp (920+ menções); já presente nos exports de logística recebidos |
| Tempo aguardando motoboy (alocação) | **Útil** | complementa o anterior, já presente na logística recebida |
| Negociação/reembolso vinculado ao pedido | **Útil** | já existe como export separado (join por ID curto); vinculação direta por uuid eliminaria a ambiguidade residual (~1,4% medida) |

## Campos de metadado da exportação

| Campo | Classificação | Por quê |
|---|---:|---|
| Identificação da loja (FRN_ID) | **Obrigatório** | já presente em todos os exports; sem ele não há como confirmar que o dado é desta unidade |
| Janela exata coberta pelo relatório | **Obrigatório** | achado crítico desta fase: um export dizia "01/07" mas cobria 30/06 21h→01/07 21h — sem essa confirmação, qualquer replay corre risco de erro silencioso de data |
| Formato estável entre exports | **Muito importante** | já tivemos 2 formatos incompatíveis (order-cards vs `ALL_ROWS`) para o mesmo tipo de relatório; instabilidade de formato quebra parser |
| Exportação automática (diária/semanal) | **Obrigatório** | é o próprio pedido desta fase — sem isso, "fonte contínua" não existe, só exports pontuais |
| Alternativa estruturada (CSV/XLSX/API) em vez de HTML | **Muito importante** | HTML já provou funcionar via parser, mas é o formato mais frágil a mudança de layout entre os 4 recebidos até hoje |

## Critério de cada nível

- **Obrigatório** — sem este campo, a fonte não pode substituir a síntese em nenhuma circunstância;
  o replay/integração não deve prosseguir.
- **Muito importante** — sua ausência não impede o uso, mas degrada um sinal já provado valioso
  (ex.: sem observação, o sinal de alergia/conferência dirigida simplesmente não existe).
- **Útil** — enriquece camadas futuras (custo, negociação, join mais direto) sem bloquear nada do que
  já está provado funcionando.
- **Opcional** — nenhum campo deste checklist caiu nesta categoria; todos os levantados já provaram
  valor mensurado em pelo menos uma das 12 janelas ou nos documentos de auditoria anteriores.

## Como usar este checklist

Quando qualquer export novo chegar (ou a fonte contínua for negociada), rodar esta lista campo a campo
contra o que foi recebido, registrar no `docs/Inventario_Dados_Primarios.md` quais níveis foram
atendidos, e só então decidir se abre uma nova rodada de replay (nunca integração direta — o fluxo
`bruto → inventário → parser → validação → relatório → aprovação humana → integração` continua valendo
integralmente).
