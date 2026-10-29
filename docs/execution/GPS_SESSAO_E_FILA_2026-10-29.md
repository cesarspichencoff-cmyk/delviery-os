# GPS: sessão de captura, fila offline e terminais

## Contrato confirmado por César

Caixa Mooca é computador; computador e tablet acompanham pelo painel e não precisam capturar GPS. Somente celular do motoboy captura durante viagem autorizada. Nenhuma instalação, login físico ou ativação GPS foi feita nesta rodada.

## Sessão de captura

Cada início recebe uma identidade de sessão, mesmo quando o número da viagem se repete. Cada inscrição Fused tem callback próprio; callbacks e resultados de inscrição antigos são ignorados e removidos. START conclui a escrita Room serialmente antes de devolver; STOP invalida a sessão e limpa a viagem. Controle remoto confere a mesma identidade após suspensões e HTTP; resposta antiga não encerra uma sessão nova. Estado do serviço fica no dispatcher principal, HTTP bloqueante em IO.

Seis testes do coordenador cobrem troca A/B, reinício da mesma viagem, STOP durante inscrição, mudança de cadência, ordenação da escrita START/STOP e falha de inicialização. Esses testes não substituem executar o serviço com Fused real. Escritas Room de início/fim ainda usam runBlocking; latência em aparelho lento precisa ser medida antes de homologação.

## Sincronização offline

O worker agora drena até três lotes de 100 pontos por execução. Recibo inválido ou credencial recusada interrompe a drenagem preservando o saldo. Quando os três lotes avançam e ainda há pontos, pede continuação ao WorkManager; não declara sucesso deixando a fila depender de um evento novo ou do periódico. A continuação segue o agendamento/backoff do Android, sem promessa de transmissão instantânea.

Testes Kotlin adicionados usam Room real no Robolectric: fila de 250 pontos escoa em 100/100/50; fila de 350 conserva 50 com indicação de continuação; recibo inválido interrompe no primeiro lote e conserva 250 pontos.

## Terminal de acompanhamento

Guarda estrutural adicionada às fontes do console e cliente compartilhado: não podem solicitar geolocalização do navegador nem iniciar captura nativa. Essa guarda não equivale a um teste físico do tablet. Testes locais: build TypeScript aprovado, 24 UI e 20 isolamento de sessão aprovados.

## Base Android anterior

Commit remoto 526b3b62c89d303935f1cf2635fe8d930d838402: execução Android 40881277038 concluída com sucesso. Inclui a matriz de conversão de ponto nas APIs 26, 28, 29, 30, 31, 32, 33 e 34, compilação e pacote de bancada. Não comprova fabricante, bateria ou foreground service em aparelho real.

## Pendências que impedem 10/10 operacional

- Executar o serviço com Fused real: os testes do coordenador e Room passaram, mas não substituem a prova física.
- Provar captura com tela apagada, revogação, encerramento, perda/retorno de rede e recriação no aparelho real.
- Integrar provedor alternativo para Android sem serviços Google; ainda não implementado.
- Conectar os contextos de movimento/parada/proximidade à política adaptativa; não anunciar autonomia de bateria comprovada.
- Validar login e acompanhamento no tablet e computador reais, com a origem HTTPS operacional.

As correções ficam na branch de revisão, sem merge, deploy ou ativação automática em campo.

## Resultado comprovado da revisão

Código remoto `520bdac93b188a554abffee0d197531439c2e479`, árvore `c62ac9048164e1da0814c445e3efa6d0aa1944d5`:

- Android: https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40913106975 — sucesso. Testes JVM/Room, prova JUnit, controles de empacotamento, compilação dos APKs de bancada e instrumentação, identidade/assinatura/integridade e publicação do artefato aprovados.
- Produto: https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40913106972 — sucesso.
- Instalação e uso físico: não realizados. APK gerado é de bancada, não declaração de homologação operacional.

O P1 recebeu correção compilada e regressões do coordenador; a validação completa de ciclo do serviço no aparelho permanece aberta. Não declarar GPS 10/10 operacional.
