# TATÁ Comandas + Delivery OS — prova mínima da origem atual (03/11/2026)

**Estado:** PROPOSTA DE CONTRATO EM LABORATÓRIO · PR #137 DRAFT · SEM ATIVAÇÃO.
**Escopo:** Itaim, comanda nativa Reader, prévia de Conferência; nenhuma substituição de Cozinha ou Sushi.
**Fonte canônica do VÉRTICE:** `cesarspichencoff-cmyk/vertice-runtime.`, `vertice-active`, `VERTICE_ENTRY.md`.

## O que a evidência existente permite afirmar
- O `DeliveryOS-Itaim-Observer` já publica `status.json` atual e sanitizado a cada ciclo. Última evidência lida nesta rodada: 03/11 22:05:39.777Z, modo DINNER, 250 arquivos examinados, 248 históricos, 2 projetados. `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null`. **Não são dois pedidos reais confirmados.**
- O relatório detalhado Reader acessível em `TataComandaReader\reports` está congelado em **05/10**. A pasta `state/evidence` exige outra identidade; o conector recebe EPERM. Não contornar esse controle com outra ferramenta, conta ou caminho.
- A revisão nativa arquivada **9627**, 05/10, cabeçalho X, 4 linhas de produto, percorreu o consumidor V7.14 e o replayer das duas frentes com hashes iguais. Não é evidência de pedido atual nem de estado operacional X.
- O Gestor do piloto anterior declarou `merchantVerified=false`, `orderCapture=false`. Uma lista de códigos curtos visíveis nunca comprova o UUID nem o vínculo único com o Reader.

## Contrato mínimo preparado, sem execução no caixa
`runtime/reporting/native_reader_source_receipt_review_v1.cjs` valida dois comprovantes criptográficos concatenados:
1. **Escritor do Reader:** assina somente `host=CAIXA_MOOCA`, `unit=ITAIM`, origem `NATIVE_READER_V2`, digest de evento nativo, digest da decisão, referência opaca do pedido e dois horários UTC. Não assina nome, telefone, endereço ou observação bruta para publicação.
2. **Atestador independente:** assina a declaração do escritor e a assinatura exata do escritor. Suas chaves precisam ser distintas e autorizadas para papéis específicos, com SPKI Ed25519 pinado e janelas de validade.
3. **Verificador puro:** recusa escopo diferente, replay vencido, timestamp inválido, chave incorreta, conteúdo adulterado e trust ausente. O relógio e os pins são fornecidos pelo chamador e **não se tornam autoridade apenas por aparecerem na entrada**.
4. **Saída:** no máximo `CRYPTOGRAPHIC_REVIEW_ONLY`; `sourceIdentityProven=false`, `ordersPublishable=0`, `printAuthorized=false`. Portanto, este componente não é um atalho para ativar a Conferência.

**Teste adversarial executado no Foxxy:** 31/31 com chaves totalmente sintéticas; 25/25 timestamp, 48/48 replay Reader e 53/53 readiness (157/157, testes locais; sem alegação de CI para os testes novos).

## Prova adicional obrigatória para sair do bloqueio
A próxima operação real **não é instalar um novo observador nem aumentar ACL genericamente**.

- **Autoridade da fonte:** comprovar qual processo instalado como serviço Reader está habilitado a emitir o comprovante, sob qual identidade Windows, qual versão binária, e como a chave de assinatura foi provisionada e limitada. O atestador deve ser independente, com acesso somente leitura e trust pinado fora do envelope.
- **Revisão viva:** obter por rotina **oficialmente autorizada** um único digest de revisão atual de Itaim, com data/revisão de origem e prova de frescor, sem exportar registros pessoais nem arquivo interno protegido para o chat.
- **Identidade iFood independente:** obter ID/UUID comprovado de fonte legitimamente autorizada, conferir vínculo único com a chave nativa, itens, quantidades e observações; quarentenar colisão e mudanças de estado. Sem navegação na sessão operacional do operador.
- **Repetibilidade:** testar 1 → 5 → amostra variada, com alterações, cancelamentos ou estados desconhecidos e deduplicação.
- **Somente após isso:** preparar o ledger diário TATÁ com escritor + atestador de identidades distintas no host aprovado, destino exclusivo da Conferência, validação da densidade noturna em papel e piloto supervisionado com rollback.

**Limite de autorização:** qualquer provisionamento de chaves reais, alteração de ACL, serviço, tarefa, leitura de dados pessoais, captura do Gestor ou ativação de impressão requer avaliação de efeito específica e autorização humana correspondente. Não houve efeito desse tipo nesta rodada. O silêncio do caixa e a produção Teknisa/iFood têm precedência.

## Linha de prova
- `CODE_READY`: revisão e teste puro do comprovante, sem fonte operacional conectada.
- `TEST_PASS_FIXTURE`: os 157 testes locais, com chaves de laboratório.
- `LIVE_SOURCE`: **UNKNOWN**, não carregada e não autenticada.
- `DEPLOYED`: **NO**.
- `WORLD_PROVEN`: **NO**.
- `HUMAN_ACCEPTED`: **PENDING**.
