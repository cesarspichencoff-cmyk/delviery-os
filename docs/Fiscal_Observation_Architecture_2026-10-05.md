# DeliveryOS — arquitetura fiscal observacional

Data: 2026-10-05

## Decisão arquitetural atual

O DeliveryOS **não emite NFC-e**, não chama SEFAZ diretamente e não replica o emissor fiscal do Retail/Teknisa.

A responsabilidade fiscal permanece nativa no Retail/Teknisa. O DeliveryOS pode, no máximo, observar e reconciliar estados fiscais já produzidos pelo sistema nativo.

## Evidência local real

Pedido iFood 8332 / comanda 0000348932 / venda restaurante 0000349363:
- abertura: 2026-10-05 14:39:57 -03:00;
- venda fiscal: NRSEQVENDA 0000157024;
- NFC-e: 000156369;
- emissão: 2026-10-05 14:43:39 -03:00;
- status NFC-e: A;
- QR persistido: sim;
- caixa: 001.

Essa observação foi somente leitura. O DeliveryOS não disparou emissão, impressão fiscal ou chamada SEFAZ.

## Pesquisa oficial

A documentação Teknisa “NFC-e Automático” descreve emissão automática via API do Interface, condicionada a caixa específico/aberto e aos pagamentos suportados pelo fluxo EatTake. Ela não estabelece, por si só, um contrato público para um sistema externo disparar NFC-e no iFood/Odhen atual.

Fontes:
- https://ajuda.teknisa.com/eattake/eattake-pedidos/nfc-e-automatico
- https://ajuda.teknisa.com/eattake/integracao-pdv-teknisa/integracao-order-api
- https://portal.fazenda.sp.gov.br/servicos/nfce/

A SEFAZ/SP informa que, em 05/10/2026, produção passou a adotar protocolo de autorização com 17 posições conforme NT2025.002.

## Regra

1. Produção de cozinha e fiscal são estados independentes.
2. Estado fiscal ambíguo nunca autoriza retry automático.
3. Antes de qualquer retry futuro, reconciliar a venda nativa.
4. Reimpressão DANFE permanece caminho separado de emissão.
5. Não usar F7/automação de teclado, endpoint interno não documentado ou emissor SEFAZ paralelo.
6. Até contrato oficial específico para o fluxo atual, a postura é **OBSERVE / RECONCILE / DO NOT EMIT**.
