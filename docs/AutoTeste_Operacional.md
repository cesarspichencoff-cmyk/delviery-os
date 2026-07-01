# Auto Teste Operacional — 30 dias

> Backtest do motor do DeliveryOS sobre **30 dias reais** (27/05/2026→25/06/2026), 8305 pedidos.
> Mesmo motor congelado do protótipo. **Timing real**; **composição sintética** (o relatório iFood não traz itens — sinais por praça são ilustrativos; precisão/cobertura usam desfecho real: cancelamento, atraso>15min, problema pós-entrega).

## Nota final do motor operacional: **8.1 / 10**
*(0,40×precisão 57% + 0,40×cobertura 96% + 0,20×calma-adequada 1)*

---

## 1. Alertas gerados
- **406** focos no mês (~13.5/dia) · 115 de pedido · 291 de praça/saída.
- Distribuição do tempo: 🟢 calmo **53%** · 🌫️ ambiente **35%** · 🔶 foco **12%**.

## 2. Alertas úteis
- Dos 115 focos de pedido, **65 (57%)** caíram em pedidos que realmente deram errado (cancelado/atraso/problema).

## 3. Alertas exagerados
- **50 (43%)** focos de pedido em pedidos que ao final ficaram OK. *(ressalva: não dá pra saber se o alerta evitou o problema — é teto de exagero, não certeza.)*

## 4. Pedidos em risco
- **1960** pedidos cruzaram risco em algum momento (produção>45min, pronto>30min sem sair, atraso, cancelamento ou problema) — 24% do total.
- Desfecho ruim de fato: **1013** pedidos (12%).

## 5. Praças que mais travaram *(ilustrativo — composição sintética)*
- quentes: **9489** min de sobrecarga no mês
- sushi: **7497** min de sobrecarga no mês
- enrolados: **7132** min de sobrecarga no mês
- combinados: **0** min de sobrecarga no mês

## 6. Dias com mais gargalo
- 07/06/2026: gargalo **68%** do serviço · 15 focos · 431 pedidos · 33 ruins
- 21/06/2026: gargalo **63%** do serviço · 19 focos · 387 pedidos · 13 ruins
- 31/05/2026: gargalo **63%** do serviço · 20 focos · 336 pedidos · 39 ruins
- 14/06/2026: gargalo **61%** do serviço · 14 focos · 379 pedidos · 32 ruins
- 20/06/2026: gargalo **58%** do serviço · 19 focos · 347 pedidos · 133 ruins

## 7. Horários mais críticos
- **19h** — 59 focos no mês
- **21h** — 57 focos no mês
- **20h** — 54 focos no mês
- **12h** — 53 focos no mês
- **18h** — 44 focos no mês
- **22h** — 35 focos no mês

## 8. Onde o sistema funcionou melhor
- Dia mais limpo com alertas certeiros: **19/06/2026** (gargalo 33%, 9 focos).
- O motor ficou **calado 88%** do mês (calmo+ambiente) — não virou papel de parede; o foco apareceu em só 12% do tempo.

## 9. Onde o sistema falhou
- **41** pedidos ruins (4% dos ruins) aconteceram com o sistema em **calmo** o tempo todo — não houve nem ambiente. São os pontos cegos.
- Maior sequência contínua em foco: **16 min** (risco de virar nag se subir muito).
- Exagero de 43% indica que parte dos focos de pedido alarma stalls que se resolvem sozinhos.

## 10. Regras que precisam de ajuste
- **Rever baseline da praça quentes**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Rever baseline da praça sushi**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Rever baseline da praça enrolados**: fica sobrecarregada tempo demais (baseline provavelmente subestimado, ou é gargalo estrutural real).
- **Reforçar demote→ambiente**: sequência de foco chegou a 16 min.
- Validar tudo de novo após ligar a **composição real** (KDS/impressora/iFood) — os sinais de praça hoje são sintéticos.

---
*Backtest determinístico. Trocar a fonte de itens (sintética → real) não muda nenhuma regra; basta re-rodar este auto teste para revalidar.*