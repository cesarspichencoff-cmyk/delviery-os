# Checkpoint operacional — shadow de comandas — 2026-10-07

## Escopo / estado observável
Após a correção geral de combinado 1P, o CAIXA_MOOCA voltou a ficar acessível e recebeu a nova versão do motor em shadow. No último teste confirmado nesta data, o serviço e o consumer estavam `Running` / `RUNNING`, sem erro, com `print=false` e `fiscal_action=false`. Isso é uma verificação pontual, não garantia de disponibilidade permanente.

## Versões confirmadas no GitHub e no caixa
- TATÁ Academia: branch `evolucao/v33-product-pass`, correção geral de combinado 1P no commit `7974f654691e0628aa23d062db29c5b76ddc0cc0`; prova de implantação acrescentada no commit `c9e0229b7867a5152e610fd16e7249af53b63e32`.
- DeliveryOS: branch operacional `tmp/paired-comanda-nfce-20261007`; trava de alergia preservada e triagem documental aprimorada. Para a regra de consulta às fontes, ver `docs/SHADOW_SOURCE_FIRST_TRIAGE_20261007.md` (commit `6e18c9ea257b45f48b57cbde33ce73d93ac7070f`).
- Motor instalado no CAIXA_MOOCA e validado: SHA256 `A074C1F4B0DC90BAE97DA245062CA51C99B71F332F5E6BDD7C5E6E62EE0EA342`.
- Backup da versão anterior preservado: SHA256 `93E051A7324223B2906CFF811F9F7BBD1D5D17755127EEBE6DFDB77779920DAE`.
- Consumer shadow com bloqueio de menções explícitas de alergia mantido: SHA256 `DF478079CAE1C9A28D92BBF4B78D8EE554C173727A11B3EF79A4EF4E9C9ED84E`. O código do GitHub e o consumer operacional não são byte-identicos; nunca substituir um pelo outro sem reconciliação.
- Regra geral de combinado de 1 pessoa, sozinho, caixa 750, exceto Kids: **1 Sacola M**, confirmada diretamente por César, publicada e instalada.
- Testes de embalagem: **123/123**; testes de kits: OK; replay offline iFood 2103 e 7491: `ready=true`, 1 Sacola M, 1 Kit p/1; Kids 5287 e Temaki 9001 continuam corretamente fora da regra; alergias 6407 e 1577 seguem exigindo revisão humana; serviço expirado 6534 continua bloqueado.
- Recibo de prova no dispositivo: `C:\ProgramData\TataComandaReader\evidence\shadow-solo1p-750-M-proof-20261007.json`, SHA256 `23F1DDC8BE3914A8CA834723B9DDF4662D553E7AD219A08D702D18A73DFBF094`.
- Prova independente de primeira passagem para sete pedidos, arquivada em `C:\ProgramData\TataComandaReader\evidence\shadow-firstpass-proof-20261007.json`. Essa prova é do shadow; **não** comprova impressão física, emissão fiscal ou primeira passagem da nova regra geral.

## Diagnóstico de bloqueadores (fotografia histórica, não métrica atual)
Na análise histórica de 86 comandas concluídas às aproximadamente 20:18 de 2026-10-07, houve 45 com `BAG_SIZE_NOT_FACT` e 44 com `KITS_NOT_FACT`, com sobreposição entre bloqueadores. Esses números não correspondem a 89 pedidos distintos. Após a instalação da regra geral, não reutilizar esses totais como métricas atuais; refazer a coleta deduplicada por comanda.

## Backlog reclassificado após a correção
**Já resolvidos em código e replay, NÃO voltar a perguntar:** 2937 (Kit p/1, Sacola P), 6407 (Kit p/1, Sacola M, com trava independente de alergia), 1161 (Kit p/1, Sacola M), 7491 (Kit p/1, Sacola M), 2103 (Kit p/1, Sacola M pela regra geral). Essas provas de replay não substituem primeira passagem para cada regra nova.

**Não resolvidos somente por herança da regra do combinado 1P, sem autorizar novas perguntas imediatas:**
- iFood 5287: COMBINADO KIDS x1, caixa 750, kit Kids; Sacola M da regra geral de 1P não se aplica. Buscar fonte específica existente antes de concluir que há lacuna humana.
- iFood 9001: TEMAKI DE SALMAO x3, caixa 750, Kit p/1; não herda sacola M de combinado.
- iFood 9706: URAMAKI CALIFORNIA x1 + HOSSOMAKI DE SALMAO x1, grupo de caixa 750; checar identidade, fonte vigente e limites.
- iFood 0893, 0490, 6748, 4927 e demais composições: auditar as fontes mais recentes e o motor antes de classificar lacuna.

## Rota de trabalho obrigatória — prevenção de repetição
1. Revalidar a referência do projeto e os HEADs, carregar os fatos mais recentes e verificar drift.
2. **Consultar primeiro a documentação e as correções humanas existentes**, em especial `PACKAGING_RULES_CURRENT_2026-09-10.md`, `content-source/human-current/kits_2026-09-22_cesar.md`, demais `operational_truth_*` e o motor `lib/packaging-current.js` da TATÁ Academia. Conferir também as correções posteriores e aliases do DeliveryOS.
3. Nunca tratar `UNKNOWN` do motor nem perguntas em documentação histórica como prova de lacuna operacional: buscar regra já escrita e conferir execução.
4. Onde a fonte já é FACT e o motor bloqueia, reparar código/lookup/alias com correspondência **exata comprovada**, teste de regressão e rollback; não perguntar ao César.
5. Só pedir esclarecimento quando houver conflito humano atual demonstrável ou verdadeira decisão em aberto, após consulta completa, agrupando casos similares.
6. Travas de segurança por alergia, serviço expirado e segregação interna permanecem independentes; não transformar decisão shadow em liberação real.
7. Sem autorização específica, não ativar impressão, fiscal, SEFAZ, sequência real ou cutover.

**Estado:** checkpoint documental corrigido, com evidência de replays no CAIXA_MOOCA e teste de fonte-first. O status do serviço depois da última leitura em máquina precisa de nova observação, não de suposição.
