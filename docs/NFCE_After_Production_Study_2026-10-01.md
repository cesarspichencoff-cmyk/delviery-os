# NFC-e automática após comandas — estudo e contrato pré-Mooca — 2026-10-01

## Objetivo operacional de César

Para pedidos elegíveis, manter uma ordem simples para a equipe:

1. pedido recebe os três identificadores, incluindo a sequência TATÁ diária;
2. comandas de produção são roteadas para as praças corretas;
3. o despacho das comandas é observado;
4. somente então o fluxo fiscal nativo elegível entra como próximo passo;
5. NFC-e autorizada e DANFE/cupom ficam correlacionados ao mesmo pedido/TATÁ.

A sequência TATÁ é chave operacional de correlação. Ela nunca substitui número,
série, chave ou protocolo fiscal.

## Política TATÁ confirmada

Regra humana confirmada em 2026-10-01:

- escopo = loja + data operacional local;
- primeiro pedido do dia = 001;
- sequência cresce dentro da mesma loja/data;
- nova data local reinicia em 001;
- lojas diferentes possuem escopos independentes;
- reimpressão/replay do mesmo pedido preserva a mesma sequência.

A função pura não lê relógio do computador. O caller deve fornecer a data local
YYYY-MM-DD da loja para impedir reset acidental por timezone do host.

## FACT — cenário fiscal atual relevante

### São Paulo

- NFC-e modelo 65 é obrigatória no varejo paulista desde 2026-01-01,
  substituindo CF-e-SAT, modelo 02 e modelo 56.
- A SEFAZ-SP anunciou mudança do protocolo de autorização em produção para
  17 posições em 2026-10-05.
- QR Code v3 da NFC-e já faz parte do leiaute nacional em produção.
- DANFE NFC-e é documento auxiliar/representação; autorização fiscal e papel
  impresso são fatos distintos.

### Teknisa/Odhen

Documentação pública da Teknisa mostra que:

- Odhen Retail possui suporte fiscal NFC-e;
- Odhen POS pode operar com NFC-e e comunicar-se com a SEFAZ;
- Cadastro de Caixa relaciona impressora de cupom fiscal;
- o Retail expõe parâmetros como Transmissão Automática (NFC-e),
  Emissão DANFE Contingência, NFC-e Service e mensagens de rejeição;
- existe fluxo "NFC-e Automático" no ecossistema Teknisa para pedidos pagos,
  condicionado a caixa NFC-e específico, caixa aberto e API Interface;
- a documentação pública encontrada não prova que esse fluxo automático cobre
  especificamente o canal iFood/integração usado pelo TATÁ.

## Decisão arquitetural pré-Mooca

NÃO criar emissor SEFAZ paralelo no DeliveryOS.

Preferência:

TEKNISA_ODHEN_NATIVE_NFCE

DeliveryOS fica responsável por:

- correlação do pedido;
- ordenação operacional;
- gates de evidência;
- observabilidade;
- impedir duplicidade/retry cego;
- mostrar estados sem mentir.

Teknisa/Odhen permanece responsável por:

- formação fiscal;
- XML fiscal;
- assinatura/certificado;
- cálculo/regra fiscal que já pertença ao sistema fiscal;
- transmissão/autorização;
- contingência nativa;
- DANFE fiscal.

## Estado separado obrigatório

PRODUCTION_DISPATCH != NFCE_AUTHORIZED != DANFE_PRINTED

O fluxo não pode transformar sucesso de spooler em sucesso fiscal nem
autorização fiscal em prova de papel.

## Ordenação proposta

Política operacional desejada:

PRODUCTION_DISPATCH_THEN_NATIVE_FISCAL_REQUEST

Mas esta política só pode ser ativada depois de provar no TATÁ:

1. qual evento real é o gatilho fiscal dos pedidos do canal estudado;
2. que atrasar a solicitação até o despacho das comandas é compatível com esse
   gatilho e com a operação fiscal vigente;
3. que o canal é elegível ao mecanismo nativo usado;
4. que caixa fiscal necessário está configurado e aberto;
5. que API/serviço/interface necessários estão ativos;
6. qual impressora recebe o DANFE/cupom;
7. que a versão instalada suporta o estado fiscal atual de 2026, incluindo QR
   Code v3 e o protocolo SP de 17 posições a partir de 2026-10-05.

Até lá: fiscal_action=false.

## Barreira de produção

Para a finalidade de ordenação, não exigimos confirmação humana de papel para
cada comanda.

Aceitável para dizer que o despacho foi observado:

- SPOOLER_OBSERVED; ou
- PHYSICALLY_CONFIRMED.

Não aceitável:

- PLANNED;
- SUBMISSION_RETURNED_UNOBSERVED;
- EFFECT_UNKNOWN_REQUIRES_RECONCILIATION.

Se o estado é ambíguo, o fiscal não é automaticamente usado como mecanismo de
"seguir adiante"; primeiro existe um problema operacional a reconciliar.

Pedidos que legitimamente não possuem comanda própria podem atravessar a
barreira sem criar papel artificial.

## Preflight fiscal preparado

Existe uma sonda read-only:

tools/odhen_fiscal_surface_probe_readonly.ps1

Ela procura somente superfícies de código/configuração relacionadas a NFC-e,
SEFAZ, DANFE, QR Code, transmissão automática, CSC, certificado e Interface.

Ela NÃO:

- inicia Odhen;
- chama HTTP/SEFAZ;
- lê pedido;
- consulta ou grava banco;
- emite documento fiscal;
- imprime;
- altera configuração.

O preflight único do Mooca também coleta esse resultado como descoberta
informativa, sem tornar a trilha das comandas dependente da existência de uma
string específica no código.

## UNKNOWN que somente ambiente real deve resolver

- caminho fiscal efetivamente usado hoje pelo TATÁ Itaim;
- versão real do Retail/Odhen/Interface;
- canal iFood elegível ou não à rotina automática existente;
- gatilho real por pagamento/fechamento/venda integrada;
- caixa NFC-e e estado de abertura;
- certificado/CSC somente como estado de readiness, sem expor segredo;
- compatibilidade real QR Code v3;
- compatibilidade com protocolo de autorização SP de 17 posições;
- impressora/fila/driver do DANFE;
- comportamento de rejeição, contingência e recuperação;
- vínculo persistente pedido/TATÁ -> chave/protocolo fiscal sem escrita paralela.

## Effect boundary

Nenhum código deste estudo:

- transmite NFC-e;
- assina XML;
- acessa certificado;
- chama SEFAZ;
- fecha/abre caixa;
- escreve no Odhen/Teknisa;
- imprime DANFE;
- promove produção.

É contrato, teste, descoberta read-only e preparação.
