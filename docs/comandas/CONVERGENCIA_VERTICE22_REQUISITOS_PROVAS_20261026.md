# TATÁ Comanda — fechamento da auditoria de convergência VÉRTICE 2.2
**26/10/2026 · Proveniência consolidada · REVIEW_ONLY / DRAFT / HOLD**

## Decisão humana que prevalece — NÃO reabrir turno
César em 20/10 (documento `docs/COMANDAS_V843_TURNO_DERIVADO_DO_HORARIO_REVIEW_ONLY.md`): “O que muda a operação é o horário” e “Os horários vêm na comanda, não precisa se preocupar com isso”. **Não criar aprovação diária, nova tabela horária, autenticação de troca LUNCH/DINNER ou regra de seleção de impressoras derivada do relógio.** O horário deve permanecer fiel ao pedido. V8.48 desconfirmou que códigos A/B de impressora sejam pares alternativos por turno; na candidata V714, ambiguidades de destino geram `SUSHI1_DUAL_PRODUCTION_ROLE_UNPROVEN`/`SUSHI2_DUAL_PRODUCTION_ROLE_UNPROVEN`, não impressão em ambos nem seleção inferida. Registros legados de `production-service-state.json` com validade antiga são obstáculos do pipeline legado, **não um requisito humano de novo autorizador**.

## Contrato de entrega essencial
Conforme `docs/TATA_COMANDA_ESSENCIAL_V856_REVIEW_ONLY.md`:
- número curto iFood, sequência TATÁ real de 3 dígitos já persistida, produtos, quantidades e observações por item intactos: obrigatórios;
- caixa, sacola e kits: motor canônico da Academia decide; se executado corretamente mas sem prova completa, indicar `A DEFINIR` por campo, sem inventar; motor não executado = `NOT_EVALUATED`, não simular cálculo;
- observação geral fiscal/financeira/alergia sem classificação validada não deve ser reproduzida automaticamente na produção;
- impressão de comanda via Gestor iFood e fiscal via Teknisa são fluxos distintos, já presentes na loja. Nenhum novo efeito físico autorizado.

## Evidências realizadas em 26/10
1. Máquina `CAIXA_MOOCA` identificada diretamente, leitor `TataComandaReader` RUNNING, 2.047 eventos acumulados, consumer 2.047 bloqueados/0 READY. Relatório projetado 25/10: 331 pedidos e 1.378 unidades (não reconciliados como pedidos únicos). Estado legado de turno ainda em 14/10.
2. **Sequência de produção observada sem escrita** em `C:\ProgramData\TataComandaReader\state\tata-sequence-state.json`: schema v1, coleção `bindings` vazia, `next_value=1`, arquivo modificado em 05/10. Portanto, não há sequência TATÁ atribuída pelo estado observado a pedidos atuais. Zero bindings não significa ausência de pedidos no Reader e não autoriza usar `001` fictício.
3. Base publicada PR #107 HEAD `0f1cb197868662794fe4c6af7c0c44028fd3fd23`, ainda não instalada. Na branch isolada `audit/comandas-shift-contract-20261026` foi corrigido teste legado com ausência de `valid_from_local`, 8 negativos; após recuperar V8.43/V8.48 **foi removida a inclusão desse teste de matriz no CI**, pois a premissa de escolher impressoras por turno não é regra aprovada. O teste fica como diagnóstico legado, não portão de aceitação.
4. **G2** fonte histórica de 463 códigos x amostra de 14 CLASSIFICATION_UNKNOWN: 4 correspondências históricas diretas por código, 1 candidata ambígua (Missoshiro possui dois códigos), 1 sem rota na matriz (Cookie Pistache `8.20.11.002.00`), 0 autorizados a classificação automática sem atestado atual. Ferramenta `tools/verificar_comandas_classification_gap_v1.cjs` publicada e executada (PASS), incluída nos dois jobs de CI, ainda não executada na Actions do HEAD exato.
5. **Academia candidata PR #50 HEAD `030b44dabd95c836b38275016512488a98784245`**: 23/23 Kids/Tataki, 124/124 embalagens, kits PASS, 17/17 envelope inválido, 2.048/2.048 fuzz; contrato de integração de pin V8.68 14/14 PASS em computador isolado. Motor em produção mantém Kids sozinho UNKNOWN e Tataki tratado como sashimi, enquanto candidato só libera com classificação completa. PR #50 continua DRAFT/HOLD e ambas Actions do HEAD consultadas estavam FAILURE; logs detalhados não foram acessíveis e não podem ser tratados como sucesso.
6. **Cadeia V2 → V6.8 → motor antigo pinado → duas vias de produção virtuais + conferência virtual** executada num diretório temporário Linux/WSL no Foxxy: 27/27 PASS, usando apenas identidades fictícias. Sem SQL de loja, impressão ou sequence write. Prova sintética, não first-pass real.
7. Contrato de produto essencial offline: V8.55 23/23, V8.56 33/33, V8.58 19/19 PASS. IDs iFood curtos não autenticam UUID e prova de sequência em memória não substitui binding persistido.

## Próxima prova de maior valor, sem repetição
- Capturar **em leitura e com autorização de fonte** a mesma revisão de um pedido iFood real e sua ligação inequívoca ao pedido nativo Teknisa. A origem Gestor e o caminho de produção (impressora A/B) não estão comprovados por identificador exato nos logs anteriores; não usar SENHA, horário, sufixo ou aparência como join.
- Verificar regras e fontes efetivas da sequência TATÁ e do produtor de binding persistido; hoje `bindings=0`. Não reservar `001`, criar sequência de teste na produção, reiniciar serviço, ou imprimir até prova de idempotência com valor exato.
- Provar que V2, V6.8 e motor candidato/atual processam a mesma revisão com origem independentemente autenticada. Se classificação desconhecida, conservar `A DEFINIR`; se destino da impressora é duplo e ambíguo, HOLD físico.
- Somente após prova funcional e avaliação de duplicidade com o Gestor iFood já ativo, preparar proposta de implantação reversível para aprovação humana específica, seguida de papel Epson e aceite óptico separado.

## Contra-regressões irrevogáveis
- Não reiniciar a abordagem de assinatura/aprovação diária de turnos rejeitada pelo usuário.
- Não deduzir roteamento físico por LUNCH/DINNER, nem selecionar os dois destinos A/B sem fonte.
- Não confundir `READY`, SVG/ESC-POS de laboratório, efeito de spooler ou NF fiscal com comanda impressa e entregue.
- Nunca transformar zero bindings em `001` "já confirmado".
- CI de PR #107/#127 ou Academia #50, mesmo verde, **não** prova instalação nem papel.

**Fronteira:** `TEST_PASS` isolado; `LIVE_SOURCE_JOIN=UNKNOWN`; `SEQUENCE_BINDING=NOT_PRESENT`; `DEPLOYED_V2=NOT_PROVEN`; `PHYSICAL_PRINT=NOT_PROVEN`; `HUMAN_ACCEPTED=NOT_YET`. Nenhuma alteração na CAIXA_MOOCA efetuada nesta etapa.

## Atualização final de verificações (26/10/2026)

**Status lido passivamente em CAIXA_MOOCA:** arquivo heartbeat modificado em 26/10 10:27:23 UTC, `RUNNING`, `consecutive_failures=0`; arquivo de status consumidor modificado 10:27:19 UTC, `ready_count=0`, `blocked_count=2047`, `last_error=null`. Serviço vivo NÃO significa candidato pronto. Projetor com última modificação 26/10 02:15:21 UTC, `failed_revisions=0` no arquivo consultado. Não houve reclassificação, leitura de pedido individual ou escrita durante esta inspeção.

**Fontes de classificação (leitura passiva):** cache local de 554 produtos, 14/14 códigos da amostra com identidade exata singular; 3 aliases na configuração, 0/14 códigos cobertos; 13/14 têm rota histórica no arquivo de 463 códigos, Cookie Pistache não tem. Três arquivos/SHAs e limites em `docs/comandas/ORIGEM_CLASSIFICACAO_CAIXA_MOOCA_READONLY_20261026.md`. Esses dados de 05/10 NÃO substituem catálogo vigente, nem autorizam impressão.

**Testes extras:** `tools/verificar_identidade_bytes_v714.js` em Linux/WSL temporário, 36/36 PASS. `verificar_cadeia_positiva_v722_offline.js` 27/27 PASS. O primeiro testa falha fechada contra drift e adulteração; o segundo prova renderização virtual de dados fictícios, não prints na loja.

**Lacuna de CI desta PR:** `deliveryos-thermal-shadow-gate.yml` lista como bases de `pull_request` quatro branches históricos, **não** `fix/comandas-figma-box-count-guard-20261013`, base atual da PR #127; nenhuma execução de Actions associada ao HEAD `bbdfb6a1...` havia sido encontrada na auditoria. Assim, o simples fato de adicionar novo teste ao YAML no HEAD desta PR não comprova que a ação tenha sido executada. Não transformar zero runs em PASS. Autorizar execução hospedada/saldo incluído de maneira controlada antes de promoção, ou manter o teste local como evidência de menor nível.

### Portões ainda não satisfeitos
1. Pedido real: fonte iFood e Teknisa independentes com mesma unidade/dia/identidade e composição, além de observações íntegras (não apenas envelopes derivados).
2. Sequência TATÁ: identidade persistida e não duplicável vinculada à mesma revisão; arquivo observado na CAIXA_MOOCA `bindings=[]`, `next_value=1`.
3. Categoria/praça: correspondência versionada, atual e comprovada entre origem nativa, motor aprovado e decisão; 14 códigos ainda sem autorização de promoção; dual A/B continua sem papel comprovado.
4. Implantação reversível: prova de supervisão, exclusividade de geração, integridade das oito fontes e rollback em Windows descartável; aprovação específica antes da troca de serviço.
5. Efeito físico: três vias Epson legíveis, sem duplicar produção já impressa pelo Gestor iFood, fiscal segregado, conferência e aceite operacional humano em janela segura.

**Veredito adversarial:** offline `TEST_PASS` para recortes relevantes; `WORLD_PROVEN=false`; `PHYSICAL_ACCEPTED=false`; portanto **ainda não 10/10**. Não exigir nova aprovação diária de turno, pois contraria César V8.43 e não é requisito material.
