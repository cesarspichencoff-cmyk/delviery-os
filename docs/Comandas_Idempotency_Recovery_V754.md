# Comandas — idempotência e recuperação V7.54 (OFFLINE / HOLD)

## Objetivo e fronteira de verdade

Evitar reenvio automático de uma via após repetição, reinicialização ou resposta ambígua do spooler. **O modo atual não imprime, não escreve estado operacional, não instala consumidor V2 e não modifica driver, serviço ou Teknisa.**

- Código: `tools/comandas_idempotencia_v754_offline.js`.
- Testes: `tools/verificar_idempotencia_recuperacao_v754.js` e replay completo `tools/verificar_cadeia_positiva_v722_offline.js`.
- Entrada lógica: projeção validada pelo par V2→V6.8, referências SHA das três vias Epson nativas, identidade exata `CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`, número TATÁ e escopo explícito.
- O escopo aceito **neste módulo é exclusivamente sintético** (`SYNTHETIC_SCOPE_ONLY`), não constitui autorização humana nem uma política de reset operacional.
- O adaptador gera *propostas* de estado, nunca comandos de impressão e nunca concede `authorize_print=true`.

## Por que não basta comparar o número do pedido?

A sequência TATÁ mantém um vínculo entre número e pedido, mas uma impressão envolve operações externas não transacionais. Se o processo cair depois que o Windows receber bytes e antes de registrar sucesso, o recibo **pode já estar no papel**. Consultar fila vazia não prova que o papel saiu nem que não saiu. Reimprimir automaticamente nessa situação pode duplicar; descartar silenciosamente pode perder uma comanda.

**Sem confirmação física confiável ou mecanismo transacional suportado pela impressora, exatamente uma impressão física não está demonstrado.** A política conservadora proposta é *no-automatic-retry after reservation*, sujeita a reconciliação externa.

## Identidade de uma tentativa

- Chave estável: hash de `escopo explícito + chave completa do pedido + tipo de via + estação/destino + posição da via`.
- Conteúdo fixado: hashes do evento verificado e do fluxo de bytes nativo, mais sequência TATÁ. Mudar qualquer um após reserva resulta em **bloqueio por divergência**, não em um trabalho novo automático.
- Uma via SUSHI, outra COZINHA e uma CONFERÊNCIA exigem três registros independentes. Não misturar a autorização de uma com a de outra.
- No replay histórico, todas as três derivações partem do mesmo pacote fonte-verificado; manipulações de quantidade, caixa ou rastreio continuam bloqueadas pelas camadas anteriores.

## Estados lógicos da simulação

| Estado | Evidência que representa | Política de retomada |
|---|---|---|
| Sem reserva | Nenhuma tentativa persistida foi demonstrada | Sem autorização implícita; exigir portões prévios |
| `ATTEMPT_RESERVED_UNVERIFIED` | Intenção de tentativa, antes do efeito externo | Bloquear reenvio automático, inclusive após crash |
| `SPOOL_ACCEPTED_PAPER_UNVERIFIED` | Confirmação de transporte, **não de papel** | Bloquear reenvio automático |
| `RESULT_UNKNOWN_NO_RETRY` | Timeout, queda ou resultado ambíguo | Bloquear e reconciliar externamente |
| `PAPER_EVIDENCE_RECORDED_NOT_WORLD_PROVEN` | Afirmação de evidência anexada ao simulador | Não vira prova física nem habilita reenvio |

Transições inválidas, replays, identidade alterada ou versão obsoleta retornam `HOLD`.

## Requisitos ausentes antes de qualquer envio real

1. **Transação durável:** reservar cada via em armazenamento com compare-and-swap atômico, persistência verificável após reinício, exclusão de concorrentes, histórico imutável e identificação do escopo operado.
2. **Portão de efeitos:** somente um componente revisado e explicitamente autorizado poderia disparar transporte *após* comprovação da gravação durável; o protótipo atual **não possui tal componente**.
3. **Fonte de verdade de papel:** correlacionar aceitação de spool, identidade do trabalho e evidência física real. Não concluir pela fila vazia ou pelo código de retorno do Windows.
4. **Resolução humana de exceções:** distinguir efetivamente NÃO IMPRESSO de IMPRESSO SEM ACK, com auditoria, reimpressão manual específica e política de conservação da numeração; nunca usar auto-retry para a ambiguidade.
5. **Escopo real:** confirmar contexto store/date/turno e política de sequência vigentes, rastrear fingerprint do pedido, proteger PII em qualquer prova persistida.
6. **Destino físico:** validar três vias no Itaim, mapeamento de impressoras, tamanho e acentuação, ausência de regressão no fluxo compartilhado da Teknisa e caminho de reversão.
7. **Testes de corrida e energia:** concorrência verdadeira com vários processos, queda antes/depois do commit, queda entre o envio e ACK, perda de disco, restauração e reprocessamento de eventos atrasados.

## Evidência disponível

- V7.51: amostra fictícia de fontes nativas Epson confirmada por fotografia na CAIXA_MOOCA. Não equivale à implantação no Itaim.
- V7.53: CI Windows/Linux das três vias sintéticas e da fidelidade do texto aprovado.
- V7.54: simulação local de 20 casos adversariais com resultados PASS; CI próprio deve ser consultado pelo SHA específico antes de declarar PASS remoto.
- **Não há nesta fase**: prova de reserva transacional em disco real, exactly-once física, serviço V2 ativo ou impressão real de três vias.

## Regra operacional até autorização separada

**DRAFT / HOLD / NO MERGE / NO DEPLOY / NO INSTALL / NO PRINT / NO SPOOLER WRITE / NO SEQUENCE WRITE / NO TEKNISA CHANGE.**

A próxima fase é um protótipo local de transação durável e teste multiprocessos em ambiente descartável, **não** um envio à impressora compartilhada. A primeira aprovação de produção só pode ocorrer após as provas físicas e de segurança explícitas.

## Complemento V7.55 — diário sintético concorrente

Foi acrescentado `tools/comandas_journal_v755_sandbox.js`, com teste
`tools/verificar_journal_sandbox_v755.js`. **Somente no diretório temporário
descartável** cujo nome começa com `deliveryos-v755-`:

- Reserva separada por via é serializada por criação exclusiva de diretório
  `.attempt-lock`; a concorrência real entre cinco processos é exercitada no teste.
- Revisões ficam em arquivos `state-000001.json` etc., criados exclusivamente,
  com `fsync` do arquivo, hash encadeado e leitura pós-gravação.
- Repetição da reserva após simulação de reinício permanece bloqueada.
- Se a trava sobreviver a uma queda, ela **não** é liberada automaticamente:
  o registro fica em HOLD para reconciliação externa. Alteração do histórico
  também bloqueia, sem apagar silenciosamente a prova.
- O resultado retornado é `SYNTHETIC_JOURNAL_COMMIT_OBSERVED` com
  `authorize_print=false` — nunca autorização operacional.

**Limitação relevante:** a gravação/ordenação após perda total de energia no Windows
não foi validada; nem há lock distribuído, adaptação ao serviço instalado,
comando de impressora, confirmação de papel ou garantia de zero perdas.
Nenhum destes arquivos é uma implementação de registro operacional.
A presença de `fsync` e cinco processos PASS no laboratório não prova a
atomicidade em rede, a durabilidade de hardware nem *exactly once* física.

## Complemento V7.57 — prova criptográfica com âncora sintética independente

O histórico encadeado V7.55, isoladamente, detecta alterações parciais e revisões
quebradas, mas pode ser inteiramente reescrito se um atacante também recalcular
todas as hashes locais. A V7.57 acrescenta apenas uma **interface verificadora**
de assinatura Ed25519 de um *checkpoint* monotônico, comparado com a última
hash do diário validado.

- Verificador puro `tools/comandas_signed_anchor_v757_offline.js`: recebe
  separadamente **diário sintético**, **assinatura** e **contexto confiável**
  (identidade da instância, revisão exigida, última hash exigida, chave
  pública Ed25519 e impressão digital da chave). **Nunca** busca a chave
  do próprio envelope assinado nem autoriza impressão ou reimpressão.
- A mensagem assinada contém domínio explícito da aplicação, identidade da
  instância, revisão e hash da última versão do diário, para evitar uso
  acidental em outra aplicação, instância ou revisão.
- `tools/verificar_signed_anchor_v757_offline.js`: usa um par de chaves
  **efêmero, gerado apenas no runner**, sem salvá-lo no repositório nem no
  diário. Testa signature flip, troca de chave, rollback para revisão anterior,
  falsificação de envelope, corrupção, trava pendente, outra instância e
  reconstrução completa de um diário com cadeia local ainda válida.
- `tools/verificar_cadeia_positiva_v722_offline.js` verifica a assinatura
  do diário de três vias produzido a partir do replay fonte-pinado V2→V6.8.
- Windows e Linux verificam tudo sem imprimir, abrir serviços, spooler, rede
  ou acessar os diretórios operacionais do restaurante.

**Limite obrigatório:** no laboratório, até o *contexto confiável* pode
ser substituído por um atacante que controla todos os argumentos: a prova
criptográfica, sozinha, não impede isso. Uma implantação futura precisa
definir **onde a chave pública e a revisão mínima monotônica ficarão
custodiadas de forma independente** do computador que imprime (acesso,
auditoria, recuperação, troca de chave e ciclo de retenção), além de provar
disponibilidade, consistência e custo zero/suficiente. Chave efêmera do CI
não é custódia empresarial; **sucesso do teste não prova âncora operacional
externa**.

O diário do Windows também não demonstrou durabilidade após perda real de
energia; a âncora assinada não fornece garantia de papel nem exatamente uma
impressão física. As três vias continuam em HOLD até os demais portões.
