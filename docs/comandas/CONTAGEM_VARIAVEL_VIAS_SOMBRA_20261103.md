# TATÁ Comandas — identificação fiel das vias virtuais (03/11/2026)

**Contexto:** PR #135, candidata em Draft. O primeiro replay real já validado no CAIXA_MOOCA gerou **2 vistas virtuais aplicáveis**, produção `DELIVERY SUSHI 1` e `CONFERENCIA`. A cadeia anterior reportava L4 `THREE_VIEWS_VIRTUAL`, mesmo com `views.length = 2`. A nomenclatura era materialmente enganosa. **Não faltava uma via de Cozinha:** o único produto do pedido não tinha produção naquela praça. O status não mede autorização para imprimir.

## Contrato corrigido

- L4 pronto: `VIRTUAL_VIEWS_READY` — indica vias virtuais semanticamente prontas, **sem prometer uma quantidade fixa**.
- A camada L4 passa a declarar `view_count`, `production_view_count`, `conference_view_count` e `stations` coerentes com a lista efetiva. O runner isolado devolve os mesmos campos na saída sanitizada.
- A condição permanece restritiva e se fortalece: pelo menos **uma** via de produção, **exatamente uma** via Conferência, estações distintas e todas as vistas semanticamente prontas. Se falhar, L4 permanece `HOLD`; nenhuma contagem substitui prova de produto/embalagem/observações.
- Pedidos com duas praças de produção comprovadas e Conferência terão **3 vistas**. Pedidos com uma praça de produção comprovada e Conferência terão **2**. Não se criam vias vazias nem se inventa Cozinha para atingir uma quantidade.
- L5 e a emissão física permanecem independentes: sem atestação real da sequência TATÁ, nenhuma via produz bytes físicos ou é enviada à impressora. A exclusão da observação financeira continua limitada ao par/revisão exatos aprovados por César, somente em sombra.

## Compatibilidade e prova

Pesquisa estática no checkout da PR #135 localizou todas as referências ao literal antigo somente no próprio gerador, nos dois arquivos de teste offline e em documentação de evidência histórica. Os testes e o runner foram atualizados; a documentação de 02/11 permanece intocada por representar o resultado daquela candidata e daquele pedido de 3 vias.

Testes planejados no novo HEAD: cadeia nativa **30/30** incluindo uma revisão com um produto Sushi 1 e duas vias, a revisão arquivada 9627 com três, e os bloqueios de conteúdo/horário/numeração; bundle **10/10** incluindo a decisão humana exata sobre nota financeira com **duas** vias; manifesto 34 arquivos; layout Figma/ESC-POS. O resultado hospedado Linux/Windows e o replay real no CAIXA_MOOCA serão documentados separadamente e **não** inferidos desses testes locais.

**Não se autoriza** merge, instalação de serviço, sequência real, acesso SQL, fiscal, spooler ou impressão.
