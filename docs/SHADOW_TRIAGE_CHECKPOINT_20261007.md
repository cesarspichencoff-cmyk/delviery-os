# Checkpoint operacional — shadow de comandas — 2026-10-07

## Escopo / estado observável
Última inspeção presencial remota confirmada do CAIXA_MOOCA: 2026-10-07 às 20:39:32 -03:00. Serviço Windows em Running, consumer shadow em RUNNING, `print=false`, `fiscal_action=false`, sem erro indicado. Após essa inspeção, Foxxy e CAIXA_MOOCA passaram a reportar Offline no Desktop Commander. **Não há verificação do estado em tempo real depois da perda de conectividade.**

## Versões confirmadas no GitHub
- TATÁ Academia: branch `evolucao/v33-product-pass`, commit `a129e65def08abffddf265b8434da0503e387b53`. Motor de embalagem inclui a regra humana exata do iFood 7491 (uma Sacola M para um COMB SUSHI ESPECIAL 1 P isolado).
- DeliveryOS: branch `tmp/paired-comanda-nfce-20261007`, commit `48b00fdf4baad27809954155723d1255aa280710`. Inclui documentação e trava shadow de alergia.
- Motor ativo no CAIXA_MOOCA confirmado no último replay do 7491: SHA256 `93E051A7324223B2906CFF811F9F7BBD1D5D17755127EEBE6DFDB77779920DAE`.
- Consumer shadow com bloqueio de menções explícitas de alergia instalado: SHA256 `DF478079CAE1C9A28D92BBF4B78D8EE554C173727A11B3EF79A4EF4E9C9ED84E`. O código no GitHub e o consumer operacional **não são byte-identicos**; nunca substituir um pelo outro sem reconciliação.
- Replay controlado da regra 7491: `ready=true`, `kit=Kit p/1 x1`, `bag=M x1`, `box=750 x1`; o bloqueio de alergia do 6407 e 1577 permaneceu, assim como bloqueio upstream de serviço expirado do 6534.
- Prova de primeira passagem do shadow para sete pedidos, guardada em `C:\ProgramData\TataComandaReader\evidence\shadow-firstpass-proof-20261007.json`. Esta evidência prova o shadow, **não** impressão física nem integração fiscal/DANFE.

## Diagnóstico de bloqueadores (fotografia histórica, não métrica atual)
Na análise de 86 comandas concluídas às aproximadamente 20:18 de 2026-10-07, houve 45 com `BAG_SIZE_NOT_FACT` e 44 com `KITS_NOT_FACT`, com sobreposição entre bloqueadores. Esses números não correspondem a 89 pedidos distintos.
Às aproximadamente 20:32, o consumer mostrava 197 decisões processadas, 13 ready, 184 blocked (contadores de eventos, não pedidos únicos). Não extrapolar os contadores para a taxa de pedidos concluídos.

## Backlog com base em comandas observadas
**Aguardam apenas sacola ou outra pequena regra, sem inferir a solução:**
- iFood 2103: COMB SUSHI TRAD 1 PESSOA x1, grupo de caixa 750; kit p/1 já reconhecido; tamanho da sacola UNKNOWN.
- iFood 5287: COMBINADO KIDS x1, grupo de caixa 750; kit Kids x1 já reconhecido; tamanho da sacola UNKNOWN.
- iFood 9001: TEMAKI DE SALMAO x3, caixa 750; kit p/1 já reconhecido; tamanho da sacola UNKNOWN.
- iFood 9706: URAMAKI CALIFORNIA x1 + HOSSOMAKI DE SALMAO x1, caixa 750; kit p/1 já reconhecido; tamanho da sacola UNKNOWN.
- iFood 0893, 0490, 6748 e 4927: outras combinações com caixa 750 e regras parciais — analisar composição e regras exatas antes de solicitar qualquer decisão.

**Já resolvidos em código e replay, NÃO voltar a perguntar:** 2937 (Kit p/1, Sacola P), 6407 (Kit p/1, Sacola M, com trava independente de alergia), 1161 (Kit p/1, Sacola M), 7491 (Kit p/1, Sacola M). A prova de regra em replay não é prova first-pass para a regra nova.

## Próxima rota de maior valor
1. Restabelecer canal de observação remoto e verificar `Running`, hash, estado de serviço e efeitos desabilitados; **não presumir que o serviço continua online**.
2. Fazer análise **por comando X único**, não somar eventos 3 e X como dois pedidos.
3. Separar as classes: nome/produto e roteamento confirmados, mas sem alias exato; regra humana de kit ausente; regra humana de sacola ausente; gravação/print/fiscal (fora do escopo).
4. Em vez de adjudicar um pedido por vez, solicitar **uma confirmação geral, se apropriada**, para casos de mesmo grupo: por exemplo, se Combinados de 1 pessoa **sozinhos** (excluindo Kids) em caixa 750 usam Sacola M. Essa regra **não está confirmada**. Confirmar antes de codificar, testar exceções, obter prova negativa e instalar somente shadow com rollback.
5. Não aplicar `750 -> M` genericamente: a origem vigente só confirma casos específicos. Kids, temakis e enrolados não herdam uma regra universal.
6. Trava de alergia é somente shadow; não equivale a alerta à cozinha ou liberação humana.
7. Não alterar impressão real, fiscal, SEFAZ ou sequência real sem autorização explícita e contrato nativo comprovado.

Estado deste documento: CHECKPOINT_PARCIAL. Não garante que o runtime esteja acessível ou que os pedidos posteriores tenham sido processados.
