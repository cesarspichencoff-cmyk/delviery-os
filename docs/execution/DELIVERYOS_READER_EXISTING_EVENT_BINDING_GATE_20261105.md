# Delivery OS Itaim — vínculo de checkpoint a evento nativo já emitido

**Data:** 05/11/2026. **Foco:** L1/8 — validação do Reader V2 existente. **Estado:** N2/N3 ainda `HOLD`, 0/8 aceites de campo. PR Delivery OS #137 aberta em DRAFT/HOLD; PR Comandas #135 também DRAFT/HOLD. Nenhum programa, consulta SQL, impressão, processo, janela ou serviço do `CAIXA_MOOCA` foi iniciado ou alterado nesta verificação.

## Evidência material obtida sem abrir pedidos

Através do conector remoto **somente de arquivos**, o checkpoint já existente `C:\ProgramData\TataComandaReader\state\reader-watch-checkpoint-v1.json` foi lido **como metadados**, processado dentro da chamada e reduzido a agregados. Nenhuma chave individual ou texto de cliente foi publicado no chat/GitHub.

- Esquema `deliveryos.tata-reader-continuous-checkpoint.v1`, `bootstrap_complete=true`, **250 entradas**.
- **250/250** chaves de quatro partes, exclusivas, no escopo `CDFILIAL=0001`, `CDLOJA=01`; horários textuais formatados e ordem do checkpoint descendente; **250/250** hashes SHA-256 no formato hexadecimal maiúsculo, com estabilidade `>=2` e `emitted_hash===snapshot_hash`.
- Foi escolhida **uma única** revisão estabilizada pelo checkpoint, sem expor seu identificador. O nome correspondente foi reconstruído a partir do padrão do watcher V2 instalado `NRCOMANDA + '_' + SHA256 + '.json'`, sob a pasta pré-existente `state/reader-events-v1`. O conector `get_file_info` confirmou `isFile=true` e **5.227 bytes** para o arquivo selecionado. **Seu conteúdo NÃO foi lido**.
- A seleção reconcilia **checkpoint local ↔ nome de arquivo já emitido** em nível de metadados, e **não** autentica a origem SQL, a veracidade do conteúdo, o hash dos bytes internos, a atualização real do pedido, o escopo `DLV_IFO` ou a completude de itens/observações. As 250 entradas não representam 250 pedidos atualmente ativos.

## Código versionado e teste

- `runtime/reporting/native_reader_existing_event_binding_v1.cjs`: função pura, sem `fs`, rede, SQL, stdout ou efeito operacional. `selectOne(checkpoint)` valida todas as entradas antes de selecionar uma revisão estabilizada e emitida; retorna um **descritor PRIVADO**, com chave/caminho potencialmente identificadores que **não devem ser registrados ou publicados**. `reviewOne(checkpoint,event)` confere chave/hash do evento fornecido contra a seleção e utiliza o recibo sanitizado N2/N3 já existente; nunca retorna o descritor nem conteúdo de observações, e conserva `state=HOLD`, `ordersPublishable=0`, `sourceVerified=false`, `completeSqlReadVerified=false` e `sourceFreshnessVerified=false`.
- `tests/reporting/run-native-reader-existing-event-binding-tests.cjs`: **16 casos sintéticos** sobre evento fictício, incluindo alteração de quantidade/hash, identidade de revisão, duplicidade, escopo errado, chave com `../`, desordem do checkpoint, falta de emissão, timestamp inválido e claims artificiais de origem.
- A tentativa de adicionar um novo passo ao workflow por alteração de `.github/workflows/deliveryos-silent-fixture-windows.yml` foi **bloqueada pelas configurações de segurança**; o workflow **não foi alterado**. Usou-se a entrada de testes já permitida `tests/reporting/run-native-reader-n2n3-sanitized-receipt-tests.cjs`, que agora executa a nova suíte após a suíte N2/N3 existente, sem ampliar permissões do GitHub Actions.
- [GitHub Actions #41974771649](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41974771649), commit `cb4549ccc160249e16a9091f51599c52a5e4788f`: **completed/success, 4/4 jobs**, com `NATIVE_READER_N2N3_SANITIZED_RECEIPT_PASS 11/11 SYNTHETIC_ONLY` e `NATIVE_READER_EXISTING_EVENT_BINDING_PASS 16/16 SYNTHETIC_ONLY`. Prova de testes não equivale a execução de algoritmo no caixa.

## Diferença técnica adicional que importa

O V2 seleciona `TOP (@top)` **comandas na CTE** antes do join de itens; isso não divide diretamente linhas da mesma comanda, porém o limite `TopOrders=50` pode deixar outras comandas sem observação. O código da PR #135 altera filtros/desempates e ordenação das observações, podendo mudar hashes sem alteração de negócio, além da diferença PowerShell↔Node. **Não** classificar automaticamente hash migrado como nova revisão operacional.

A PR #135 registrou 30 lotes adicionais do Reader V2 entre 01h37 e 02h08 BRT do dia 05/11, todos OK e sem crescimento do total histórico de 540 lotes com falha; isso prova atividade no intervalo, não ausência de falhas no almoço/jantar ou completude de uma revisão SQL.

## Próximo gate para mudar L1

1. Um canal **explicitamente autorizado e comprovadamente silencioso** deve operar **na máquina**, sem exportar o evento bruto/observações, e conferir uma única revisão existente a partir do descritor privado. O código atual **não é** um instalador, serviço ou executável autorizado para o caixa.
2. Em caso de comparação local, preservar distinção entre hash legado uppercase, divergência de serialização, mudança de ordem de observações e alteração efetiva do pedido. Produzir apenas `HOLD` e contagens/estados sanitizados.
3. Uma testemunha independente precisa demonstrar escopo `DLV_IFO`, leitura completa de itens/observações, isolamento da revisão SQL e política de horário. Hash e autoconsistência local **não provam** esses requisitos.
4. Só após autorizações e evidências distintas reconsiderar publicação na Home e aceite L1.

**Classificação rigorosa:** `CODE_READY + CI_PASS` para vinculação pura; `FIELD_METADATA_BINDING_OBSERVED` para o arquivo existente; `EVENT_CONTENT_READ=NO`; `N2_N3_FIELD_COMPLETE=NO`; `L1=PARTIAL`; `V1_ACCEPTED=0/8`. Nenhum deploy, merge, instalação, comando, impressora, spooler, Edge, login ou SQL alterado.
