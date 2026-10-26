# TATÁ Comandas — auditoria de bloqueios e reuso do motor Academia (26/10/2026)

**Status:** REVIEW_ONLY / DRAFT / HOLD. Documento de rastreabilidade; não autoriza merge, deploy, instalação, alteração de turno/serviço, escrita em SQL, sequência, spooler ou impressão.

## Fontes atuais verificadas

- `CAIXA_MOOCA` online, hostname confirmado exatamente por consulta local via Desktop Commander, sem alterar arquivos.
- Serviço Windows `TataComandaReader` RUNNING; executável `TataComandaReader.ContinuousService.exe`, início observado em 22/10/2026, 21:39 (São Paulo).
- `state/reader-heartbeat-v1.json` (leitura 26/10, ~02:46 BRT): lote anterior OK, 0 falhas consecutivas, 2.047 eventos emitidos acumulados; efeito declarado: nenhuma impressão/escrita no banco operacional.
- `evidence/shadow-consumer-status.json`: 2.047 processados, 0 ready, 2.047 blocked, 2.047 envelopes de relatório; valores agregados acumulados, não pedidos únicos do dia.
- `state/reporting-v1/current/index.json`: projeção de 25/10 com **331 pedidos, 1.378 unidades**; indicador gerado, não reconciliado com fechamento independente da loja; valores financeiros nulos.
- `state/production-service-state.json`: data 14/10/2026, turno LUNCH, validade 11h–15h do próprio dia. Este estado está vencido para 25/10. Não foi atualizado.
- SHA-256 do `shadow/packaging-current.js` no host: `1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e`, 82.858 bytes; corresponde ao motor pinado do Comandas já citado no contrato #107, **não** equivale automaticamente ao motor novo proposto na Academia.
- Comandas PR #107: HEAD `d9846910bc391bdb801c4a509a039ca138ba6824`, branch `fix/comandas-figma-box-count-guard-20261013`, DRAFT/HOLD. CI atual no HEAD: Actions #40238482750 SUCCESS (Windows + Linux), prova offline.
- Academia PR #50: HEAD `030b44dabd95c836b38275016512488a98784245`, branch `fix/thermal-kids-tataki-source-20261010`, DRAFT/HOLD. Git blob de `lib/packaging-current.js` no HEAD `3262430da7464f2f8bc0058a75dbd5fe2efe8250`. Workflows do HEAD: Actions #39936786816 FAILURE e #39936786868 FAILURE. Não houve análise conclusiva dos logs: download da fonte falhou. **Não repinar, instalar ou promover**.

## Diagnóstico anonimizado de 200 DECISÕES recentes

Leitura somente em memória de até 200 arquivos `*.decision.json` do diretório local `state/reader-shadow-decisions-v1`, ordenados por data de modificação decrescente; **não são necessariamente 200 pedidos únicos**, nem amostra aleatória. Nenhuma nota, PII, corpo integral de pedido ou identificador foi exportado.

- 200/200: `UPSTREAM_SERVICE_STATE_DATE_MISMATCH_ORDER_DATE` e `UPSTREAM_SERVICE_STATE_EXPIRED_FOR_ORDER`.
- 35/200: bloqueios **somente** da família turno/serviço, incluindo `SERVICE_REQUIRED_*`.
- 165/200: **pelo menos um** bloqueio de natureza distinta de turno/serviço.
- 100/200: ao menos um `BAG_*`; 86/200 `KITS_NOT_FACT`; 68/200 ao menos um `CLASSIFICATION_UNKNOWN_*`; 38/200 algum `PACKAGING_*`; 2/200 revisão humana de alergênico.
- As classes se sobrepõem. As 200 decisões estavam `ready=false`; não projetar essas proporções para o universo de pedidos da loja.
- Houve 84 linhas de item com `classification.family` ausente na mesma amostra. Isso não prova inexistência da classificação em outra fonte nem autoriza classificá-las pelo nome.
- Exemplo individual foi inspecionado em sessão anterior, mas não é reproduzido aqui por minimização.

## Fronteiras de responsabilidade

1. **Reader/turno (Comandas):** autorização prospectiva de dia, janela e loja com custódia independente. O motor de embalagens da Academia **não** pode assinar turno, corrigir data retroativamente ou tornar `ready=true` por si.
2. **Identidade e classificação (Teknisa↔Academia):** crosswalk exato de `CDPRODUTO`, código canônico, quantidade positiva e classificação aprovada por linha. Se faltar classificação/revisão autenticada, permanecer UNKNOWN; não inferir pelo nome nem criar `FACT` parcial.
3. **Motor Academia:** calcular caixa numérica, sacola P/M/G, quantidade de sacolas e kits quando as entradas forem autênticas/completas. Preservar confirmação humana de Kids sozinho = 750 + M + Kit Kids e Tataki 1265 = Dupla apenas com `family=dupla`, `subfamily=tataki`, `station=duplas` comprovados. Não estender exceções por analogia.
4. **V2 → V6.8 → três vias virtuais:** usar mesmo snapshot/revisão e fontes independentes. Primeiro prova offline e first-pass read-only na loja, depois decidir piloto específico. CI sintético, arquivo de decisão e SHA autorreferido não provam origem SQL/GP.
5. **Efeito operacional:** nenhum fluxo de impressão/SEFAZ, serviço, spooler, alteração de turno, reserva real de sequência, integração em produção, merge ou deploy foi autorizado nesta auditoria.

## Próximo incremento seguro

- **G0** Reconciliar versões e testes da Academia PR #50; diagnosticar workflows falhos sem mudar pin de produção.
- **G1** Produzir relatório de lacunas de classificação por códigos e cobertura do catálogo real, com evidência independente autorizada; evitar recontar bloqueio por turno como erro de embalagem.
- **G2** Revisar regras já existentes de kits/sacolas em regressões exatas do motor atual e candidato, exclusivamente fora do caixa e sem promover `FACT` por inferência.
- **G3** Projetar custódia de turno com permissões mínimas e prova de origem, sem alterar arquivo na loja.
- **G4** Validar pedido novo na cadeia V2→V6.8→Academia→3 vias virtuais, sem impressão. Só então avaliar autorização separada para piloto operacional.

**Conclusão:** o motor da Academia é fonte canônica de embalagem; não cobre identidade, origem, custódia de turno, idempotência/efeito físico. A sessão recuperou prova de leitura autônoma e de bloqueios, mas não concluiu WORLD_PROVEN de três vias em pedido real. Sem alterações no Windows operacional.

## Lote adicional — 14 códigos canônicos com CLASSIFICATION_UNKNOWN

Nova agregação read-only sobre as mesmas 200 decisões. **Contagens de ocorrências de motivo**, não número de pedidos únicos; nomes abaixo são apenas rótulos observados no Reader, nunca identidade/categoria homologada no catálogo Academia. Nenhuma observação de cliente foi lida/exportada.

| Código canônico | Nome operacional observado | Ocorrências de CLASSIFICATION_UNKNOWN |
| --- | --- | ---: |
| `9.10.05.000.00` | CARPACCIO DE SALMAO | 20 |
| `9.75.00.020.00` | MISSOSHIRO | 12 |
| `9.10.05.060.00` | TUNA SHISSO TARTAR | 9 |
| `9.15.00.060.00` | SALMAO/ATUM 1 PESSOA | 7 |
| `9.10.00.050.00` | SHIMEJI E SHITAKE | 7 |
| `8.00.05.000.00` | COCA COLA 350ML - UN | 4 |
| `8.20.00.061.00` | MOCHI INDIVIDUAL | 4 |
| `9.10.05.040.00` | TARTAR DE ATUM SPICY | 4 |
| `9.10.05.070.00` | CEVICHE | 4 |
| `8.00.00.010.00` | AGUA MINERAL C/GAS - UN | 3 |
| `9.10.05.050.00` | TARTAR DE SALMAO | 2 |
| `9.15.00.070.00` | SALMAO/ATUM 2 PESSOAS | 2 |
| `9.99.00.007.00` | TATA CHOCOLATE | 2 |
| `8.20.11.002.00` | COOKIE PISTACHE | 2 |

**Diferença importante:** o motor Academia já contém regra nominal para Carpaccio (caixa fixa 750), Missoshiro, Tuna Shisso Tartar, Tartar de Atum Spicy e Ceviche (faixa selada 650). O fato de existirem regras nominativas **não** demonstra associação autenticada destes códigos e classificações na unidade nem permite ignorar `review_required`. O próximo delta seguro é conferir, em fonte de catálogo versionada e prova de loja atual, quais dos 14 códigos têm `CDPRODUTO`, classificação e praça aprovadas; só depois executar replays offline contra a mesma revisão.
