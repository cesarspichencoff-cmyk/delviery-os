# Reconciliação de fontes e provas — DeliveryOS térmico (11/10/2026)

**Natureza:** auditoria e plano de integração SHADOW, sem alteração de motor, consumer, watcher, Windows, serviços, SQL, impressão, spooler, fiscal/SEFAZ, turno, cutover, merge ou deploy.
**Base imutável consultada:** DeliveryOS PR #38 HEAD `3ddc6db4025c4e25e4eec554e04c4e100add8056` (V7.16); Academia PR #50 HEAD `39c6eb995cef27f41c50f310c424a7487c1cdeb6`.
**Não é autorização de release.** Os fatos abaixo foram reconciliados por inspeção de fontes GitHub; o CAIXA_MOOCA não pôde ser reconsultado em 11/10 após atingir a cota do conector remoto.

## 1. Ocupantes atuais e fatos sem duplicação

| Tema | Ocupante e evidência | Estado |
| --- | --- | --- |
| Consumer V2 + preservação de notas/alergias/aliases/overrides | `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs` blob Git `0fe817bd07fd13a6df5cf19d4e01c5e28ae77c50`; V7.16 `thermal-consumer-release-hold.v1.json` | Único candidato futuro **não instalado**, HOLD |
| Motor embalagem em uso/pin de integração | Academia blob antigo `3167c309f02a0ad5a84fb43043b8866e3bee873c`, pin explícito no PR #38 | NÃO considerar sincronizado ao PR #50 |
| Motor com correção Kids/Tataki | Academia PR #50 `lib/packaging-current.js` blob `a3c04daa3dd4906c2d1db1d80e20fb378f2c7ed6` | CÓDIGO PRÓPRIO DA ACADEMIA, CI específico aprovado, HOLD, não repinado |
| Autoridade exata Kids | `human:cesar:2026-10-07:1-combinado-kids-alone-sacola-m`; fonte humana no PR #50 | **Somente 1 Combinado Kids sozinho**, 1 caixa 750, 1 Sacola M, 1 Kit Kids. Não generalizar |
| Tataki do pedido 1265 | Academia: `dupla/tataki/duplas`; 1 temaki + 1 dupla = Kit p/1 | Não aplicar regra inventada "temaki+sashimi" |
| Serviço ao vivo/turno | Último checkpoint local às 15h01 de 11/10: 614 eventos, 614 bloqueados, turno DINNER 07/10 expirado | Histórico, NÃO revalidado nesta reconciliação; WORLD_PROVEN=PENDING |

Links: [DeliveryOS PR #38](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/38) · [Issue #35](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/35) · [Academia PR #50](https://github.com/cesarspichencoff-cmyk/tata-academia/pull/50).

## 2. O que **não** deve ser copiado do candidato local

Foi reexecutada em 11/10 uma suíte local antiga com **7 arquivos/123 asserções sintéticas aprovadas**. Ela parte de `live_shadow_consumer_v1.cjs`, enquanto a fonte instalada de referência é o **V2** e o candidato oficial é **V7.14**. Logo **não aplicar o builder local** como substituição de consumer.

Diferença adversarial de Tataki: o builder local insere exceção antes do prefixo `sashimi` e alguns seus testes toleram fallback como categoria `sashimi` quando há classificação conflitante. O PR #50 da Academia exige `UNKNOWN` quando Tataki não tem classificação atual ou há contradição; **preferir o fail-closed mais recente**, não os resultados dos testes locais que aceitam o fallback.

Outra vulnerabilidade herdada: o consumer V7.14 ainda contém `Math.max(1, Number(raw.QTPRODCOMVEN) || 1)` para quantidade. A validação V6.8 bloqueia quantidade bruta inválida no par evento/decisão, porém uma decisão isolada `ready` não é garantia de que o gate V6.8 foi aplicado. **Antes de habilitar qualquer saída**, exigir o validador bruto V6.8 no mesmo fluxo e provar contra zero, frações, negativos e texto; investigar guard no ingresso do próprio consumer em candidato futuro somente após prova de paridade V2. Não alterar a V7.14 pinada silenciosamente.

## 3. Único gate de integração proposto (8 contratos, 23 pares)

**Os oito contratos E2E abaixo são requisitos, não testes executados.** Cada contrato deve receber artefatos originais com hashes e revisão, sem dados sensíveis publicados:

1. Identidade: filial/loja, sequência iFood/Teknisa, `order_key`, `snapshot_hash` e deduplicação.
2. Integridade da quantidade bruta: rejeitar zero, negativos, frações, não numéricos e coação para 1.
3. Classificação canônica: identidade/código, aliases, fonte e status FACT/UNKNOWN; Tataki nunca ganha regra por nome.
4. Praças/roteamento: destino em Sushi/Cozinha/Bar e integridade por linha de produto.
5. Observações/alergias: correspondência por revisão de notas gerais e por item, inclusive `QUERO COM SALMAO` do caso 1265.
6. Embalagens físicas: caixa numérica e agrupamento provado, uma identificação por caixa real e sem inferências para itens extras.
7. Sacolas e kits: tamanho e quantidade FACT com source ref exato; Kids sozinho somente; temaki + dupla sim, temaki + sashimi verdadeiro UNKNOWN.
8. Composição e efeitos: três vias Cozinha/Sushi/Conferência, hashes/renderer/ESC-POS e `print/spooler_write/database_write/fiscal_action/sefaz_call` sempre false.

**23 pares históricos:** número preservado como requisito herdado, mas os 23 pares originais não estão disponíveis nesta auditoria. NÃO fabricar pares, afirmar execução, reutilizar fixtures como se fossem observação real ou declarar 23/23. Obter cópias originais de forma autorizada e somente leitura, com hash, vincular ao gate acima e registrar PASS/FAIL por par.

Replays mínimos esperados:
- 0851: Kids isolado, caixa 750, Sacola M, Kit Kids; replay histórico não prova first-pass.
- 1265: Tataki dupla/tataki em Sushi 1, Temaki em Sushi 2, Sprite no Bar, caixas 240+450, Sacola P, Kit p/1, observação preservada.
- 0934: classificação faltante bloqueia promoção parcial.
- 1839: Tataki classificado e Carpaccio pendente não promovem pedido incompleto a FACT.

## 4. Ordem sem retrabalho

A. **Fonte:** manter PR #50 como implementação Kids/Tataki; resolver Portões geral da Academia (CI do PR #50: 16/16 específicos, 124/124 histórico de embalagens, mas Portões geral FAIL). Não inferir a causa do RED.
B. **Consumidor:** manter V7.14 como único candidato V2, imutável enquanto pinado. Usar V6.8 + V7.14 + locks V7.16, sem migrar automaticamente blob da Academia e sem introduzir outro motor/renderer.
C. **Prova:** executar os oito contratos e os 23 pares em ambiente isolado; comparar base pinada e fonte corrigida somente como hipótese de repin controlado, com diff de comportamento.
D. **Mundo:** pedido NOVO first-pass com turno atual confirmado por autoridade humana prospectiva, usando somente observação passiva. A condição WORLD_PROVEN depende de evidência real e não é substituída por CI.
E. **Separação:** TATÁ OS é custódia de estoque. Compartilhar identidade e evidência por contratos explícitos; não criar efeitos de estoque a partir de tickets.

## 5. Regras de encerramento

`CODE_READY != CI_PASS != SHADOW_E2E_PASS != WORLD_PROVEN != PRINT_ACCEPTED`.
`ACADEMIA_UPSTREAM_RELEASED=NO`; `DELIVERY_SOURCE_REPIN=NO`; `CONSUMER_V714_INSTALLED=NO`; `WORLD_PROVEN=PENDING`.
**Sem merge, deploy, impressão, spooler, mudança fiscal/SEFAZ, alteração de turno, SQL write, cutover ou mudança de processo Windows.**
