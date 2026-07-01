# Auto Teste Operacional — 30 dias

> Backtest do motor do DeliveryOS sobre **30 dias reais** (27/05/2026→25/06/2026), 8305 pedidos.
> Mesmo motor congelado do protótipo. **Timing real**; **composição sintética** (o relatório iFood não traz itens — sinais por praça são ilustrativos; precisão/cobertura usam desfecho real: cancelamento, atraso>15min, problema pós-entrega).

## Nota final do motor operacional: **7.9 / 10**
*(0,40×precisão 53% + 0,40×cobertura 95% + 0,20×calma-adequada 1)*

---

## 1. Alertas gerados
- **386** focos no mês (~12.9/dia) · 147 de pedido · 239 de praça/saída.
- Distribuição do tempo: 🟢 calmo **60%** · 🌫️ ambiente **30%** · 🔶 foco **11%**.

## 2. Alertas úteis
- Dos 147 focos de pedido, **78 (53%)** caíram em pedidos que realmente deram errado (cancelado/atraso/problema).

## 3. Alertas exagerados
- **69 (47%)** focos de pedido em pedidos que ao final ficaram OK. *(ressalva: não dá pra saber se o alerta evitou o problema — é teto de exagero, não certeza.)*

## 4. Pedidos em risco
- **1960** pedidos cruzaram risco em algum momento (produção>45min, pronto>30min sem sair, atraso, cancelamento ou problema) — 24% do total.
- Desfecho ruim de fato: **1013** pedidos (12%).

## 5. Praças que mais travaram *(ilustrativo — composição sintética)*
- quentes: **6807** min de sobrecarga no mês
- combinados: **6078** min de sobrecarga no mês
- enrolados: **3764** min de sobrecarga no mês
- sushi: **2808** min de sobrecarga no mês

## 6. Dias com mais gargalo
- 07/06/2026: gargalo **60%** do serviço · 14 focos · 431 pedidos · 33 ruins
- 31/05/2026: gargalo **55%** do serviço · 19 focos · 336 pedidos · 39 ruins
- 21/06/2026: gargalo **53%** do serviço · 17 focos · 387 pedidos · 13 ruins
- 10/06/2026: gargalo **53%** do serviço · 19 focos · 244 pedidos · 44 ruins
- 14/06/2026: gargalo **51%** do serviço · 16 focos · 379 pedidos · 32 ruins

## 7. Horários mais críticos
- **21h** — 58 focos no mês
- **20h** — 56 focos no mês
- **19h** — 53 focos no mês
- **12h** — 48 focos no mês
- **18h** — 44 focos no mês
- **22h** — 38 focos no mês

## 8. Onde o sistema funcionou melhor
- Dia mais limpo com alertas certeiros: **15/06/2026** (gargalo 23%, 12 focos).
- O motor ficou **calado 89%** do mês (calmo+ambiente) — não virou papel de parede; o foco apareceu em só 11% do tempo.

## 9. Onde o sistema falhou
- **51** pedidos ruins (5% dos ruins) aconteceram com o sistema em **calmo** o tempo todo — não houve nem ambiente. São os pontos cegos.
- Maior sequência contínua em foco: **17 min** (risco de virar nag se subir muito).
- Exagero de 47% indica que parte dos focos de pedido alarma stalls que se resolvem sozinhos.

## 10. Regras que precisam de ajuste
- **Rever baseline da praça quentes**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Rever baseline da praça combinados**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Rever baseline da praça enrolados**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Rever baseline da praça sushi**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Reforçar demote→ambiente**: sequência de foco chegou a 17 min.
- Validar tudo de novo após ligar a **composição real** (KDS/impressora/iFood) — os sinais de praça hoje são sintéticos.

---
*Backtest determinístico. Trocar a fonte de itens (sintética → real) não muda nenhuma regra; basta re-rodar este auto teste para revalidar.*