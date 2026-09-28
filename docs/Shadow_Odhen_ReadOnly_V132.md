# Shadow Odhen/Teknisa V1.3.2 — preparação read-only

## Estado

**PREPARED_NOT_CONNECTED**

Esta etapa prepara o contrato e os gates. Ela **não** conecta ao Odhen/Teknisa real,
não lê pedidos reais, não instala watcher/serviço e não chama impressão.

Canônico operacional usado:

- V1.3.2
- SHA-256: `D34583F0A743DF9645914BCDFC1010E6D3AEF72AC74D3A4B7B01F81E305B71E4`

## Effect boundary

Proibido nesta etapa:

- POST ou chamada ao endpoint de impressão;
- `/print`;
- escrita em banco;
- alteração de pedido/status;
- ação fiscal/NF;
- instalação de serviço/watch;
- interceptação do Odhen;
- substituição do fluxo oficial;
- cutover.

O módulo `src/shadow/odhenReadonly.ts` é puro: recebe um snapshot já lido e devolve
um contrato mínimo normalizado. Ele não contém cliente HTTP, driver de banco,
fila de impressão ou escrita em filesystem.

## Verdade atual sobre a fonte

### Revalidado no PC do caixa — CAIXA_MOOCA

Fonte revalidada somente por leitura de código/configuração em 28/09/2026:

- raiz real: `C:\TEKNISA\odhen-perifericos`;
- runtime Odhen presente, incluindo `Perifericos.exe`;
- `GET_ALL_DELIVERY_ORDERS` fornece `NRCOMANDA`, `NRCOMANDAEXT` e `NRVENDAREST`;
- `GET_PRODUTOS_PEDIDODLV` fornece `CDPRODUTO`, `NMPRODUTO` e `QTPRODCOMVEN`;
- as rotas `/AllDeliveryRepository` e `/DeliveryRepository` são de leitura;
- `DSOBSDESCIT` e `DSOBSPEDDIGCMD` aparecem no contexto do item no relatório de entrega;
- `TXPRODCOMVEN` é um quarto canal item-level relevante e precisa entrar no scan;
- `DSOBSCOMANDA` é observação do pedido inteiro e o relatório de entrega oficial a imprime como `OBS.:`;
- nenhuma rota read-only já exposta pelo Odhen entrega todas as observações necessárias;
- o caminho de impressão consulta informação adicional e NÃO pode ser usado pelo shadow.

O significado operacional exato de `DSOBSCOMANDA` continua independente do fato de ser order-level.
Conteúdo real ainda não foi lido.

### Verificado no repositório

- DeliveryOS não possuía integração Odhen executável antes desta branch.
- O motor real aceita linhas no contrato
  `{pedido_id,item_nome,quantidade,observacao,horario}` por
  `MOTOR.makeFonteItensFromRows`.
- O parser documental antigo reconhece que observações reais ainda são um gate.

### LAST_KNOWN_STATE — precisa revalidação no PC da loja antes de qualquer live read

Evidência anterior de investigação do runtime indicou:

- raiz Odhen: `C:\TEKNISA\odhen-perifericos`;
- `Perifericos.exe`/Node local;
- impressão por HTTP local com rota `POST /print`;
- fonte candidata de pedidos: `/DeliveryRepository` / `getAllDeliveryOrders()`;
- identificadores: `NRCOMANDA`, `NRCOMANDAEXT`, `NRVENDAREST`;
- produtos: `CDPRODUTO`, `NMPRODUTO`, `QTPRODCOMVEN`;
- produtos do DeliveryRepository não traziam, por si só, todas as observações;
- outra rota/query observada continha candidatos `DSOBSDESCIT`,
  `DSOBSPEDDIGCMD` e `TXPRODCOMVEN`;
- `DSOBSCOMANDA` é order-level no relatório oficial, mas seu conteúdo real continua não lido.

Isto é **LAST_KNOWN_STATE**, não CURRENT_PROVEN. Nenhum desses pontos autoriza conexão.

## Contrato de observações

Nenhuma observação pode desaparecer silenciosamente.

O snapshot de entrada declara:

- `observation_scan_complete=true` somente quando todas as fontes candidatas
  relevantes para aquele pedido foram consultadas;
- cada observação candidata inclui `source_field`, `value`, `scope_hint`,
  `join_proven` e, quando item-level, uma chave de junção;
- observação item-level só é anexada ao item quando escopo e junção estão provados;
- observação order-level só é aceita quando o escopo está provado;
- qualquer candidato não atribuível bloqueia `ready_for_motor`;
- fonte de observação não verificada também bloqueia `ready_for_motor`.

Estados possíveis:

- `SOURCE_NOT_CHECKED`;
- `PROVEN_NONE`;
- `PROVEN_ASSIGNED`;
- `UNKNOWN_UNASSIGNED_CANDIDATES`.

## Privacidade

O normalizador copia somente o necessário:

- identificadores operacionais;
- emissão, quando disponível;
- código/nome/quantidade de produto;
- observações operacionais provadamente atribuídas.

Não copia payload bruto, cliente, telefone, endereço, CEP, pagamento, total ou
outros dados pessoais/financeiros.

## Deduplicação

`dedupe_key` é SHA-256 determinístico do snapshot **normalizado e minimizado**:

- IDs operacionais;
- emissão;
- itens;
- observações atribuídas;
- candidatos não atribuídos;
- estado de completude de observação.

Mesmo snapshot → mesma chave.

Mudança material em item/observação → nova chave.

Isto permite detectar replays/reimpressões sem guardar PII.

## Saída para o motor

Somente `ready_for_motor=true` pode virar linhas para o motor.

A saída é exatamente:

```text
pedido_id
item_nome
quantidade
observacao
horario
```

Ela entra em `MOTOR.makeFonteItensFromRows`.

O shadow não altera regras de praça, caixa, sacola ou kit.

## Gate sintético

`tools/verificar_shadow_odhen_v132.js` cobre:

1. snapshot válido → pronto para motor;
2. item com observação item-level provada;
3. observação de pedido provada;
4. zero vazamento de PII do payload de entrada;
5. zero efeito habilitado;
6. dedupe estável em replay;
7. mudança de observação muda fingerprint;
8. scan de observação incompleto bloqueia;
9. observação sem escopo/join provado bloqueia;
10. quantidade inválida bloqueia;
11. scan completo e vazio pode declarar `PROVEN_NONE`;
12. linhas normalizadas casam no motor real/seed sem regra nova.

Com o repositório instalado:

```bash
npm run build
node tools/verificar_shadow_odhen_v132.js
```

## Próximo gate: SOURCE_REVALIDATION

Probe preparado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\odhen_source_probe_readonly.ps1
```

O probe:
- lê somente código/configuração;
- calcula hashes;
- informa apenas token + arquivo + número da linha;
- não imprime o conteúdo da linha;
- não inicia o Odhen;
- não faz HTTP;
- não consulta banco;
- não lê pedidos;
- não grava arquivo.

Antes de ler qualquer pedido real:

1. conectar apenas ao PC autorizado da loja;
2. conferir que o runtime Odhen atual ainda corresponde ao LAST_KNOWN_STATE;
3. registrar hashes dos arquivos lidos;
4. localizar as funções/queries atuais sem executar escrita;
5. provar a fonte de `NRCOMANDA/NRCOMANDAEXT/NRVENDAREST`;
6. provar a fonte de itens;
7. mapear **todos** os canais de observação;
8. provar escopo e chave de junção de cada canal;
9. provar que nenhuma rotina de shadow chama impressão ou escrita;
10. só então produzir um snapshot read-only minimizado.

Se qualquer item 5–9 falhar:

**SHADOW_SOURCE_BLOCKED**

e não gerar C3.1.

## Gate posterior: LIVE_SHADOW

Mesmo após SOURCE_REVALIDATION, um live shadow deve continuar sem efeito:

`ODHEN READ → MINIMIZE → NORMALIZE → DEDUPE → OBS GATE → MOTOR V1.3.2 → PREVIEW`

Ainda proibido:

- imprimir;
- emitir NF;
- editar pedido;
- escrever no Odhen;
- alterar status;
- instalar watcher permanente;
- fazer cutover.

Produção física continua exigindo autorização separada.
