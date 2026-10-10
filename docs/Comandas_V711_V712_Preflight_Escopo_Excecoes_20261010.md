# Comandas V7.11–V7.12 — Pré-voo sem efeitos, bloqueio de exceções antigas

**Checkpoint:** 10/10/2026. **PR #38:** DRAFT/HOLD. **Somente código, CI, leitura de arquivos autorizados e documentação.** Não instalado em CAIXA_MOOCA ou Itaim.

## 1. Evidências reais, sem expor dados de pedidos

Consulta read-only por arquivos do `C:\ProgramData\TataComandaReader\shadow`:
- `printer-map.json` reporta schema `deliveryos.runtime-printer-map.v1`, **10 mapeamentos**; `non-production.json` schema `deliveryos.non-production-items.v1`, **5 entradas**.
- `product-aliases-v1.json` schema `deliveryos.academia-live-product-aliases.v1`, **3 aliases**; `human-order-overrides-v1.json` schema `deliveryos.human-exact-order-overrides.v1`, **2 exceções históricas**. Os valores dos pedidos, códigos e notas não foram exportados.
- Os dois registros de exceção possuem `teknisa_sequence`, `ifood_sequence`, `bags`, `kits`, `source_refs` e `scope`, porém **NÃO** possuem campos estruturados `store_id`, `loja_id`, `operational_date`, `order_key` e `snapshot_hash`. `scope` é texto, não garantia de vínculo ao snapshot.
- O código V2 instalado seleciona overrides quando coincidem somente **duas sequências** e pode promover sacolas/kits para `FACT`. Os `source_refs` legados não são checados como provas de revisão pelo consumidor. **RISCO REAL DE ESCOPO**, não demonstração de ocorrência de erro em um pedido.
- `routing.json`, `product-identity-cache-v1.json` e `app-data.json` são grandes e a leitura direta trouxe trechos parciais; **não foram atestados integralmente os seus schemas e hashes ao vivo nesta etapa**.
- A ferramenta bloqueou uma inspeção PowerShell agregada por política de segurança; **não se repetiu por um caminho equivalente nem se contornou a restrição**. O acesso usado na sequência foi a leitura individual de arquivos permitida.

## 2. V7.11 — auditor local, puro e fail closed

`tools/auditar_preflight_consumidor_v711.js` lê exatamente oito arquivos que alimentam o candidato V7.10: motor, app-data, roteamento, mapeamento de impressoras, itens sem produção, cache de identidades, aliases e overrides humanos. Valida arquivo regular, sem symlink, limite de tamanho, legibilidade/JSON, schema e formato mínimo das coleções; compara **SHA-256 do motor** com `1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e`. Aceita UTF-8 e UTF-16LE BOM como os arquivos reais. Produz apenas metadados sanitizados. Saída positiva: `SOURCE_PREFLIGHT_MATCH_ONLY_NO_DEPLOY_AUTHORIZATION` — não autentica identidade/permissões do serviço, turno ou aceitação humana.

**Limite V7.11:** valida integridade e schema dos arquivos, **não** que os overrides legados estejam vinculados a revisões específicas. A V7.12 trata essa condição no **candidato futuro**, não no serviço instalado.

## 3. V7.12 — candidato isolado, sem alterar a V7.10

`runtime/shadow/live_shadow_consumer_v2_candidate_v712.cjs` foi derivado da V7.10 já aprovada e contém apenas um guarda localizado de exceções, sem alterar o motor, observações, classificação ou desenho.

- Se um override casar pelas duas sequências antigas, **não pode** se tornar `FACT` sem `scope=EXACT_SNAPSHOT_ONLY`, `store_id`, `loja_id`, `operational_date`, `order_key`, hash SHA-256 do `snapshot_hash` e `source_refs` não vazios. Se faltar, bloqueio `HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT`. Não migra nem inventa campos dos registros antigos.
- Dois registros casando com as mesmas sequências levam a `HUMAN_ORDER_OVERRIDE_AMBIGUOUS`, não `.find` silencioso.
- Uma exceção de outro pedido não deve causar bloqueio neste pedido. Casamento completo é apenas requisito **estrutural**; não autentica revisão humana nem legitima a fonte dos fatos sem provas adicionais.
- Alergia ou turno vencido continuam bloqueando mesmo quando um override sintético completo possui `FACT`. Não há mudança nas condições de impressão.

**Testes dirigidos:** `tools/verificar_override_snapshot_v712.js` reconstrói a V7.10 original por remoção exata do bloco V7.12 (Git blob `fc91468270888e14b56179835e668d3ca67a6dbf`), usa pedidos/arquivos fictícios e valida 15 cenários de mismatches de revisão, loja, data, escopo, evidência, duplicidade e alérgenos. Não usa pedidos reais.

## 4. CI e segurança do desenho

- [Run #38091334216](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38091334216): SUCCESS, V7.11 **14/14**.
- [Run #38091554012](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38091554012): SUCCESS, V7.12 **15/15**, V7.11 **14/14**, paridade V7.10 **10/10**, reconciliador V6.8 **62/62**, turno **29/29**; **`THERMAL_DESIGN_LOCK_V72=12/12; SVG_GOLDENS_MATCH`**.
- Os renderers SVG/Epson, Figma Produção V4.4 nó 30:2 e Conferência V4.3 nó 20:2, motor canônico e papéis anteriores **não foram modificados**.

## 5. Fronteira de efeito e cutover futuro

**NÃO autorizar instalação em razão de CI verde.** As duas exceções locais atualmente não fornecem vínculo estruturado suficiente para o novo candidato. É necessário decidir individualmente se permanecem históricas/arquivadas ou se há nova confirmação de fonte e snapshot válido; nunca converter dados históricos em fatos para um pedido novo.

Antes de qualquer futura instalação em Windows:
1. verificar os oito arquivos reais pelo preflight e revalidar o blob do consumidor instalado e o candidato, sem expor seus valores; inventariar permissões/identidade do serviço;
2. definir backups exatos, integridade dos arquivos, janela de manutenção, paralelismo, rollback e testes de serviço; não restaurar/avançar contadores do número TATÁ por adivinhação;
3. obter nova confirmação humana de turno **prospectivo** com `valid_from_local` no contrato efetivo; renovar apenas validade final não é suficiente;
4. classificar observações gerais e alertas de alergia por revisão, e resolver `KITS_NOT_FACT`, `BAG_SIZE_NOT_FACT`, `BAG_COUNT_NOT_FACT` e praça/embalagem sem inferir;
5. executar replay do mesmo pedido atual na cadeia real para **Cozinha/Sushi/Conferência**, comparando conteúdo, caixa física, kit/sacola, observações e desenho, em modo SHADOW; validar papel apenas na CAIXA Itaim mediante autorização específica.

**O que está PROVADO:** compatibilidade de código e testes sintéticos; presença de ativos V2 específicos e risco de escopo dos overrides reais; preservação dos SVGs históricos. **O que NÃO está PROVADO:** leitura operacional integral das oito fontes, instalação de candidato, turno aceito, emissão de 3 vias reais ou aceite óptico do papel.
