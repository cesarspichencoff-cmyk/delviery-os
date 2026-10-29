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

## Atualização — acesso real recuperado e ensaio local

Após César confirmar liberação de cota, o conector identificou CAIXA_MOOCA online. A restrição de acesso anterior foi superada; não repetir a conclusão antiga de indisponibilidade.

Observação real:
- Gestor de Pedidos 8.10.4.892, aplicativo Windows baseado em Electron/Chromium; título iFood - Gestor de Pedidos.
- Impressora GP iFood 1.2.0.405 em execução. Nenhuma interação com impressão.
- Janela inicialmente minimizada; restaurada apenas para inspeção e devolvida ao estado minimizado ao encerrar.
- Acessibilidade Windows expôs somente a janela e um painel D3D, inclusive após restaurar. Não foram obtidos elementos estruturados de pedidos por essa via.
- Captura restrita ao cabeçalho mostrou Tatá Sushi / Loja aberta e aviso de Turbo temporariamente desabilitado por acúmulo de entregadores. É observação pontual; não prova estado atual permanente nem identifica unidade.
- Diretórios de perfil relacionados ao Gestor apresentam logs. Só metadados dos diretórios diretos foram enumerados; nenhum log, cookie, token, cache de sessão ou banco foi lido.

### OCR local efetivamente executado

Windows OCR pt-BR disponível. `gestor-header-shadow-probe.ps1` executado pontualmente em 29/10/2026 às 19h34 de São Paulo. Recorte físico de 1920x240 do cabeçalho; texto bruto não exportado e imagens temporárias apagadas. Sem acesso de rede pelo ensaio, sem agendamento ou ingestão operacional.

| Amostra | Tempo observado | Estado reconhecido |
|---|---:|---|
| Cabeçalho real 1 | 209 ms | open |
| Cabeçalho real 2 | 70 ms | open |
| Imagem branca de controle | 27 ms | unknown |

Primeira tentativa recusou geometria incompatível: GetWindowRect virtualizava a escala para 1280x672, enquanto a janela física era 1920x1008. Correção limita DPI awareness ao processo de diagnóstico e conserva a recusa de geometria diferente. Isso não muda escala/configuração do caixa.

O matcher não reconheceu o aviso Turbo nessas duas amostras; isso NÃO prova que Turbo voltou. Saída consolidada usa `unknown` quando não reconhece a frase. Tempos são de três amostras, não benchmark de produção.

Veredito: captura visual e OCR local do cabeçalho comprovados; extração de pedidos/itens, mudanças de estado, identificação da loja, vínculo aos pedidos Teknisa e cobertura com janela minimizada continuam não comprovados. Não há coletor instalado nem dados de pedidos alimentando o sistema.

Próximo passo: confirmar que a conta selecionada é Itaim e qualificar recortes/identificadores visíveis da tela de pedidos, mantendo texto pessoal fora do diagnóstico. Provar deduplicação, revisões e indisponibilidade antes de aceitar qualquer evento operacional.
