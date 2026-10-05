# Teknisa — contrato fiscal suportado para Delivery/iFood

Data: 2026-10-05

Objetivo: confirmar o caminho oficialmente suportado para automatizar NFC-e no fluxo atual de delivery/iFood sem emulação de teclado e sem emissor SEFAZ paralelo.

## Contexto já comprovado no ambiente

- Filial 0001.
- Odhen/Retail atual já autoriza NFC-e em produção.
- Em 2026-10-05, 61/61 NFC-e observadas tinham protocolo de 17 posições.
- 61/61 tinham QR persistido.
- Configuração atual: XML 4.00, transmissão automática ativa, QR versão 2.
- A tela Delivery possui ação `Cupom Fiscal` que chama `OrderDeliveryController.geraNotaFiscal → DeliveryService.generatePayment`.
- Reimpressão fiscal é um caminho separado.
- O DeliveryOS não pretende emitir NFC-e diretamente nem chamar SEFAZ.

## Perguntas que precisam de resposta oficial

1. Para pedidos iFood integrados ao Odhen/Retail, existe um contrato/API oficial equivalente à ação `Cupom Fiscal` da tela Delivery?
2. A funcionalidade documentada de “NFC-e Automático via Interface API” pode ser usada nesse mesmo fluxo iFood ou é exclusiva dos pedidos EatTake/pagos pela plataforma?
3. Se aplicável ao iFood, qual é o endpoint/contrato suportado e quais são as pré-condições obrigatórias?
4. Qual campo/estado oficial deve ser consultado antes de qualquer retry para garantir que uma NFC-e já autorizada não seja retransmitida?
5. Em contingência, qual é o fluxo suportado para reconciliação posterior sem duplicar emissão?
6. A reimpressão de DANFE deve sempre usar o contrato específico de reimpressão, separado da emissão?
7. Existe algum evento/webhook suportado para indicar que a NFC-e foi autorizada ou deve ser feito polling de estado?
8. O parâmetro `CDVERSAOQRCNFCE=2` continua suportado em SP após 2026-10-05 enquanto a adoção exclusiva do QR Code v3 não estiver vigente?
9. Há versão mínima do Odhen/Retail/Interface exigida para protocolo de 17 posições em SP?
10. Existe recomendação oficial para integração externa que apenas observe o estado fiscal e deixe emissão/reimpressão sob responsabilidade nativa da Teknisa?

## Restrições do projeto

- Não usar automação de teclado/F7.
- Não chamar endpoint interno não documentado.
- Não criar emissor SEFAZ paralelo.
- Não repetir emissão diante de resultado ambíguo.
- Produção de cozinha e emissão fiscal são estados independentes.
