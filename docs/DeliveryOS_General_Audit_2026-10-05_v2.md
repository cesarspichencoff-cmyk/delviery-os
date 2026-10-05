# DeliveryOS — Auditoria Geral Adversarial — 2026-10-05 v2

## Escopo

Auditoria de ponta a ponta do caminho de delivery sem executar impressão física, DANFE, escrita no Teknisa, ação Odhen ou chamada SEFAZ.

Fluxo auditado:

`iFood → Teknisa → leitura restrita → snapshot estável → dedupe/checkpoint → canonicalização → roteamento → turno → sequência TATÁ → embalagem/kits/sacola → ticket semântico → calibração → fiscal nativo/reconciliação`

## Estado consolidado

### PROVEN

- Leitura real DLV_IFO sob `NT SERVICE\TataComandaReader`.
- Nenhuma permissão de escrita no fluxo do reader.
- Snapshot estável e replay dedupe comprovados.
- Códigos brutos `CDARVPROD` são canonicalizados antes de consultar a matriz.
- Auditoria recente de 500 pedidos DLV: 120 códigos distintos e zero código de produção relevante sem rota, após aplicar `NO_OWN_PRODUCTION_TICKET`.
- `TAXA DE ENTREGA` foi adicionada à classe de não-produção por evidência real.
- Sequência TATÁ 001–999 diária por loja, estado local atômico, `001` pronto e zero bindings produtivos.
- Estado de turno explícito `LUNCH/DINNER`, persistido e sem inferência por relógio.
- Watcher contínuo candidato: checkpoint persistente, bootstrap seguro e dedupe após restart comprovados em execução limitada.
- Embalagem afetada pela revisão: 91/91.
- Kits v2: PASS.
- Pedido real de referência: 3×750 Kids + 2×650 seladas + 1×240; 3 Kit Kids + 1 Kit Quente; 1 Sacola G; quente/frio segregados internamente.
- Temperatura não determina quantidade de sacolas externas; encaixe/medição é a autoridade.
- As seis filas/impressoras possuem topologia Windows/TCP configurada.
- No turno atual LUNCH, 00002 COZINHA e 00009 BALCAOSUSHI1 responderam ao handshake TCP 9100 sem envio de bytes.
- Caminho nativo `Cupom Fiscal → OrderDeliveryController.geraNotaFiscal → DeliveryService.generatePayment` observado em source instalado.
- Reimpressão fiscal é caminho distinto e usa nota já existente.
- Em 2026-10-05, 61/61 NFC-e reais observadas na filial 0001 foram autorizadas com protocolo de 17 posições.
- 61/61 dessas autorizações tinham dados de QR persistidos.
- Banco suporta `NRPROTOCOLONFCE varchar(50)`.
- Configuração atual: XML 4.00, `IDTRANSAUTONFCE=S`, QR versão 2.
- QR v3 existe na NT 2025.001, porém a adoção exclusiva não foi tratada como requisito atual sem fonte que imponha data; o caminho QR v2 está empiricamente autorizando NFC-e hoje.
- Planner fiscal legado “produção → pedir NFC-e” foi bloqueado no código.
- Reconciliador fiscal observation-first foi implementado e passou compilação/teste isolado.
- Nenhum emissor SEFAZ paralelo foi escolhido ou implementado.

## UNKNOWN / NÃO PROVEN

- Impressão física de ticket DeliveryOS.
- Largura real/qualidade/corte/feed/caracteres das impressoras.
- 00003 DELIVERY SUSHI 1 e 00004 DELIVERY SUSHI 2 não responderam TCP 9100 no momento do teste; jantar/global não pode ser liberado com essa observação.
- Binding exato do teclado F7 não foi localizado nos metadados atuais. A ação `cupomFiscal` chama `geraNotaFiscal`, mas o JSON da tela não declara F7.
- Contrato oficialmente suportado pela Teknisa para disparo fiscal programático sem UI/teclado.
- Se todos os DLV_IFO atuais exigem ação humana `Cupom Fiscal` ou se outra rotina nativa também pode iniciar o mesmo fluxo.
- Build completo do DeliveryOS após as últimas mudanças ainda não foi executado no repositório inteiro; o reconciliador fiscal passou teste isolado.
- Suíte integral da TATÁ Academia não foi rerodada; somente os gates diretamente afetados de embalagem e kits foram executados e passaram.

## Circuit breakers ativos

1. UNKNOWN de roteamento/embalagem não bloqueia pedido nativo; bloqueia apenas o efeito automático relacionado.
2. Sem inferência de turno por relógio.
3. Sem retry cego de impressão ambígua.
4. Sem retry cego de efeito fiscal ambíguo.
5. Autorização NFC-e não significa DANFE fisicamente impresso.
6. Produção concluída não dispara NFC-e por política DeliveryOS.
7. Reimpressão nunca é tratada como emissão.
8. Sem emulação de F7.
9. Sem emissor SEFAZ próprio.
10. Mudança de serviço contínuo permanece preparada, mas não ativada.

## Preparado, não ativado

- `tools/set_production_service_state_v1.ps1`
- `tools/tata_reader_continuous_service_entrypoint_v1.ps1`
- `data/tata_reader_continuous_cutover_candidate_v1.json`
- ticket físico de calibração claramente marcado como TESTE.

## Próximos gates

### Pode continuar sem papel

- Build/typecheck completo do DeliveryOS em ambiente permitido.
- Validar o reconciliador fiscal dentro do build completo.
- Revisar contrato de integração fiscal suportado pela Teknisa, sem UI emulation.
- Refinar pacote transacional de cutover/rollback do watcher contínuo.
- Revalidar disponibilidade de 00003/00004 em janela de jantar antes de liberar jantar.

### Exige presença humana física

- Uma impressão de calibração controlada, começando por 00002 COZINHA.
- Confirmar impressora física, largura, acentos, legibilidade, avanço e corte.

### Continua proibido até gate separado

- Emissão/reemissão NFC-e pelo DeliveryOS.
- F7 automatizado.
- Cutover global de impressão.
- Cutover de jantar enquanto 00003/00004 não forem revalidadas.

## Fronteira de conclusão

O núcleo read-only + decisão operacional está forte e amplamente provado. Não é 10/10 mundial ainda porque impressão física, jantar e contrato do trigger fiscal programático continuam abertos.
