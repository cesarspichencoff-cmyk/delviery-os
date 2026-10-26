# TATÁ Comanda — MVP essencial V8.56 (REVIEW ONLY)

**20/10/2026.** Projeto: **TATÁ Comanda**, código atualmente abrigado no repositório `delviery-os`; não chamar este produto de DeliveryOS. PR #107 OPEN/DRAFT/HOLD, sem merge, deploy, instalação, escrita no Windows ou impressão.

## Contrato da primeira entrega — decisão operacional de César
**Nunca A DEFINIR:** **iFood (número curto visível)**, **sequência TATÁ (3 dígitos já vinculados ao pedido)**, **produto completo** e **quantidade exata**, mantendo **observações do pedido/item** sem apagar instruções como SEM/COM e alergias.

**A DEFINIR apenas após tentativa válida do motor:** **caixa, sacola e kit** somente se a execução do motor canônico aprovado sobre a mesma revisão for inconclusiva para o campo específico. Sem executar/autenticar o motor, **não mostrar embalagem e não apresentar `A DEFINIR` como se fosse resultado de cálculo**. Não inventar tamanho, número, distribuição de produtos ou kit. Comprovadamente não aplicável = `NAO SE APLICA`. A prévia *de conteúdo essencial* pode continuar, explicitamente incompleta e sem autoridade de impressão.

**Fiscal separado:** presença/ausência de NFC-e Teknisa não é requisito para ler uma comanda de produção/conferência; não reproduzir, imprimir, alterar, cancelar ou emitir documentos fiscais.

## Reuso, sem sistema paralelo
- `tools/comandas_cruzamento_simples_v855_offline.cjs` identifica **um candidato** de pedido nativo Teknisa por loja/dia/ID curto e confronto da composição, nunca associa por um número curto isolado; duplicidade/contradição bloqueia.
- `tools/tata_comanda_essencial_v856_offline.cjs` consome o resultado **diretamente pelo V8.55** e exige um **vínculo de sequência TATÁ já existente** com `NRCOMANDA`, `NRVENDAREST`, loja, dia, ID curto, referência da captura iFood e identificador de snapshot. Não incrementa, gera ou reserva a sequência. O vínculo é uma **alegação de fonte ainda não autenticada** — a prévia não cria prova operacional.
- O adaptador só produz `preview_lines` e `essential` quando todos os campos críticos são válidos. Número iFood/seq. TATÁ ausentes, produto `A DEFINIR`, nome vazio, quantidade zero/fração, anotação incompatível, cancelamento, colisão de ID curto ou vínculo de sequência de outro pedido = `HOLD` **sem prévia**.
- As linhas são para prévia local, **sem bytes de impressora**, sem API, SQL, sequencial, spooler, instalação, alteração no GP iFood ou deploy. Nunca publicar dados reais de clientes ou pedidos nos testes/PR.

## Limite comprovável
Status `ESSENTIAL_PREVIEW_READY_HOLD` significa **conteúdo mínimo completo na amostra sintética/revisada**, não que o TATÁ Comanda esteja recebendo pedidos do Gestor, não que tenha integrado o leitor real, não que a sequência esteja reservada com idempotência operacional, nem que alguma comanda possa sair em papel.

A trilha de papel continua independente: autorização da impressão nativa do iFood já ativa **não** é autorização para imprimir uma segunda comanda pelo TATÁ. Não alterar essa operação.

## Próximo portão único
Integrar o adaptador ao fluxo read-only de pedido real do **TATÁ Comanda** no mesmo snapshot e na mesma sequência já observada. Somente quando a fonte viva e os vínculos de identidade tiverem sido comprovados, solicitar acesso à máquina apropriada para testar a evidência ainda ausente. O piloto Epson real e eventual ativação exigem autorização específica, diagnóstico de rota e prevenção de impressão duplicada.

**Aceite offline:** `tools/verificar_tata_comanda_essencial_v856_offline.cjs`, 32 negativos e positivos, junto das regressões V8.55, V8.52 e V4.6 em Linux/Windows.


## Pré-teste V8.58 — localizar o bloqueio real antes de acessar o Windows

**Evidência arquivada, não estado atual:** em `data/tata_reader_live_sequence_state_proof_20261005_v1.json`, a produção tinha `binding_count=0` em 05/10/2026, `next_value=1` e `001` **somente disponível**. Os dois vínculos `001/002` foram testados num estado de teste que depois foi excluído. Já `data/tata_sequence_atomic_binder_proof_20261005_v1.json` comprova dry-run real e commit idempotente **somente numa cópia temporária**, nunca no estado de produção. Nenhum destes arquivos prova o estado atual.

**Correção de risco 1:** a prévia nativa V8.57 **não reproduz observações gerais** potencialmente fiscais, financeiras ou de cancelamento. Em vez disso sinaliza `OBS GERAL: REVISAR FORA DA COMANDA (NAO IMPRESSA)` e marca `order_observations_review_required`. Observações vinculadas a itens continuam legíveis na prévia; não há permissão de impressão real. Não inferir que toda observação geral é de produção nem copiar notas de pagamento para a cozinha.

**Correção de risco 2:** `tools/tata_comanda_sequence_preflight_v858_offline.cjs` reutiliza `planDailyStoreTataSequence` do motor existente e `projectReaderEssentials` V8.57. Diante do estado sem binding, calcula uma **possibilidade apenas em memória**, exige conteúdo essencial e revisão íntegros, e retorna `AUTHORIZED_ATOMIC_BIND_REQUIRED` — sem mostrar número falso na comanda, escrever no estado ou imprimir. Somente se o arquivo posteriormente contiver o binding certo, reapresentado e validado por leitura, pode aparecer `EXISTING_SEQUENCE_PREVIEW_HOLD`. O consumo persistente exige autorização explícita separada; algoritmo e teste não a substituem.

**Proteção de regressão:** `tools/verificar_tata_comanda_sequence_preflight_v858_offline.cjs` usa a evidência arquivada de produção com zero bindings, testa em memória a proposta, vinculação idempotente simulada e readback, números reutilizados, colisões e alterações de pedido/itens; executado no workflow Linux/Windows. Não inventar outra rotina de reinicialização diária ou aprovação de turno.

**Decisão econômica:** quando a CAIXA_MOOCA estiver disponível, primeiro consultar *apenas em leitura*, num comando único, se (1) há evento e decisão V2 da mesma revisão; (2) número iFood, produtos e quantidades estão íntegros; (3) há binding real no estado. Se (3) não existe, **não testar impressão**, primeiro propor o uso governado do binder atômico existente em janela segura; não introduzir novo serviço ou nova sequência paralela. Caso o estado exista mas com colisão, parar e preservar o arquivo original. O GP iFood ativo não deve ser alterado.

**A fronteira de sucesso:** nenhum CI, hash próprio ou prova antiga garante 100% a alimentação real do leitor, persistência idempotente no host e saída física. Prova final só depois de teste assistido no dispositivo/ambiente correto. Preservar DRAFT/HOLD.

## Checkpoint posterior — prova da origem do motor e observações (20/10/2026)

O adaptador de embalagem da prévia só aceita **bytes em memória** do motor da Academia, com os dois pins exigidos pela ponte V6.3: Git blob `3167c309f02a0ad5a84fb43043b8866e3bee873c` e SHA-256 `1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e`. Objeto JavaScript fornecido por chamador, rótulo de SHA ou conjunto de labels `PROVEN` não bastam. O carregador V8.62 é **local/in-memory**, não faz download, não contém código da Academia e não deve receber dados reais em CI pública. O motor autêntico ainda precisa ser carregado no ambiente autorizado sobre uma revisão real do pedido. O CI público cobre recusa adversarial e os gates da ponte; **não executa a prova positiva usando o código privado da Academia**.

Observação geral `DSOBSCOMANDA` mantém a classificação **pendente** na prévia mesmo que um chamador apresente `reviewer_ref`/classificação da mesma revisão. Isso evita que autoafirmação seja confundida com autoridade humana: alegação é registrada como tal, mas não oculta nem libera notas de preparo/alergia. A disposição efetiva exige a fonte/autoridade de classificação já aprovada, ligada à mesma revisão; até essa ligação existir, nota geral real não sai no texto de impressão. Observações de item permanecem intactas.

**Prova ainda necessária para 10/10:** um Reader V2 vivo de mesmo snapshot com itens/notas e binding TATÁ persistido; execução do motor autenticado e da ponte em entrada classificada/vigente; revisão responsável das notas gerais; turno/ACL autorizados; três vias Epson Itaim e prevenção de duplicação com GP iFood, recuperação e rollback verificados em papel, sob autorização específica. Nenhuma parte deste checkpoint aprova merge, deploy, serviço, SQL, fiscal, spooler, sequência ou impressão.
