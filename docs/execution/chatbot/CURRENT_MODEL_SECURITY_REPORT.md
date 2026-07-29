# Segurança e isolamento — Mudança 005B

## Resultado

Os mecanismos de segurança passaram; nenhum modelo passou o gate completo de
qualidade. Segurança estrutural não foi confundida com qualificação.

## Controles aprovados

- GBNF fixada, parsing estrito e semântica independente;
- 15/15 classes negativas rejeitadas;
- fallback determinístico em toda saída inválida;
- zero ferramenta fora da allowlist;
- zero reasoning persistido;
- zero chamada externa durante inferência;
- llama-server somente em `127.0.0.1`;
- modelos e binários fora do Git;
- corpus totalmente sintético;
- privacidade: zero achado e controle positivo detectado;
- TATA-SC-194: nenhum sistema externo ou driver real;
- instalador anterior preservado por SHA-256.

## Proveniência

- Gemma 4 E4B: GGUF QAT oficial Google, revisão fixada, Apache-2.0;
- Qwen3.5 4B: pesos oficiais Qwen e conversão GGUF secundária rastreada de
  bartowski, revisão, comando de conversão, tamanho e SHA-256 fixados,
  Apache-2.0;
- Gemma 12B: nenhum download;
- nenhum script remoto executado por pipe e nenhuma credencial de download.

## Adversarial

A bateria adversarial real de modelo é reservada a candidatos tecnicamente
qualificados. Gemma e Qwen falharam o Director antes desse gate; executar os 15
ataques completos não alteraria a inelegibilidade e foi registrado como
`not_executed_candidate_failed_director_gate`. Os controles adversariais
determinísticos, de structured output, R05, O02, privacidade, recuperação e
isolamento permaneceram verdes na regressão.

## Limites

- a conversão GGUF do Qwen3.5 continua inadequada para promoção automática;
- o computador do restaurante não foi medido;
- aceleração CUDA não foi homologada;
- nenhuma hospedagem real foi conectada;
- a suíte Conversation histórica não é hermética: um teste regenera dois
  artefatos rastreados. Eles foram restaurados e a homologação isolada passou;
  a dívida não foi corrigida nesta mudança.
