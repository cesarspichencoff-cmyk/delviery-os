# Gestor no caixa — descoberta autorizada

César autorizou analisar o PC ligado, com Gestor aberto, para avaliar alimentação do Delivery OS. Isso autoriza inspeção; não autoriza alterar pedidos, pausar loja ou emitir comandos de integração.

## Resultado desta tentativa

- Acesso remoto anterior permanece limitado pela cota mensal; não foi repetido após a instrução de não retentar.
- Alternativa Opera Browser Connector: listagem de abas retornou UNAVAILABLE / Browser not connected. Nenhum conteúdo de aba foi acessado.
- Não houve inspeção do PC, identificação da versão do Gestor, leitura de pedidos ou comprovação da loja ativa.

## Preparação entregue

`tools/windows-local-lab/diagnostico-gestor.ps1`: inventário limitado a nomes/versões de aplicativos instalados e processos relacionados a iFood/Gestor. Não lê título de janela, argumentos, cookies, tokens, arquivos de pedidos ou banco. Não acessa rede. A única escrita é um JSON novo no Desktop; recusa sobrescrever. Não requer administrador. Preparado para Windows PowerShell 5.1+, ainda não executado nem validado no Windows.

Executar no computador do caixa pelo PowerShell com `powershell -NoProfile -File .\diagnostico-gestor.ps1` a partir da pasta do arquivo. Se a política local bloquear, não alterar a política: registrar a mensagem. O JSON apenas identifica caminhos de investigação, não alimenta pedidos.

## Próxima evidência necessária

Identificar se o Gestor é aplicativo Windows ou navegador; confirmar loja ativa Itaim (sem inferir pelo host Mooca); avaliar estrutura visível da tela de pedidos e disponibilidade de exportação. Um recorte da tela deve ocultar clientes, telefones e endereços. Número curto não basta para unir pedidos entre fontes: exigir identificador estável e vínculo comprovado à unidade.

Há parser de relatório no projeto. Observador DOM existente é exclusivamente fixture, com seletores inventados, sem autoridade operacional. Não converter seu output em dado real.

A documentação oficial iFood oferece eventos via polling/webhook, mas isso não prova credenciais, autorização de aplicativo ou homologação disponíveis nesta conta. Nenhum endpoint foi consultado nem houve captura de token. Fonte consultada: https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/intro

Só após observar a fonte real: produzir amostra minimizada, testar duplicatas, atualização, cancelamento, perda de tela/rede e freshness; integrar leitura inicialmente em sombra. Não inventar seletores nem sinalizar pedido pronto sem fato correspondente.
