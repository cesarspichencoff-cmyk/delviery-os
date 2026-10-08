# DeliveryOS · Comanda / NFC-e — Gate de conclusão verificável
**Snapshot:** 2026-10-07 · CAIXA_MOOCA / branch `tmp/paired-comanda-nfce-20261007`.

Este documento distingue a conclusão do **motor em shadow** da conclusão de **impressão real, integração fiscal e ativação produtiva**. Não confundir provas de replay com primeira passagem ou impressão.

## Estado comprovado nesta data
- Serviço `TataComandaReader` e consumer shadow estavam `Running` na última leitura; `print=false`, `fiscal_action=false`, sem erro informado.
- Motor de embalagem ativo no caixa: SHA256 `1E4CF2475EDB586D5DAE88388D2ADC7CF02013B00EC93C0371E3EDB80F81342E`.
- Consumer ativo no caixa: SHA256 `57586FFDA73904B06D8C2C28AAA47E13A6BAD4B6734C3CECC22ACDB8D16C0503`.
- Candidato reconciliado de classificação Bar: `runtime/shadow/candidates/CAIXA_MOOCA_consumer_bar_exact_20261007.cjs`, SHA256 `8FC7FCE349E6E443A0D1F68DEAEC2EF1932E00F33ECF7FED6FAFE5E386FD6F8B`. **Código pronto para eventual instalação controlada; NÃO instalado.**
- **CI automático para mudanças no código de shadow:** `.github/workflows/shadow-consumer-regression.yml` criado no branch; GitHub Actions run [`37710465876`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37710465876) foi concluído com `success` em 07/10/2026 (horário de Brasília). Passaram checkout, sintaxe das duas versões, teste de identidade Bar da referência, teste do candidato derivado do live e marcadores de segurança. **Não instala nada.**
- Teste nativo Node em memória diretamente no dispositivo: **134/134 comandas concluídas, zero erros**, 5 classificações corrigidas, 17 ready antes e depois, nenhuma nova aprovação não sustentada; validações de roteamento, efeitos, alergia e upstream preservadas. Ver `docs/SHADOW_BAR_EXACT_RECONCILIATION_PROOF_20261007.md`.
- Comparação anterior de 130 comandas identificou 64 bloqueios `KITS_NOT_FACT`, 56 `BAG_SIZE_NOT_FACT` e 33 `BAG_COUNT_NOT_FACT`, com **sobreposição**. Não reutilizar essas contagens como métrica live atual; repetir auditoria em nova versão e deduplicar por comanda.
- 10 casos naquela fotografia dependiam exclusivamente de cobertura de kits não provada; 4 apenas de quantidade externa de sacolas em composições quente/frio dependentes de montagem física. Bloqueios de alérgenos e upstream são independentes da regra de embalagem.

## Gates para ENCERRAR o shadow

| Gate | Critério observável | Estado |
|---|---|---|
| S1. Fontes operacionais | Reconciliar nomes/códigos, kits, caixa, sacola e exceções com fontes humanas atuais de TATÁ Academia e DeliveryOS; `UNKNOWN` técnico não vira pergunta antes de buscar a fonte | PARCIAL |
| S2. Candidate Bar no consumer | Diff contra consumer instalado, testes negativos, **Node nativo 134/134**, replay sem regressão; CI público anterior aprovado (run 37711014906); integração entre repositórios falhou por permissão no run 37711188966 | **TEST_PASS; CI ATUAL FAIL**, não implantado |
| S3. Instalação controlada | Canal autorizado, guarda de SHA contra drift, backup, substituição atômica, 10+ replays pós-instalação, service Running, `print/fiscal=false` | **PENDENTE**; tentativa anterior de escrita barrada por segurança |
| S4. Primeira passagem | Novas comandas do fluxo espontâneo com identidade, caixa, kits, sacola, roteamento, observação, bloqueios e hashes registrados desde o início; demonstrar que não são apenas replays de comanda passada | **PENDENTE** para novo candidate |
| S5. Cobertura confiável | Todas as classes suportadas por fatos existentes passam pela mesma regra; casos realmente sem dados materiais permanecem `UNKNOWN` com motivo correto e não bloqueiam silenciosamente; zero regressão crítica | **PARCIAL** |
| S6. Segurança | Alergia: revisão humana, nunca autorização automática; observações completas; upstream/serviço expirado bloqueia; impressão/fiscal desativados no shadow | **TEST_PASS em replay**, prova de fluxo operacional humano permanece pendente |

**Encerramento do shadow NÃO exige marcar todos os pedidos como `ready=true`**. Exige ausência de falsos `ready` e rastreabilidade do motivo de cada bloqueio real. Hoje a cobertura útil é limitada (17/134 `ready` em replay histórico da fotografia nativa), e não há prova suficiente de primeira passagem do candidate.

## Gates adicionais para OPERAR de verdade (comanda e fiscal)

| Gate | Prova que falta | Estado |
|---|---|---|
| P1. Contrato nativo de pedidos e praça | Identidade canônica única, serviço LUNCH/DINNER, sequência e vínculo comprovados no evento real; nunca inventar praça ou associar pedido ao recibo errado | PARCIAL; alguns casos upstream/serviço continuam bloqueados |
| P2. Impressão física | Teste controlado por impressora/praça; layout, legibilidade, redundância/duplicidade, papel, queda de rede, spooler, idempotência e rollback comprovados no equipamento correto | **NÃO PROVEN**; shadow não imprime |
| P3. NFC-e / DANFE / SEFAZ | Contrato fiscal nativo, autorização, emissão, contingência, cancelamento, idempotência e vínculo exato ao pedido testados ponta a ponta contra a realidade fiscal autorizada | **NÃO PROVEN** neste checkpoint |
| P4. Cutover | Aprovação humana explícita quando efeito produtivo se tornar iminente; janela controlada, fallback manual, reversão testada, observabilidade e acompanhamento de primeiros pedidos | **NÃO AUTORIZADO / NÃO EXECUTADO** |
| P5. Governança do código | Código operacional e código de referência reconciliados; commits e SHA presentes no checkpoint, CI de regressão, monitoramento de divergências e recuperação após reinício | **PARCIAL** |

O estado **NÃO PROVEN** significa que este checkpoint não possui a prova necessária; não implica que uma integração externa inexista.

## Ordem de execução recomendada, sem nova decisão humana desnecessária
1. **Promover o candidate somente após respeitar o canal de instalação permitido**; não tentar contornar bloqueios anteriores. Testes Node em memória já fecharam o gate de compatibilidade técnica da amostra, mas não o gate de instalação.
2. **Primeira passagem e triagem source-first:** registrar novos pedidos observados pelo consumer após instalação; recomputar bloqueios por comanda; resolver divergências de nomes, alias, kits e sacolas que já tenham fonte `FACT`, preservando exceções.
3. **Provar fisicamente a montagem**, em ambiente controlado e sob autorização adequada, apenas nos casos que exigem aferição de encaixe para sacolas externas; não converter compatibilidade provável em FACT.
4. **Separar a entrega operacional da fiscal:** fechar primeiro eventos/decisão/segurança em shadow; depois exigir autorização expressa e prova real para impressão; finalmente comprovar contrato NFC-e antes de qualquer cutover fiscal.
5. **Prova de robustez:** reinício e recuperação, deduplicação, ausência de efeitos durante shadow, falhas de rede e rollback dos artefatos efetivamente implantados.

## Decisão executiva
**Status geral: PARCIAL / SHADOW FUNCIONAL; NÃO 10/10 / NÃO PRODUÇÃO.**
Próxima ação técnica sem necessidade de pergunta: manter o candidate preservado, corrigir/validar seu pipeline de instalação pelo caminho autorizado, e exigir evidência de primeira passagem para a nova versão. Desbloqueio de impressão real e fiscal é uma autoridade e prova separadas; não está pressuposto por "pode seguir".

### Atualização 07/10/2026 — limitação real de acesso CI
- Repositório TATÁ Academia está **privado**. O workflow público do DeliveryOS passou em sintaxe e contrato sintético, mas o run [37711188966](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37711188966) **falhou** no checkout cross-repo da Academia (`Repository not found`; Git exit 128). Não chamar o CI atual de verde.
- Revisão anterior que executa apenas os testes públicos: [37711014906](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37711014906), `success`. Esse resultado não se transfere automaticamente à revisão atual.
- Motor verdadeiro da Academia, obtido por acesso privado autorizado, foi combinado em memória com o candidato do consumer; **10 cenários sintéticos passaram em V8** (com fingerprint simulado). A evidência **não** substitui Node nativo ou GitHub Actions cross-repo.
- Desbloqueio rastreado na [issue #13](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/13): retirar do CI público somente os dois passos de checkout/execução do motor privado, sem copiar fonte privada, sem usar segredo novo e sem contornar o bloqueio anterior de escrita no workflow. O teste privado permanece opcional em ambiente devidamente autorizado.
- Última verificação do CAIXA_MOOCA às 22:10:19 BRT: serviço e shadow Running, `print=false`, `fiscal_action=false`, sem erro; consumer e engine com hashes estáveis.
