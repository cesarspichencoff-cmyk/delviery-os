# Gestor iFood × Reader Teknisa — conciliação em tempo real (SHADOW)



Data: 01/11/2026. Escopo: TATÁ Itaim. CAIXA_MOOCA é apenas o nome remoto do mesmo caixa físico.



## Objetivo

Correlacionar a identidade do pedido no Gestor web com a comanda nativa e as linhas dos produtos, sem API do iFood. O Gestor informa o estado externo; a Teknisa/Reader pode informar NRCOMANDAEXT, chave composta nativa, revisões, quantidades e códigos. A Academia pode classificar os produtos após validação do catálogo atual.

IDSTCOMANDA=P e IDSTPRCOMVEN=4 NÃO comprovam item iniciado, pronto, impresso ou entregue.



## Evidência já existente

- Conciliação de 25/10: iFood 314; Teknisa DLV_IFO 317; **311 pares candidatos** por número curto e data/unidade; 3 só iFood e 6 só Teknisa. Não autentica UUID completo ↔ chave nativa.

- Em 01/11, extensão V1 do Edge real enviou contagens para localhost 5194; às 22h54 observados 233 eventos, última leitura 7s. perOrderFacts=false, merchantVerified=false, completeCoverage=false.

- V2 estrutural preparou receptor 5195, porém 0 eventos reais. V2 atualmente não fornece IDs individuais.

- Serviço TataComandaReader RUNNING no CAIXA_MOOCA, mas a conta do conector remoto recebeu Access Denied nos diretórios de eventos. Não contornar ACL nem inferir que o serviço disponível torna seu conteúdo acessível.

**Conclusão: sem os dois fluxos individuais autorizados, o cruzamento REAL em tempo real continua bloqueado.**



## Código candidato

tools/gestor-native-shadow-reconcile/reconcile.cjs é função pura, síncrona, sem rede, SQL, impressão, escrita ou mudança de pedidos. Recebe coleções já normalizadas por fontes legitimamente autorizadas.

Requisitos: mesma loja Itaim, mapeamento explícito iFood 53069 ↔ filial 0001 / loja 01 (não independentemente atestado), data operacional local, ID curto de quatro dígitos, origem DLV_IFO, chave nativa e hash de revisão, capturas frescas até 30 segundos e nenhum cruzamento SIMULATED/LIVE_SHADOW.

Ausência, colisão de código no mesmo dia, replays não consecutivos A→B→A, revisões conflitantes no mesmo instante, estado inválido e escopo divergente produzem HOLD ou quarentena; não há join por proximidade temporal.

Saída por candidato: referência HMAC opaca, quantidade de linhas e unidades, itemRefs opacos com índice e quantidade. Nenhum nome, telefone, endereço, UUID, short ID, valor ou observação livre sai no contrato. Não atribuir a estados nativos a semântica de preparo.

Em qualquer cenário: matches status CANDIDATE_REVIEW_ONLY, uuidJoinProven=false, readyForCopilot=false, printAuthorized=false e deliveryEventsEnabled=false. Uma flag de fonte fornecida pelo input não prova atestação independente.

A chave HMAC constante do teste é fictícia. A aplicação real precisará de chave aleatória privada por host.



## Prova local

**39/39 verificações PASS** no Node 24.21.0 do CAIXA_MOOCA com dados totalmente fictícios: revisão, colisão, duplicação, datas, desvio de relógio, itens/quantidades, privacidade, origem e efeitos negados.

Fixture de 314 versus 317 reproduziu 311 candidatos, 3 apenas iFood e 6 apenas Teknisa. Isso NÃO é nova amostra real.

Arquivo de testes: tools/gestor-native-shadow-reconcile/reconcile.test.cjs. CI do commit exato não foi executado.



## Próximas provas necessárias

1. Ler legitimamente número curto por cartão no Gestor autenticado e medir cobertura de tela e listas virtuais; a V1 não entrega isso.

2. Obter fonte nativa Reader V2 por uma interface read-only autorizada, respeitando ACL, contendo chave composta, revisão e itens sem PII no diagnóstico.

3. Confirmar independentemente a conta Itaim e a associação de loja iFood 53069 ↔ Teknisa 0001/01.

4. Rodar conciliação em janela real limitada, identificar exceções e crosscheck de revisão; preservar qualquer ambiguidade sem criar entregas ou estado pronto.

5. Somente depois qualificar consumo pelo Copiloto/Delivery OS com consentimento, proteção, rollback e teste de campo próprios.



Status: CODE_READY + LOCAL_FIXTURE_TEST_PASS; não LIVE_JOIN_PROVEN, não DEPLOYED, não 10/10. Nenhum merge, deploy, impressão, despacho ou alteração no caixa.