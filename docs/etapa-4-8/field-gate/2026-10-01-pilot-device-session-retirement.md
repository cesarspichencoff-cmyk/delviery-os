# Piloto — retirada da autoridade de sessão do aparelho

Data: 2026-10-01
Host: Foxxy
Base: `4828160d61b2347cd6c6abb976cb4e5dde271b3f`

## Gap

A plataforma já era a autoridade real da sessão do aparelho. O Android usa `ENTREGAS_PLATFORM_URL` para bootstrap/renovação e `identity.device` guarda cadastro, vínculo, revogação e sessão. Mesmo assim, o piloto ainda mantinha `handleDeviceSession` e `config/entregas-devices.json`, criando uma segunda superfície nominal sem consumidor de produção.

## Mudança

A implementação antiga de sessão foi removida do domínio do piloto. O servidor deixou de carregar a lista local de aparelhos e a saúde agora declara a plataforma como autoridade. A rota antiga permanece apenas como resposta temporária de migração, marcada como retentável, sem autenticar nem revelar identidade.

## Provas

Build PASS. API real do piloto 39/39 PASS. Persistência 17/17 PASS. Deploy audit 39/39 PASS. Controle HTTP de encerramento remoto 4/4 PASS. Governança 14/14 verde. `git diff --check` PASS.

O deploy audit registrou que Docker não está instalado no Foxxy; por isso a composição real não foi iniciada nesta prova.

## Fronteira

CODE_READY + TEST_PASS local. Nenhum banco operacional, deploy ou aparelho físico foi alterado. O field gate físico continua NOT_RUN.
