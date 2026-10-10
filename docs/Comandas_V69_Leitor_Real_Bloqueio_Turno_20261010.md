# DeliveryOS V6.9 — inspeção passiva do leitor e bloqueio de turno em CAIXA_MOOCA

**Observado em:** 10/10/2026, 13:06:57 UTC, dispositivo autorizado `CAIXA_MOOCA`.  
**Modalidade:** inspeção de estado e arquivos existentes, SEM escrita, mudança de serviço, consulta SQL, impressão, deploy, merge ou atualização de sequência.  
**Status de prova:** mundo real somente para existência, coerência de pares e motivo do bloqueio selecionado; V6.9 continua apenas em código de PR e testes offline.

## Evidência observada (sem identificadores de clientes)

| Checagem | Evidência |
| --- | --- |
| Serviço `TataComandaReader` | `Running` |
| Diretório `reader-events-v1` | 1.187 arquivos de eventos |
| Últimos 12 pares verificados | 12/12 com esquema nativo esperado e `order_key`/`snapshot_hash` compatíveis entre evento e decisão |
| Prontidão desses 12 pares | 0/12 `ready`, sem autorização de imprimir |
| Último timestamp **de arquivo amostrado** | 10/10/2026, 02:19:36 UTC — não comprova processamento posterior nem falha permanente |
| Conteúdo de observações por item no evento v1 | Ausente, como previsto pelo contrato de origem |
| `shadow-consumer-status.json` da leitura | `RUNNING`, `processed=0` na instância observada, sem erro registrado; não extrapolar isso para contagem histórica |
| Arquivo nativo `production-service-state.json` | `schema=v2`, filial `0001`, `service=DINNER`, `operational_date=2026-10-07`, `valid_until_local=2026-10-07T23:59:59`, `evidence=HUMAN_CONFIRMED_RULE`, `clock_inference_used=false` |
| Um par real adicional inspecionado | Pedido aberto em 09/10/2026 às 23:01:08 (horário local); evento e decisão **bloqueados** com `SERVICE_STATE_DATE_MISMATCH_ORDER_DATE`, `SERVICE_STATE_EXPIRED_FOR_ORDER`, e `SERVICE_REQUIRED_SUSHI1` |

**Interpretação limitada:** a configuração de turno confirmada no serviço estava desatualizada para o pedido de 09/10, e o leitor corretamente deixou o roteamento dependente do turno sem aprovação. Não é prova de defeito no ESC/POS, nas caixas ou na regra de SKIN; tampouco comprova que o watcher esteja parado. A configuração não deve ser revalidada por mera inferência do horário nem reproduzida automaticamente para outro dia.

**Proteção de dados:** nenhum nome de cliente, observação original, número de pedido ou conteúdo bruto das 1.187 comandas foi enviado ao repositório. A evidência original continua no diretório autorizado do computador; não foi copiada ou modificada neste trabalho. O hash de conteúdo da decisão **não foi** validado independentemente na amostra real; o fato observado é igualdade de revisão e correspondência dos esquemas.

## Correção preparada em código (não instalada)

`tools/auditar_pares_leitor_v69_readonly.js` aceita três fontes locais explicitamente escolhidas: `--events`, `--decisions`, `--shift`. Apenas lê arquivos regulares, não executa subprocessos nem toca SQL, serviço Windows, impressoras, estado ou rede. Resume:
- número de eventos, decisões encontradas e revisões que coincidem;
- fingerprint SHA-256 da decisão pelo algoritmo do consumidor;
- contagem de eventos `ready`, decisões `ready` e pares `ready` **apenas para o shadow existente**;
- classes sanitizadas de bloqueio (sem código de pedido, produto ou texto de cliente);
- incompatibilidade de data/validade de turno para cada evento;
- últimos pares somente como resultados anônimos.

`tools/verificar_auditoria_leitor_v69.js` exercita ausência de decisão, estado vencido, adulteração de fingerprint, ausência de inferência automática e **preservação literal dos bytes/mtime** dos arquivos de entrada. CI mandatória no PR #38.

### Efeito operacional necessário (não executado)

Para futuras comandas do turno correspondente se tornarem elegíveis ao shadow, será necessária uma confirmação humana **atual e específica** do turno (almoço/jantar, data operacional, filial e validade), seguida de atualização **autorizada e auditável** do `production-service-state.json` pela rotina apropriada. O leitor não deve deduzir turno pelo relógio. Mesmo depois da confirmação, a V6.8 ainda precisa de provas de observações por revisão e de classificação/rota antes de aceitar as três vias; nenhuma impressão é liberada.

## Estado

- **WORLD_OBSERVED:** arquivos reais pareados, estado de serviço, e causa da amostra bloqueada.
- **CODE_READY / TEST_OFFLINE:** auditoria V6.9 para execução futura com fontes autorizadas.
- **UNPROVEN:** cobertura dos 1.187 pares, integridade de todos os fingerprints reais, observações do último pedido, prévia tridirecional do pedido vivo, prova física Epson.
- **Effect boundary:** `NO_PRINT`, `NO_DEPLOY`, `NO_MERGE`, `NO_SERVICE_STATE_UPDATE`, `NO_SEQUENCE_BIND`.
