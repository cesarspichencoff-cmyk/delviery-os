# TATÁ Comanda — Validação convergente V8.60 (DRAFT/HOLD)

**Regra:** testes verdes não provam pedido real, autenticidade da origem nem impressão física. A autoridade operacional final é César. Qualquer prova ausente ou conflitante implica HOLD. Este documento não é autorização para instalar, imprimir, fazer merge/deploy/cutover ou alterar serviço, SQL, sequência, SEFAZ ou spooler.

## Etapas em ordem de custo e prova independente

| Gate | Pergunta decisiva | Prova exigida |
| --- | --- | --- |
| G0 Código e motor | O código executado é exatamente o aprovado? | SHA do motor e catálogo privados antes de execução, branch/commit exatos e dois jobs CI íntegros |
| G1 Par evento/decisão | Mesma chave de quatro campos, hash/fingerprint e observações sem perdas? | V8.57 recompõe hashes e conteúdo; V8.59 verifica contagens/notas; V8.60 confronta os dois sobre o mesmo evento |
| G2 Fonte | Os dados vieram do Reader e da origem efetiva da loja? | Auditoria independente e passiva, versão da fonte e instante da captura; hash interno sozinho NÃO prova SQL |
| G3 Mapeamento | Cada código da Teknisa corresponde a um único produto Academia vigente naquela loja? | Crosswalk com evidência das duas fontes atuais, versão do catálogo e zero conflitos/aliases inferidos; 463 códigos históricos do Itaim não provam Mooca |
| G4 Embalagem | Caixas, sacolas e kits saem do motor canônico? | Repetição com bytes privados originais, quantidade exata, estações, distribuição comprovada, reconciliação produção/conferência |
| G5 Sequência | O número TATÁ já está persistido e sem colisão? | Estado somente leitura de loja+dia, um vínculo exato por pedido e zero números inventados |
| G6 Tickets virtuais | Duas vias produção e uma conferência refletem o mesmo pedido? | Golden ESC/POS/SVG com nomes, quantidades, notas, rota, caixa e identificadores coerentes |
| G7 Dupla impressão | GP e sidecar nunca imprimem duas vezes sob retry, concorrência e falha? | Recibos independentes, identidade idempotente, reinício controlado em simulação; estado incerto mantém HOLD, sem retry cego |
| G8 Papel físico | A impressora real entregou três vias corretas e legíveis? | Piloto Epson separado e autorizado, operador presente, inspeção real, controle de GP e aprovação humana |

## Testes repetíveis sem a CAIXA_MOOCA

**Verificação cruzada V8.60:** tools/verificar_validacao_convergente_v860_windows.cjs é executada SOMENTE no CI Windows descartável. V8.57 (oráculo de hash, fingerprint e semântica) e V8.59 (PowerShell nativo, notas e sequência) analisam o MESMO par sintético. Um candidato aceito apenas estruturalmente por V8.59 não é promovido a conteúdo autêntico. Teste com hash adulterado, fingerprint adulterado e campo de observação inventado prova o bloqueio no controle mais forte.

**Motor original:** tools/verificar_contrato_embalagem_v1_private_replay.cjs recebe arquivos privados autenticamente pinados, sem publicá-los na PR. Há testes de caixas, sacolas, kits, duplicidade e quantidades.

**Formato Teknisa:** 463 códigos do arquivo histórico de roteamento ITAIM são teste de sintaxe somente; a correspondência com Mooca é UNKNOWN até leitura real.

**Não efeitos:** CI não acessa impressoras, GP, loja, SQL, spooler, serviços ou sequências operacionais.

**Evidência de tentativa V8.80:** uma declaração de rejeição antes da criação do job só permite classificar `PROVEN_NO_EFFECT_FAILURE` quando não existe job e não existe nenhum status de job. Qualquer contradição (`rejeitado` + job existente, ou status sem job) e qualquer status de job/impressora não reconhecido resulta em `EFFECT_UNKNOWN_REQUIRES_RECONCILIATION`, bloqueia avanço fiscal e proíbe retry automático. O classificador é lógica offline: ele não coleta o spooler e não torna a origem da observação independente por si só.

**Testemunha de tentativa V8.82:** o contrato assinado vincula loja, hash do pedido/reserva/conteúdo/origem, intenção, tentativa, rota, coletor, emissor, revisão, nonce e janela temporal. O coletor deve ser diferente do emissor e a classificação V8.80 é recalculada a partir dos fatos assinados. Mesmo com assinatura e vínculos válidos, o resultado é somente `SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY`: custódia independente, domínio de falha separado, papel físico e ausência de efeito continuam não provados; impressão, reimpressão, avanço fiscal e retry automático permanecem bloqueados. Ver `PRINT_ATTEMPT_WITNESS_V882_REVIEW_ONLY.md`.

**Preview do coletor V8.83:** o normalizador PowerShell roda apenas sobre fixture sintética contida no `RUNNER_TEMP` do GitHub Actions Windows. Ele não possui modo live nem APIs de spooler, impressora, serviço, CIM, event log, rede ou assinatura. A saída sanitizada é um candidato V8.82 não assinado; identidade efetiva, separação de processo, custódia, papel e ausência de efeito permanecem falsas. Ver `PRINT_ATTEMPT_SOURCE_COLLECTOR_V883_REVIEW_ONLY.md`.

**Fronteira de acesso V8.84:** uma fila Windows não é tratada como fonte estritamente read-only porque `PRINTER_READ/WRITE/EXECUTE` incluem `PRINTER_ACCESS_USE`, que também permite operações básicas de impressão. A rota direta ao spooler fica bloqueada. Somente uma proposta offline para leitura limitada de um canal PrintService/Operational já habilitado pode avançar a revisão, ainda sem provar SID/token/ACL reais, vínculo não sensível da tentativa, coexistência GP/Teknisa, papel físico ou autoridade operacional. Ver `PRINT_SOURCE_ACCESS_V884_REVIEW_ONLY.md`.

**Metadados efêmeros V8.85:** o próximo recorte consulta somente `Get-WinEvent -ListLog` no runner Windows hospedado e descartável do GitHub Actions, com canal exato, job limitado a dez segundos e saída sem SDDL/SID/host/usuário. Nenhum registro ou evento 307 é lido. Mesmo canal presente/habilitado e hash de descritor mantêm `HOLD`: o runner não prova ACL, token, host operacional, GP/Teknisa, tentativa ou papel. Ver `PRINTSERVICE_METADATA_V885_EPHEMERAL_REVIEW_ONLY.md`.

**Alvo operacional V8.86:** o candidato seguinte exige nome local exato `CAIXA_MOOCA`, desafio de frescor e recibo externo do mesmo dispositivo. Ele corrige a taxonomia de efeitos da V8.85: processo/job, relógio, identidade/token e tentativa de leitura da configuração são atividades observacionais declaradas, enquanto registros, evento 307, spooler, impressão, GP/Teknisa, arquivos da aplicação, serviços, fiscal e sequência permanecem proibidos. A execução real segue `NOT_RUN` enquanto o conector oferecer apenas `Foxxy`. Ver `PRINTSERVICE_METADATA_V886_TARGET_BOUND_REVIEW_ONLY.md`.

## Próximo passo seguro quando o host reaparecer

Para a frente de impressão, executar primeiro e exclusivamente a inspeção de metadados V8.86, somente quando o conector identificar diretamente `CAIXA_MOOCA`; parar em `HOLD` sem ler registros. A inspeção V8.59 do Reader é uma frente separada, sem autorização implícita nesta etapa: se vier a ser executada, deve permanecer sem CLI de fixture (parâmetro `CiFixtureRoot` só em runner GitHub), limitar a saída a contagens e códigos de bloqueio e não copiar nomes de clientes, notas, IDs ou hashes para discussão pública. Se o host não estiver diretamente acessível, registrar `UNKNOWN`/`NOT_RUN`.

## Autorização específica antes do piloto

Somente solicitar autorização de César após G0–G7 comprovados sobre a mesma revisão e loja. Definir janela, operador, escopo, impressora, bloqueio de duplicação GP, retorno ao estado anterior e critérios de interrupção. Não aplicar mudanças no serviço ou imprimir como parte de preflight. Divergência de nota, alergênico, código, número, spooler ou saída física implica SAFETY_STOP/HOLD.

**Atenção à prova de impressão:** estado Epson ASB ou DLE EOT informa condições da impressora (por exemplo, papel/erro), não é recibo transacional de impressão nem confirmação visual do papel.

## Pesquisa metodológica externa

- Contratos consumidor/provedor: https://docs.pact.io/
- Pirâmide de testes/contratos: https://martinfowler.com/articles/practical-test-pyramid.html
- Status Epson GS a ASB: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_la.html
- Status Epson DLE EOT: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/dle_eot.html

**Fronteira:** CODE_READY e TEST_PASS offline não são WORLD_PROVEN, DEPLOYED nem HUMAN_ACCEPTED. PR #107 continua DRAFT/HOLD.
