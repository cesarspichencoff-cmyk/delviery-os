# WhatsApp Policy Contract V1

Somente o canal oficial é conceitualmente permitido. Bibliotecas não oficiais,
sessões de navegador, scraping, QR code automatizado, cookies, tokens
capturados ou engenharia reversa são proibidos.

O gate recebe: canal, confirmação de provedor oficial, permissão de envio,
origem da conversa, consentimento, classes bloqueadas e desconhecidos. Ele
também depende do Cost Policy Gate.

No modo `ZERO_EXTERNAL_COST`:

- mensagem iniciada pela empresa é bloqueada;
- marketing, template pago ou fluxo potencialmente tarifado é apenas
  sugestão, nunca execução;
- custo desconhecido bloqueia;
- falta de consentimento bloqueia;
- qualquer provedor não oficial bloqueia;
- esta mudança não envia mensagem alguma.

A integração oficial e o WhatsApp Policy Gate operacional pertencem à Mudança
009.
