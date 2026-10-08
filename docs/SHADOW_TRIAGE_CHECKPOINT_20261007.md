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


---

## RECOMPUTED_SNAPSHOT_20261007_2130 — auditoria pós-correções

Data da verificação em máquina: 2026-10-07, 21:30:50 -03:00.

**Recontagem obrigatória sobre os arquivos atuais do CAIXA_MOOCA:** 130 comandas distintas concluídas, cada uma reprocessada pelo motor/consumer atualmente instalados; **16 `ready=true`, 114 bloqueadas**, sem erro de replay. O resultado é um **replay read-only histórico**, não a taxa oficial de sucesso da primeira passagem de pedidos novos.

- **41 decisões históricas diferiram** da execução do motor atual. Portanto, os arquivos originais `reader-shadow-decisions-v1` podem conter bloqueadores antigos e não devem determinar sozinhos as próximas correções. Exemplo: iFood 2937 já está corrigido e pronto no replay atual, embora seu artefato histórico ainda mostre `KITS_NOT_FACT`.
- Bloqueadores na recontagem: `KITS_NOT_FACT` **64**, `BAG_SIZE_NOT_FACT` **56**, `BAG_COUNT_NOT_FACT` **33**. Há sobreposição entre eles; não somar como pedidos distintos.
- **10 comandas com exclusivamente `KITS_NOT_FACT`**, entre elas 5576 (2 Sashimis + 1 Uramaki), 7659 (combinado 2P + 1 dupla), 4656 (1 Sashimi + 1 Temaki) e outras misturas fora das assinaturas humanas explicitamente documentadas em `kits_2026-09-22_cesar.md`. Não presumir equivalência de kits nem perguntar imediatamente à autoridade humana.
- **4 comandas com exclusivamente `BAG_COUNT_NOT_FACT`**: iFood 7851, 8672, 2104 e 1790; todas combinam quente e frio. A fonte vigente permite uma mesma sacola **somente se** houver segregação interna, encaixe e estabilidade comprovados; a fonte **não fixa** uma quantidade externa universal. Não converter essa possibilidade em FACT sem evidência física.
- `CLASSIFICATION_UNKNOWN_9.10.05.000.00` ainda aparece para o nome Retail `CARPACCIO DE SALMAO`. A matriz de embalagem reconhece a família, mas não há prova independente de cobertura de kit da composição inteira; classificar somente a caixa não autoriza marcar `ready=true`. A proposta de adaptação do consumer **não foi executada** nem instalada nesta etapa. Manter a trava atual e auditar as atribuições de kits de Carpaccio antes de eventual mudança.
- Evidência no host: `C:\ProgramData\TataComandaReader\evidence\source-first-recomputed-blockers-20261007.json`, SHA256 `44468028CCF612110BA63BA48EF4FDD80ACDF55BBE238CA095F298A32C9DEE9B`.

**Versões finais verificadas em máquina:**
- Motor `packaging-current.js` SHA256 `1E4CF2475EDB586D5DAE88388D2ADC7CF02013B00EC93C0371E3EDB80F81342E`.
- Consumer `live_shadow_consumer_v1.cjs` SHA256 `57586FFDA73904B06D8C2C28AAA47E13A6BAD4B6734C3CECC22ACDB8D16C0503`.
- Serviço `Running`, shadow `RUNNING`, `print=false`, `fiscal_action=false`, sem erro reportado às 21:30:50 -03:00.

**Próxima ação segura:** separar os dez casos apenas de kits em (a) regra humana específica já existente mas não reconhecida, (b) lacuna real da fonte; para as quatro quantidades externas dependentes de encaixe, obter prova material somente por canal já autorizado. Nunca derivar confirmação humana da ausência de bloco no motor.

---

## BAR_EXACT_20261007_SOURCE_ONLY — avanço sem instalar no CAIXA_MOOCA

**Origem:** recontagem histórica read-only de 130 comandas com o consumer instalado, mais validação cruzada da identidade Retail, do roteamento `00007` e das categorias `bebida` da TATÁ Academia.

Identidades exatas e rotas observadas:
- `COCA COLA 350ML - UN` / `8.00.05.000.00`: Bar `00007`, refrigerante.
- `COCA COLA ZERO 350ML - UN` / `8.00.05.010.00`: Bar `00007`, refrigerante; classificação já estava explicitamente presente no consumer instalado.
- `AGUA MINERAL S/GAS - UN` / `8.00.00.000.00`: Bar `00007`, água.
- `AGUA MINERAL C/GAS - UN` / `8.00.00.010.00`: Bar `00007`, água.

Comandas impactadas **na fotografia de replays de 130 pedidos**, sem nova prova first-pass: iFood 0292 (somente classificação da água com gás pendente), 8933 (água sem gás + tamanho de sacola ainda pendente), 4459/5192/2666 (Coca-Cola + bloqueios independentes). A classificação por si só **não prova** que nenhum pedido real foi efetivamente separado ou entregue.

**Chá gelado Retail 450 ml** `8.00.05.100.00` / iFood 0832 **não** foi igualado ao Ice Tea Limão de 300 ml da Academia: evitar equivalência falsa de SKU/volume, mesmo sendo bebida da rota Bar.

**Implementação segura no código de referência do DeliveryOS, NÃO no dispositivo:**
- Commit `37eab4e9334fc459eec6e5200763eb85bb92b761`: função `classifyRetailBarExact` baseada somente em nome normalizado **exato**, código canônico e rota única `00007`; mantém Coca-Cola Zero, substitui a aceitação ampla de qualquer prefixo `coca cola` por correspondências provadas, preserva a rota Sprite anterior.
- Commit `7937fb16cd7a854fd439978520234dd7c0c10c89`: teste de 9 cenários positivos/negativos, incluindo incompatibilidade de código, rota indevida, dois destinos e volume diferente de chá.
- Teste do código de referência por executor JavaScript com adaptação das APIs Node: **9/9 aprovado**, com checagem sintática. **Teste nativo Node e replay do novo consumer não realizados.**
- O consumer do GitHub **não é equivalente** ao consumer instalado. Antes de instalar: reconciliar recursos do live consumer (observações, aliases, regra de alergia, pedidos) e exigir testes completos; jamais substituir o arquivo do CAIXA_MOOCA pela versão de referência sem reconciliação.

**Tentativa de preparar arquivo no CAIXA_MOOCA foi barrada por controle de segurança:** não houve escrita da correção, instalação, spooler, impressão ou efeito fiscal.

**Estado efetivo que permanece instalado:** motor SHA256 `1E4CF2475EDB586D5DAE88388D2ADC7CF02013B00EC93C0371E3EDB80F81342E`; consumer SHA256 `57586FFDA73904B06D8C2C28AAA47E13A6BAD4B6734C3CECC22ACDB8D16C0503` (último comprovante de 21:36–21:38).

**Próxima decisão técnica sem perguntar ao gestor:** conciliar a variante de referência com o consumer instalado preservando observações/alergias, provar replay antes/depois das comandas citadas e só então usar a rota de implantação permitida. O bloqueio da ferramenta de escrita não deve ser contornado por rota equivalente.
