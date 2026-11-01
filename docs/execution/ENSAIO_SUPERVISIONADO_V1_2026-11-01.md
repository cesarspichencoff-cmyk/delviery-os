# Ensaio supervisionado da V1 — proposta única (01/11/2026)

**Objetivo:** ver caixa, tablet, Android e Copiloto funcionando juntos, pelo caminho mais curto e seguro.
São duas etapas em sequência: a sintética primeiro, a física só se a sintética passar.

**Valem o tempo todo:**

- o observador da fila só lê;
- a autenticação do proxy público do NetBird não muda;
- a origem real do `source-ingest` segue fechada (20/10): todo fato é `simulated`;
- nada roda sobre o banco `deliveryos_lab` nem sobre a instalação atual.

**Pré-condição.** Rodar `tools/windows-local-lab/inventario-somente-leitura.ps1` no CAIXA_MOOCA. Ele não muda
nada. Sem esse retrato do estado atual (build, portas, peers, firewall, WSL), não se instala nada. O retrato é
comparado de novo depois da reversão.

## 1. Teste puramente sintético

| Item | Proposta |
|---|---|
| Onde | CAIXA_MOOCA. O SHA validado vai numa pasta própria (`C:\Users\Tata\DeliveryOS-Ensaio-V1\`); a instalação atual fica intacta |
| Dados | Banco isolado `deliveryos_ensaio_v1`; piloto em arquivo, numa pasta de dados própria; `simulated`; GPS desligado |
| Quem e onde | **Caixa**: navegador do próprio computador, com o console e o Copiloto em `127.0.0.1`. **Tablet**: console pelo proxy NetBird de hoje, com o login do proxy como está. **Motoboy**: um navegador com o código dele, sem celular |
| Roteiro | 1. Os cinco processos saudáveis (piloto, crítico, assíncrono, `source-ingest` com atestação exigida, apresentação). 2. O caixa registra 3 prontos sintéticos (A, B, C). 3. O tablet monta a viagem com A e B para o motoboy. 4. O "motoboy" confirma a saída. 5. O Copiloto mostra a viagem `simulated`; `/api/entregas/prontos` mostra C na fila e A e B na trajetória. 6. Entrega e encerramento pelo console. 7. No banco isolado: fatos assinados e admitidos, zero `real`, zero quarentena. 8. Reinício do consumidor sem duplicar |
| Prova | O candidato no host real e as três telas (caixa, tablet, Copiloto) na mesma cadeia, com identidade: atestação, observador e papel de leitura |
| Não prova | Android, GPS, rede móvel |
| Duração | 30–45 min |

## 2. Teste físico com Android e eventuais coordenadas reais

Só depois de a etapa 1 passar.

| Item | Proposta |
|---|---|
| Aparelho | O Xiaomi, com o **APK de depuração** gerado com as URLs do ensaio. Ele aceita a CA de laboratório instalada como CA do usuário (o `pilot` e o `release` não aceitam). Sem tag e sem segredo de assinatura |
| Rede | O celular entra como **peer do NetBird**, com inscrição individual e revogável: nenhuma senha global no APK. Fala direto com o host pelo overlay. O proxy público não muda |
| Roteiro | Os passos F01–F11 de `GATE_CAMPO_ANDROID_COPILOTO_2026-10-20.md` (F12 em bancada; F13 e F14 só observados), a bateria 1–17 e 20–21 de `FIELD-GATE-ANDROID.md` e os passos 3–8 do aceite da `LIBERACAO_V1`, nesta ordem: pré-vínculo pelo código mostrado no app → login do motoboy → termo (recusa e aceite) → permissão → viagem montada no tablet para ele → saída confirmada na loja, com rede → GPS ligado na viagem → trecho sem rede (modo avião) com chegada e entrega guardadas → volta da rede e sincronização → encerramento no console → o GPS desliga → Copiloto e console com a viagem → revogação do aparelho |
| Coordenadas reais | Só do voluntário, só durante a viagem do ensaio, sob o termo publicável. A instância é `simulated`, então o fato nunca vira `real`. Ficam só no banco isolado; o Git recebe apenas contagens e hashes. Ao final, o banco isolado é descartado depois da evidência, ou guardado até 7 dias (prazo do termo) |
| Duração | 60–120 min, incluindo pelo menos 10 min sem rede |

## 3. Mudanças temporárias de rede e serviços

Todas são desfeitas no fim.

| Tipo | Mudança | Etapa |
|---|---|---|
| Serviços | Parar os processos atuais (crítico, assíncrono, piloto) pelos PIDs registrados e subir os do ensaio, nas mesmas portas: piloto em `100.107.78.202:5193` (para o proxy), crítico em `127.0.0.1:8080`, assíncrono, `source-ingest` e apresentação em `127.0.0.1:5290` | 1 e 2 |
| Flags | Etapa 1: GPS desligado. Etapa 2: `gps_capture_enabled: true`, `offline_queue_enabled: true`, retorno em sombra | 1 e 2 |
| NetBird | Inscrever o Xiaomi como peer, com política só celular → host nas duas portas TLS do ensaio. O serviço de proxy e o login dele não mudam | 2 |
| Firewall | Um grupo **separado e temporário** em `wt0`, só para o IP do celular, nas portas `5443` (piloto) e `8443` (plataforma). O grupo do guard fica intocado. Enquanto o celular for peer, o `Verify` do guard acusa a topologia (esperado e anotado) | 2 |
| TLS | CA de laboratório gerada no host (a chave privada não sai dele), com certificado para o IP do overlay. `tls-encaminhador.cjs` faz `5443` → piloto e `8443` → crítico: o equivalente do `socat` da bancada, provado 7/7 | 2 |

Nada toca a Ethernet, o roteador ou o proxy público.

## 4. Escritas em banco isolado

| Escrita | Como |
|---|---|
| Banco `deliveryos_ensaio_v1` no PostgreSQL do host | dono `deliveryos_owner`; `deliveryos_lab` intocado |
| Migrations 0001–0010 | binário oficial `migrate.js` |
| Papéis | `papeis_minimos.sql` e `papel_leitura_produto.sql` aplicados só nesse banco; senhas geradas no host para `deliveryos_source_ingest` e `deliveryos_leitura`. Os papéis são do cluster, mas não ganham nada em `deliveryos_lab` |
| Unidade e ator | ITAIM e o motoboy voluntário, com identificador opaco, sem nome |
| Chave do produtor | rito `admin:entregas:producer` (plano + fingerprint), só `simulated` |
| Aparelho (etapa 2) | rito `admin:entregas:device` (plano + fingerprint) |
| Fatos | só `simulated`, só nesse banco |
| No fim | extrair a evidência agregada (contagens, hashes, latência, buracos de sequência); `DROP DATABASE deliveryos_ensaio_v1`; remover os papéis criados para o ensaio |

## 5. Condições para encerrar e reverter

**Parada imediata (P0):**

- captura sem consentimento ou depois da parada local;
- troca de ator ou de aparelho;
- qualquer fato `real`;
- endereço ou coordenada em log comum;
- o observador conseguindo escrever (qualquer 2xx numa rota de escrita com o token dele);
- qualquer mudança no serviço de proxy;
- escrita fora do banco isolado ou da pasta do ensaio.

**Bloqueio do passo** (para o passo e guarda os dados):

- termo sem recibo no servidor;
- 401/403 nas rotas nativas;
- TLS inválido;
- duplicata;
- evento offline perdido;
- Copiloto mostrando simulado como real.

**Parada local pré-autorizada:** retirar a permissão de localização, modo avião, encerrar a viagem no console,
ou `gps_capture_enabled: false`.

**Janela:** tem horário fixo de fim. O que não terminar fica `NOT_RUN`.

**Reversão (cerca de 10 min), nesta ordem:**

1. `gps_capture_enabled: false` e encerrar a viagem aberta.
2. Parar os processos e os encaminhadores do ensaio.
3. Remover o grupo de firewall do celular.
4. Tirar o celular do NetBird e revogar o aparelho.
5. Subir de volta o ambiente atual (`local-control.cjs start`, `switch-pilot.ps1 -Mode Remote`).
6. `netbird-guard.ps1 -Mode Verify` precisa passar: dois peers, três escutas, regras íntegras.
7. Extrair a evidência, descartar o banco e os papéis do ensaio, apagar a pasta de dados.
8. Rodar o inventário de novo e comparar com o de antes.

## 6. O que ainda exige a autorização do César

A pré-condição (rodar o inventário) não é autorização de mudança. As autorizações, por etapa:

| # | Autorização | Etapa |
|---|---|---|
| 1 | Instalar o SHA validado em pasta própria no CAIXA_MOOCA e, na janela, trocar os processos atuais pelos do ensaio (inclui o `source-ingest` `simulated` com atestação exigida e a apresentação em loopback) | 1 |
| 2 | Banco isolado: criar `deliveryos_ensaio_v1`, migrar, aplicar os papéis, registrar a chave `simulated` e o ator; descartar ao final | 1 |
| 3 | Rede do celular: Xiaomi como peer do NetBird, grupo de firewall temporário só para ele em `5443`/`8443`, CA de laboratório no celular e encaminhador TLS. O proxy público fica intocado | 2 |
| 4 | Aparelho e dados: APK de depuração com as URLs do ensaio; pré-vínculo; GPS com as coordenadas reais do voluntário sob o termo publicável, instância `simulated`, banco isolado descartado depois da evidência (ou guardado até 7 dias) | 2 |
| 5 | Pessoas e janela (portão A): voluntário, responsáveis, horário e parada de emergência pré-autorizada | 2 |
