# TATÁ Comandas — observação geral: vinculação dos arquivos originais na sombra

**07/11/2026 · Etapa 3 · PR #135 · revisão e testes offline sem efeito físico.**

## Falha concreta identificada

A cadeia `runNativeChainV1` aceita uma declaração `note_disposition_claim` de revisão humana para omitir uma observação geral `DSOBSCOMANDA` **somente nas vias virtuais**. O requisito humano é legítimo: uma observação pode conter informação financeira ou cancelamento que não deveria sair na comanda física, mas também pode conter instrução importante ao preparo. Na ausência de revisão precisa, a via fica bloqueada.

O contrato anterior exigia `event_file_sha256` e `decision_file_sha256` no claim, porém só conferia que cada um *parecia* SHA-256 hexadecimal; não os comparava a bytes de arquivo. Isso possibilitava declarar hashes arbitrários no claim e ainda excluir uma observação no ambiente sombra. Não concedia impressão, mas escondia uma lacuna de vínculo.

## Correção nesta PR original

- A declaração **não exclui mais a observação** se o chamador não entregar, em memória, `note_source_file_pair: {event_json,decision_json}`, representando os dois textos JSON brutos de origem. Entradas ausentes, não textuais, com campos extras ou acima do limite de 2 MiB por JSON falham fechadas.
- Para cada documento, o SHA-256 dos bytes UTF-8 fornecidos deve corresponder exatamente ao hash declarado, **sem substituição por `snapshot_hash` ou `fingerprint`**, que pertencem a domínios semânticos diferentes.
- Ambos os documentos devem ser JSON válido e representar exatamente os objetos `event` e `decision` usados na cadeia. A igualdade é estrutural depois de `JSON.parse`, de forma que formatação/whitespace legítimos não obrigam falsamente à identidade byte-a-byte entre dois estilos de serialização.
- **Nunca** são retornados valores das observações, documentos, hash de arquivos privados, SQL, PII ou detalhes dos arquivos originais na mensagem de erro. O objeto de retorno mantém `physical_effect_authorized=false`, `paper_proven=false` e `effects.print=false`.
- Os testes incluem: ausência de ambos arquivos, arquivo omitido, campos extras, hash arbitrário, whitespace alterado, objeto correto com bytes distintos, arquivo com JSON inválido e evento/decisão diferentes com hashes recalculados.

**O que isso não comprova:** os bytes fornecidos continuam sendo **não autenticados externamente**. O teste não lê arquivo no caixa, não verifica assinatura de origem, não confirma revisão SQL completa, não atesta interpretação humana da observação e não autoriza uso operacional. Qualquer integração real exigirá autenticação e revisão independente da fonte. O único cenário positivo continua sendo **sombra**, sem imprimir e sem alterar a via nativa da Teknisa.

**Gates mantidos:** `ETAPA_3=EM_ANDAMENTO`; `SOURCE_FILE_AUTHENTICITY=UNKNOWN`; `SQL_SEMANTIC_COMPLETENESS=UNKNOWN`; `CONFERENCIA_FISICA=UNPROVEN`; `PRINT=HOLD`; `CUTOVER=HOLD`. A PR #135 continua em rascunho.

### Continuidade

Testes: `tools/verificar_comandas_cadeia_nativa_v1_offline.cjs` dentro da CI original. O resultado só se torna prova de laboratório após conferir **run e SHA exatos**, em Linux e Windows. Não iniciou tarefa/SQL/PowerShell/CMD, serviço, impressão, merge ou deploy no CAIXA_MOOCA.

## Fechamento do contrato byte a byte

O arquivo `tools/comandas_cadeia_nativa_v1_offline.cjs` integra a candidata de homologação pinada. Portanto, **nenhuma alteração de código pode ser aceita com a impressão digital antiga**. A atualização de segurança exige republicar na MESMA PR draft a entrada exata do manifesto `CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json` com o novo blob `52d6e66715287f8db027685996d5f79a1ecd9a02` e seus 21.273 bytes; incluir `node:util` no conjunto de bibliotecas internas e refletir o blob do manifesto no manifesto dependente da Conferência V2. Nenhum módulo instalado ou motor da Academia foi alterado. Esses registros são identificadores de artefatos de laboratório e **não** uma promoção operacional.

Uma CI que falhe por divergência do manifesto é um bloqueio correto, não defeito a ser contornado. A validação deve verificar novamente a clausura total, a mesma identidade byte a byte e a lista de capacidades proibidas, nos dois sistemas. `PRINT=HOLD` e `CUTOVER=HOLD` permanecem.
