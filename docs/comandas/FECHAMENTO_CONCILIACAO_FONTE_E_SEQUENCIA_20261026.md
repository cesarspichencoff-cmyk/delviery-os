# TATÁ Comanda — conciliação e sequência (26/10/2026)

**Escopo:** REVIEW_ONLY / DRAFT / HOLD. Somente desenvolvimento isolado e leitura passiva autorizada. Nenhuma alteração na CAIXA_MOOCA, no Gestor iFood, no banco SQL, no spooler, no fiscal ou nas impressoras.

## Decisão humana vigente

Em 25/10, César confirmou que a impressão de comandas do Gestor iFood estava DESATIVADA. A impressão simultânea foi uma contingência excepcional em dias anteriores de erro; não é o modo normal. Não reiniciar a hipótese de duplicidade recorrente nem inferir saída de papel a partir de um processo Windows aberto.

O relatório detalhado fornecido tem a granularidade máxima que o iFood permite: 314 linhas, UUID, código curto, horário, situação, modalidade e valores, sem itens nem quantidades. Não pedir novamente uma exportação inexistente.

## Provas independentes do dia 25/10

- 317 registros DLV_IFO na Teknisa 0001/01, 12 DLV_NMO, 2 DLV_FOS = 331 DLV do leitor.
- 311 códigos curtos únicos presentes em ambas as fontes, três apenas no iFood, seis apenas na Teknisa.
- Os três apenas no iFood constam como concluídos na exportação. Pesquisa literal nas filiais visíveis de 23 a 26/10 não os encontrou; variantes com zeros à esquerda também foram consultadas para a unidade no dia 25/10, sem resultados. Uma tentativa de normalização numérica ampla falhou e NÃO é prova válida.
- Dos seis apenas na Teknisa, quatro têm situação nativa 4, um P e um X. Não atribuir significados não comprovados a esses códigos.
- Nos 317 DLV_IFO não foi observado UUID de 36 caracteres nos seis campos candidatos consultados. Isso não exclui outras tabelas ou fontes; logo o vínculo UUID completo permanece UNKNOWN.
- A exportação não permite verificar a igualdade dos itens ou quantidades com o SQL. A fidelidade SQL -> Reader foi comprovada em uma amostra separada de revisões, oriundas da MESMA fonte.

## Código consolidado

A ferramenta tools/comandas_reconciliacao_fontes_v1_offline.cjs complementa, sem substituir, o V8.55: recebe dois conjuntos já normalizados, restringe data, loja e origem e informa apenas contagens e razões de retenção. Preserva zeros à esquerda e detecta UUID inválido/repetido, curto duplicado, loja/dia divergentes, dados ausentes e origens incorretas. Não exibe UUID nem IDs individuais, não acessa SQL e jamais declara prontidão para imprimir.

A suíte tools/verificar_comandas_reconciliacao_fontes_v1_offline.cjs executou 20/20 PASS no Foxxy isolado, inclusive 314 x 317 artificiais com 311/3/6 e colisões adversariais. O validador anterior V8.55 passou 23/23. Dois jobs (Linux/Windows) da workflow candidata contêm a nova verificação; resultado hospedado no commit exato ainda NÃO provado.

## Segurança da sequência

O mecanismo existente tools/tata_sequence_atomic_bind_v1.ps1 aceitava AuthorizationId fornecido pelo chamador. Isso não autentica autorização humana independente. Na candidata, o modo Commit agora é bloqueado por COMMIT_DISABLED_NO_INDEPENDENT_AUTHORIZATION_GATE, e a prévia não abre ou cria arquivo .lock. Nenhum 001 foi reservado na operação.

Um teste descartável Windows foi acrescentado para demonstrar: prévia sem escrita, commit autoautorizado recusado e ausência de persistência após repetir a prévia. O Foxxy bloqueou a execução do arquivo por sua política de PowerShell. O teste NÃO foi contornado. Os dois arquivos passaram na análise sintática, com zero erros; runtime PASS desse teste permanece UNKNOWN. A etapa de execução foi incluída no job Windows do workflow candidato.

## Limites e próximos portões

1. Investigar as três exceções concluídas no iFood, sem alegar entrega falha ou perda financeira.
2. Determinar semântica e recorte das seis entradas exclusivamente nativas; não considerar X cancelamento.
3. Confirmar mapeamento de unidade e identificação forte UUID -> pedido nativo, ou documentar aceitação humana do contrato de menor autoridade, sem automação de impressão.
4. Validar classificação/praça vigentes, sequência TATÁ persistente com permissão independente e idempotência, integração V2/V6.8, exclusividade de serviço, CI hospedada e rollback.
5. Confirmar emissor real no dia do piloto; testar papel/3 vias sob autorização separada, sem dupla via ou interferência no fiscal.

A PR #50 da Academia permanece com workflows hospedados em falha. Os logs desses jobs não estavam mais acessíveis e não permitem causa confirmada; testes isolados anteriores não substituem a CI. Não mesclar ou implantar por inferência.

**Fronteira de verdade:** código candidato e testes offline avançaram; 311 vínculos apenas por ID curto/dia; sequência real ausente no estado observado; sem papel nem aceite operacional. NÃO 10/10.
