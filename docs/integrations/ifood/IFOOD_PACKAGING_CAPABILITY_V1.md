# Capacidade de embalagem externa — v1

IMPLEMENTADO (contrato + registro), NÃO VALIDADO (nenhuma evidência real
investigada nesta missão). `contracts/packaging.js` +
`packaging/packaging-registry.js`.

## 1. O que a missão pediu

Investigar SÓ nos materiais e documentos já disponíveis no repositório se
existe suporte confirmado a `package_count`, `volume_count`, `bag_count`,
`packages`, `parcels`, etiquetas, informação ao entregador.

## 2. Resultado da investigação (ver `IFOOD_EXISTING_ASSETS_INVENTORY.md` §2)

Busca por `package`, `bag`, `volume`, `"Volume 1 de 2"`, `package_count` em
todo o repositório: **nenhuma ocorrência** desses termos como campo da API
do iFood, documentado ou hipotético. O que existe é vocabulário
COMPLETAMENTE DIFERENTE e interno ao DeliveryOS —
`src/perfil-delivery/motor.js` (`sacolas`, `segundaSacola`,
`temQuente`/`temFrio`) — que resolve embalagem com base em composição de
pedido **sintética** (rotulado explicitamente no cabeçalho do próprio
arquivo), sem nenhuma ligação com um campo real vindo do iFood.

**Conclusão: não há evidência, nesta missão, de que o iFood exponha via
API/webhook um campo estruturado equivalente a "quantas sacolas este
pedido tem".**

## 3. ExternalPackagingCapability — estados

`unsupported` (confirmado com evidência que NÃO existe) · `unknown`
(padrão — nada investigado/confirmado) · `candidate` (hipótese levantada,
sem evidência) · `documented` (achado em documentação pública, não
testado) · `testable` (documentado o bastante para desenhar um teste de
homologação) · `available` (confirmado em homologação/produção) ·
`synchronized` (DeliveryOS já envia/recebe o dado de verdade) · `failed`
(tentativa real falhou).

**Regra dura, testada**: qualquer estado além de `unknown`/`candidate`
exige `evidence_refs[]` não-vazio — o contrato RECUSA a escrita sem
evidência (`buildPackagingCapability()` retorna `{ok:false}`).

## 4. Estado real registrado por esta missão

Nenhum `capability_record` foi persistido em produção — a investigação
(§2) não encontrou evidência suficiente nem para `candidate`. O estado
efetivo de QUALQUER consulta (`packaging-registry.js#get()`) sem registro
prévio é sempre `unknown` — comportamento padrão do módulo, testado.

## 5. O DeliveryOS continua controlando isso internamente

`src/perfil-delivery/motor.js` continua sendo a fonte de verdade para
`package_count`/"Volume 1 de 2"/"Volume 2 de 2"/quente-frio/confirmação de
volumes — **nada mudou ali nesta missão**. Este documento só registra que
não há (ainda) uma ponte confirmada entre esse controle interno e um
campo equivalente do iFood.

## 6. Próximo passo (DEPENDENTE DE HOMOLOGAÇÃO)

Só um humano com acesso à documentação técnica autenticada do
Portal do Desenvolvedor iFood (não consultada nesta missão — fora do
escopo "não acessar API real") pode mover este estado de `unknown` para
`candidate`/`documented`. Ver `IFOOD_HOMOLOGATION_NEXT_STEPS.md`.
