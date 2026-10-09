# Q-026 — diagnóstico verificável da janela de leitura de Entregas

Data: 2026-10-09
Status: SHADOW / SEM DECISÃO DE JANELA / SEM RELEASE
Base: integração Product UX + Android, commit d0716fd
Escopo real: DeliveryOS somente Itaim; unidades de laboratório são fixtures.

## Estado já comprovado

- A integração visual Q-025 passou no GitHub pós-merge: Product UX run 37993231495 e Android run 37993231412, ambas SUCCESS.
- Benchmark da entrega Claude com 1.030.000 fatos simulados em banco descartável: 20,5 s na porta, 23,7 s via HTTP, 8.253 KiB de resposta e +1,19 GiB de memória no servidor. SQL medido em 420 ms. Não representa produção Itaim.
- A implementação da porta de realidade chama lerFatosParaReplay e reconstrói todos os envelopes e viagens. A projeção calcula estados a partir de eventos ordenados, usando deduplicação de idempotência e separação por unidade/modo.
- Q-026 permanece aberta. Q-024 não define turno. Nenhum limite de N horas ou migração foi aprovado.

## Prova SHADOW executável

Arquivo: tests/product/run-q026-window-shadow-tests.ts. Usa a função real projetar() com eventos sintéticos, sem banco, API ou serviço real.

Oito contraexemplos: (S1) viagem aberta há 80 h some sob corte de 24 h; (S2) GPS recente sem início antigo muda estado em_rota para desconhecido; (S3) fechamento ocorrido antes da janela, mas recebido hoje, perde proveniência; (S4) últimos 200 fatos deixam uma viagem aberta invisível; (S5) corte muda origem do evento deduplicado mesmo se a contagem coincidir; (S6) modos real e simulated não podem ser somados; (S7) sinal stale não significa viagem inexistente; (S8) nenhuma janela fixa, inclusive 30 dias, garante todas as viagens abertas.

A suíte considera sucesso encontrar esses contraexemplos; não significa que houve otimização implementada. Provar execução no CI deliveryos-q026-window-shadow e registrar o resultado real.

## Direção de investigação — proposta, não autorização

Preferir estudar projeção incremental reconstruível, indexada por unit_id e source_mode, **sem descartar o event_log**. Contratos mínimos:

1. O log integral continua sendo a fonte canônica e deve permitir replay de recuperação. A leitura histórica limitada para humanos não pode substituir estado operacional.
2. Um checkpoint derivado e versionado preservaria estado de viagens abertas, evidências necessárias e idempotência (ou mecanismo comprovadamente equivalente), separado do frescor calculado no momento da leitura.
3. O consumo incremental precisa de um watermark de ingestão total e duravelmente ordenado, incluindo fatos atrasados. occurred_at não é cursor de ingestão; recorded_at sozinho pode empatar. O cursor existente event_id+occurred_at não prova ordenação global.
4. Em primeiro boot, perda de checkpoint, divergência, troca de versão ou falha de cursor: replay integral antes de afirmar disponibilidade; se não for seguro, mostrar UNKNOWN/indisponível, nunca zero.
5. Preservar viagens abertas sem sinal por dias, inclusive eventos posteriores e posteriores duplicatas. Não adotar 24 h, turno inventado ou N fatos como corte operacional.
6. Benchmarkar, em dados sintéticos e banco descartável, latência p50/p95, CPU, RSS, tamanho HTTP e igualdade lógica+proveniência frente ao replay integral com inserção tardia, idempotência, múltiplos modos, restart e evolução da versão. Definir critério numérico antes de comparar.

A retenção de viagens encerradas, apresentação da resposta HTTP legado e eventual janela exigem a decisão humana Q-026. Uma otimização que preserva informação não autoriza automaticamente nova tabela ou migração.

## Próximos portões

- CI SHADOW dos contraexemplos.
- Verificar schema de ingresso/ordenação, opções de checkpoint e recuperar estado com fidelidade.
- Preparar experimento isolado, sem ligar ao Product System.
- Obter decisão Q-026 antes de qualquer alteração operacional.
- Se posteriormente autorizado, repetir Product/Android e revisar a integração; produção depende de autorização separada.

Fronteira: sem mudanças de src/platform, TATÁ Comanda, Android, API operacional, permissões, impressora, banco ou produção.
