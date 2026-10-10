# V5.5 — Cobertura das fontes do cardápio histórico

Estado: ANÁLISE OFFLINE. Não autoriza impressão e não modifica o renderer em uso.

Referência: 576 dots nominais, Font A 12 dots/coluna, Font B 9 dots/coluna.
Amostra: 199 produtos do catálogo HISTÓRICO de julho de 2026; não prova menu atual.

| Qtde vendida | A largura+altura 2x (candidata) | Com ≥48 dots de reserva | Com <48 dots (rever) | A altura 2x (atual) | B altura 2x | Bloqueadas | Próximo à borda |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 115 | 98 | 17 | 78 | 6 | 0 | 22 |
| 12 | 107 | 92 | 15 | 86 | 6 | 0 | 22 |

## Ponto técnico
A fonte A ampliada horizontalmente só cabe em linha única para títulos de até **24 caracteres incluindo quantidade e espaços**. Usar 2x indiscriminadamente reduziria a cobertura dos nomes longos.
Uma reserva NOMINAL de 48 dots à direita exige no máximo **22 caracteres** na fonte A com largura dupla. Margens e largura reais da TM-T20X ainda não foram medidas no papel.
Ainda é apenas HIPÓTESE de ganho visual, pois a segunda folha de comparação V5.4 não está fisicamente provada. O baseline e os alertas de fonte B permanecem.

## Produtos cujo fallback compacto B exige leitura na CAIXA
- Combinado Tradicional Sashimi + Sushi 1 pessoa
- Combinado Tradicional Sashimi + Sushi 2 pessoas
- Sake para presentear - Hakutsuru Daiginjo Yamadaho
- Tatá chocolate com sorvete de caramelo salgado
- Vinho Argentino Norton Sexy Fish Cabernet Franc Seco 750ml
- Vinho Rose 2020 Grenache Lulu Le Francais 750ml

## Regras de qualidade
Nenhum nome pode ser cortado ou alterado automaticamente. Se o nome ultrapassar 64 caracteres, a via deve bloquear até validação humana de alias ou outra solução aprovada.
A fonte A ampliada em largura deve ser submetida ao teste B da V5.4 SOMENTE na CAIXA quando permitido. Não converter o estudo em regra produtiva, não mudar densidade nem driver.
Nenhuma inferência de qualidade física da unidade ou de outros setores foi feita.
