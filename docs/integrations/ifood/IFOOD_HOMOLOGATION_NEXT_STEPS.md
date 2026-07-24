# Próximos passos de homologação — v1

Este documento separa o que esta fundação PROVA (código real, testado,
simulado) do que só um processo real de homologação com o iFood pode
confirmar. Nada aqui é uma promessa de prazo ou de disponibilidade —
é um checklist do que falta e de quem depende.

## 1. O que esta missão prova (sem depender de homologação)

- A arquitetura de adapter desacoplado funciona — trocar o simulador por
  um cliente real não deveria exigir mudar inbox/outbox/reconciliação/
  negociação/saúde (a interface já os isola).
- A inbox é idempotente de verdade contra retry, duplicidade por múltiplas
  fontes, corrupção parcial e reinício.
- A reconciliação é determinística contra qualquer ordem de entrega,
  inclusive empate temporal sem causalidade (vira conflito explícito,
  nunca um palpite).
- A outbox e a negociação nunca enviam nada sem autorização humana
  explícita — estruturalmente, não por convenção.
- Nenhuma PII sobrevive no caminho de persistência ou diagnóstico.

## 2. O que DEPENDE DE CREDENCIAL (não iniciado nesta missão)

- Cadastro de aplicativo no Portal do Desenvolvedor iFood.
- Emissão de `client_id`/`client_secret` reais.
- Qualquer chamada real a `authenticate()`/`pollEvents()`/`fetchOrder()`/
  etc. do adapter.

Responsável: humano com autoridade para representar a TATÁ perante o
iFood — nunca esta sessão, nunca automatizado.

## 3. O que DEPENDE DE HOMOLOGAÇÃO (sandbox do iFood)

- Confirmar se `contracts/event-types.js#EVENT_TYPES`/
  `receivers/payload-mapper.js#CODE_MAP` batem com os `code`s reais da
  Events API — hoje é HIPÓTESE baseada em padrão público geral, nunca
  verificada.
- Confirmar o formato real de payload de webhook (se existir) e de
  polling — `contracts/envelope.js`/`payload-mapper.js` assumem uma forma
  hipotética (`{id, code, orderId, merchantId, createdAt}`).
- Confirmar se existe (e qual é) o endpoint/campo de acknowledgement de
  evento — `outbox/outbox.js` está pronto para representar essa ação, mas
  nunca a enviou.
- Confirmar suporte a `package_count`/volumes — ver
  `IFOOD_PACKAGING_CAPABILITY_V1.md` (hoje `unknown`, sem evidência
  investigada).
- Confirmar fluxo real de cancelamento/disputa/negociação estruturada —
  `contracts/cancellation.js`/`negotiation.js` modelam a FORMA, não o
  protocolo real de troca com o provedor.

Responsável: quem tiver acesso ao ambiente de sandbox/homologação —
também fora do escopo desta missão.

## 4. O que DEPENDE DE AUTORIZAÇÃO HUMANA (mesmo depois de credencial+homologação)

- Qualquer transição `outbox`/`negotiation` de `prepared` para
  `authorized` — já é estrutural no código (`authorize()` recusa sem
  `authorizedBy`), mas a POLÍTICA de quem pode autorizar o quê ainda
  precisa ser decidida pelo César antes de qualquer piloto.
- Ligar `projection/order-projection-bridge.js` a um observador de
  produção do Conference Brain — decisão de produto, não técnica; hoje é
  só contrato + teste sintético, deliberadamente não ligada.

## 5. Ordem sugerida (não uma promessa, uma sequência lógica)

1. Decisão do César: vale a pena buscar a API oficial agora, ou o scraper
   de tela (`conference-brain`) já resolve o suficiente por mais tempo?
2. Se sim: cadastro de aplicativo + acesso a sandbox (fora desta sessão).
3. Confirmar/corrigir o vocabulário de eventos e o formato de payload
   contra a documentação técnica real (não a pública de marketing já
   usada em `IFOOD_FUNCTIONAL_MODEL_V1.md`).
4. Reexecutar a suíte desta missão (82 testes) substituindo o simulador
   por um cliente real de sandbox — se algo quebrar, é sinal de que a
   HIPÓTESE estava errada num ponto específico, não de que a arquitetura
   está errada.
5. Só depois disso: decidir authorized/enviar de verdade uma primeira
   ação (ex.: acknowledgement) em ambiente controlado.

## 6. Limitações honestas desta fundação

- Nenhum campo do vocabulário de eventos foi verificado contra a API real.
- Nenhuma latência/rate limit real foi medida (o simulador não modela
  tempo de rede).
- Retenção/purge automático não implementado (só documentado como padrão
  a reaproveitar).
- `projection/order-projection-bridge.js` é só um esqueleto de hipótese —
  campos como `readiness_state_hint`/`grouping_hint` ficam `null` porque
  não há evidência de que a API exponha algo equivalente.
