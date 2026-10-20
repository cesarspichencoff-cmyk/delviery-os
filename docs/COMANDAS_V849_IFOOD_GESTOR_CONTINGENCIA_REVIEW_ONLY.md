# Comandas V8.49 — contingência independente Gestor iFood x Teknisa (REVIEW ONLY)

**Data:** 20/10/2026. **Escopo:** proteger pedidos contra falhas de integração/impressão da Teknisa, sem perda silenciosa, sem duplicação de produção e sem ações no iFood ou na loja. PR #107 DRAFT/HOLD.

## 1. Comprovação externa, não confundir as duas capacidades do iFood

**Impressão nativa do Gestor de Pedidos:** o iFood documenta que o Gestor pode imprimir pedidos automaticamente quando uma impressora não fiscal está configurada, e manualmente pelo ícone de impressora. Registra itens, observações e o identificador do pedido. Isso é uma possibilidade no produto, **não é prova** de que esteja ativa ou fisicamente funcional na unidade.

- iFood para Parceiros, *Gestor de Pedidos* (atualizado em 07/07/2025): https://blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/comment-page-6/
- iFood para Parceiros, *Aceite automático* (documentação da navegação): https://blog-parceiros.ifood.com.br/aceite-automatico/ — `Gestor > Ajustes > Impressão > Impressão automática de pedidos`. **Este documento não autoriza alterar esse ajuste**; o aceite automático é outra função, não confundir com impressão.

- iFood para Parceiros, *Impressora para iFood* (17/02/2026): https://blog-parceiros.ifood.com.br/impressora-para-ifood/

**Eventos e consulta por API:** são um canal técnico diferente, dependente de autorização, credenciais, aplicação homologada e política do iFood. A documentação oficial oferece webhook/polling, `GET /orders/{id}` e deduplicação por ID de evento; descreve webhook com entrega ao menos uma vez, sem garantia de ordem e janela limitada de retentativas. A API **não imprime automaticamente no Gestor** e um `ACK` ou confirmação HTTP não prova papel.

- https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-overview
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/workflow
- https://developer.ifood.com.br/pt-BR/docs/guides/order/events/delivery-methods/webhook/signature

Não criar uma integração API clandestina por automação de interface, sessão, login, token ou scraping. Não implementar polling/webhook produtivo sem consentimento e autorização de acesso aplicáveis.

## 2. Arquitetura de segurança — duas trilhas, uma única responsabilidade de produção

1. **Gestor iFood — canal de custódia da origem:** mostrar o pedido mesmo se a integração Teknisa atrasar. Uma impressora vinculada ao Gestor pode gerar a via original de contingência; **não assumir** que a impressão é automática no modo de integração atualmente ativo até confirmação no equipamento real.
2. **Teknisa / leitor — canal integrado:** evento, identidade, praça, observações, quantidade, classificação, sacola/kit e reconciliação V6.8 em ambiente de revisão.
3. **Conciliação — canal de comparação, não um terceiro emissor:** cruzar o mesmo pedido por UUID completo, unidade e itens/observações, identificar divergências ou ausência *nas capturas observadas*, registrar alertas candidatos para o responsável.
4. **Sem duas ordens de produção automáticas:** uma via direta do Gestor não deve acionar, duplicar ou suplantar três vias do TATÁ; duas bandejas físicas com o mesmo pedido precisam de reconciliação humana antes de processar ou reimprimir. Uma fila vazia, ACK de API, spooler aceito ou campo `printed=true` **não** prova nem ausência nem entrega de papel.
5. **Independência real depende da topologia:** mesmo Windows, mesmo spooler, mesma impressora, mesmo switch/rede ou mesmo nobreak representam falha comum. Caminho Gestor de contingência deve usar conexão/dispositivo/teste físico próprio quando possível, sem nova compra ou instalação autorizada nesta etapa.

## 3. Bloqueio de identidade encontrado

No DeliveryOS, `data/tata_reader_ifood_sequence_mapping_proof_20261005_v1.json` comprova, no escopo observado, que `NRCOMANDAEXT` transporta o **ID curto do iFood** no pedido `DLV_IFO`; isso **não prova o UUID completo**.

`docs/Checklist_Fonte_Continua_iFood.md` considera o UUID completo obrigatório para o join confiável e registra o ID curto como repetível. Logo, igualar `NRCOMANDAEXT` ao número mostrado pelo Gestor **não pode** liberar uma declaração de mesma ordem, nem disparar impressão.

O futuro vínculo precisa nascer de evidência confiável e verificável da origem iFood/relatório e do pedido correspondente na Teknisa, mantendo UUID, ID curto, loja, revisão, itens e escopo temporal correto. Não completar UUID com inferência nem presumir uma relação autenticada a partir de um JSON autodeclarado.

## 4. Código implementado — somente comparador puro de revisão

- `tools/comandas_ifood_gestor_contingencia_v849_offline.cjs`
- `tools/verificar_comandas_ifood_gestor_contingencia_v849_offline.js`
- `.github/workflows/deliveryos-thermal-shadow-gate.yml` (Linux + Windows)

Contrato de duas capturas **minimizadas**:
- `gestor`: `deliveryos.ifood-gestor-observation.v1`; `store_id`, `order_uuid` (ou `null`, nunca inventado), `display_id`, `status`, `snapshot_complete`, `items[{name,quantity,observations[]}]`, `order_observations[]` e afirmação opcional `paper_claimed`.
- `teknisa`: `deliveryos.teknisa-order-observation.v1`; `store_id`, `order_key`, `ifood_order_uuid` (ou `null`), `ifood_display_id`, `snapshot_complete`, `items[]`, `order_observations[]` e `paper_claimed`.

**Nenhuma dessas afirmações JSON autentica origem real ou pessoa.** O comparador só devolve um hash de referência, códigos de motivo e alertas, sem nomes, observações, CPF, endereço, telefone, número bruto de pedido ou UUID em sua saída. O hash de pedido só é gerado a partir de UUID completo; se a única identidade for o ID curto, não se exporta nem mesmo seu hash enumerável. Receber captura **não** significa que o Gestor tenha sido consultado por este trabalho.

Condições discriminadas, sempre `HOLD` ou `MATCH_CANDIDATE_HOLD`:
- Gestor capturado e Teknisa não capturada → investigar possível lacuna de integração/atraso; **não** declarar pedido perdido;
- Teknisa capturada e Gestor não capturado → investigar cobertura/canal iFood;
- diferença de unidade, ID curto, UUID, itens, quantidades, observações por item, observações gerais de pedido ou status → **alerta crítico**, sem correção automática;
- coincidência de ID curto, mas ausência de UUID completo de qualquer lado → `FULL_IFOOD_UUID_JOIN_NOT_PROVEN`;
- coincidência de UUID + itens + observações → **candidato de conciliação**, não prova de origem autenticada nem autorização de papel;
- afirmação de impressão em ambos os canais → risco de duplicidade física, exigir reconciliação; jamais reimprimir automaticamente;
- pedido ainda `PLACED`, cancelado, concluído ou agendado fora da janela → não inferir permissão de produção; a validação temporal de agendados segue pendente.

A comparação de nomes/observações exige igualdade literal normalizada; diferenças de nomenclatura iFood x Teknisa geram revisão manual em vez de inventar um mapeamento semântico.

**Efeitos estritamente falsos:** consulta API, ACK, confirmação/cancelamento, SQL, escritas na Teknisa, serviço Windows, impressão, spooler, número TATÁ e retry automático.

## 5. Plano operacional de contingência (NÃO ATIVADO)

**Etapa A — observação passiva:** no computador/dispositivo realmente usado para o Gestor, verificar em leitura autorizada se ele segue exibindo pedidos durante lentidão da Teknisa e se existe impressora Gestor já vinculada. Conferir identidade do equipamento e se a impressão é automática no modo integrado atual. Nenhum clique que imprima nesta etapa.

**Etapa B — prova independente de mesma ordem:** obter uma captura minimizada do pedido iFood e da Teknisa, com UUID ou mapeamento independente efetivamente comprovado, todos os itens, quantidades e observações. Testar pedidos normais, combos, modificadores, cancelados, atualizados e agendados; replays e colisões de ID curto. Verificar se relatórios/buscas são completos para o período; ausência de evidência **não** é ausência de pedido.

**Etapa C — procedimento humano de falha:** se o Gestor exibir uma ordem e a Teknisa não, a operação deve manter a ordem visível e verificar seu status no Gestor; imprimir manualmente a via de contingência **somente quando a loja autorizar a rotina, em impressora previamente validada**, identificando-a como contingência, mantendo controle de duplicidade; não esperar pela Teknisa como única fonte de verdade e não processar pedidos cancelados. Ao recuperar a integração, reconciliar antes de qualquer segunda impressão ou liberação de via.

**Etapa D — aprovação futura:** validar end-to-end duas impressoras/caminhos fisicamente independentes, falha de internet/Windows/Teknisa, fila, reinício, atraso de evento, papel, divergência e retorno à normalidade; registrar aceite operacional de César. Autorização específica exigida para impressão, instalação, deploy e cutover. Não prometer zero perda com só teste de software.

## 6. Prova e lacunas

- **FACT externo:** o Gestor oferece impressão direta e a API oferece mecanismos próprios de eventos (links acima).
- **FACT interno histórico:** `NRCOMANDAEXT` é o ID curto na evidência observada; o UUID não está provado no evento Windows instalado.
- **CODE_READY / TEST_PASS a confirmar pelo HEAD:** comparador de revisão e casos adversariais em ambiente efêmero, sem acesso real ao iFood.
- **UNKNOWN:** credenciais/homologação API; disponibilidade atual do Gestor; impressora Gestor já configurada; comportamento de impressão enquanto PDV está integrado; papel físico; canal independente real; join UUID do pedido vivo; atraso e cobertura de eventos atuais.
- **HOLD:** sem imprimir, instalar, mudar Gestor/Teknisa/iFood, confirmar/cancelar/despachar pedidos, mexer em fiscal ou SEFAZ, fazer merge/deploy ou ativar API.

**Objetivo operacional:** se a integração Teknisa falhar, o pedido continua sendo identificável pelo iFood e a equipe dispõe de uma rota de contingência verificável, sem fabricar provas nem duplicar produção.
