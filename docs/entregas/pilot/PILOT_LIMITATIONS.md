# Limitações conhecidas — piloto ENTREGAS

## Persistência

- **Single-instance** apenas. Dois processos no mesmo arquivo = corrupção/risco.  
- FileUnitOfWork **não** é banco de produção (sem HA, sem multi-writer).  
- Backup local versionado mitiga, não elimina, perda de disco.

## Offline

- **Não declarar offline completo.**  
- Demo: connection simulada na facade em memória.  
- Piloto: depende de Wi-Fi + servidor na unidade.  
- Fila local robusta pós-fechar browser **não** está no mesmo nível de um app nativo.

## Rede

- HTTP sem TLS no piloto local.  
- Tokens em config em texto (controle mínimo, não IdP corporativo).

## GPS / mapa

- Sem GPS de produção.  
- MapLibre experimental **fora** do fluxo obrigatório.

## Integrações

- Sem Copiloto live.  
- Sem shell.  
- Sem multi-unidade.  
- Sem atribuição/roteamento automático.

## UI

- Login por token via console do browser (bootstrap); formulário de login dedicado ainda simples.  
- Registro de pedidos prontos via API; evolução de botão de console pode seguir sem redesign amplo.

## Cartografia

Experimental — não bloqueia nem sustenta o piloto operacional.
