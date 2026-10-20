# TATÁ Comanda — MVP essencial V8.56 (REVIEW ONLY)

**20/10/2026.** Projeto: **TATÁ Comanda**, código atualmente abrigado no repositório `delviery-os`; não chamar este produto de DeliveryOS. PR #107 OPEN/DRAFT/HOLD, sem merge, deploy, instalação, escrita no Windows ou impressão.

## Contrato da primeira entrega — decisão operacional de César
**Nunca A DEFINIR:** **iFood (número curto visível)**, **sequência TATÁ (3 dígitos já vinculados ao pedido)**, **produto completo** e **quantidade exata**, mantendo **observações do pedido/item** sem apagar instruções como SEM/COM e alergias.

**Pode A DEFINIR, se não houver evidência:** **caixa, sacola e kit**. Não inventar tamanho, número, distribuição de produtos ou kit. Comprovadamente não aplicável = `NAO SE APLICA`. Embalagem incompleta **não deve impedir exibir** os dados essenciais do pedido na prévia.

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
