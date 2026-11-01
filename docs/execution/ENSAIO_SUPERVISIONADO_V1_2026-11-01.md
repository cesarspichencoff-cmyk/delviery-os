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
comparado de novo depois da reversão. Junto dele, três conferências, também só de leitura:

- o recibo de confirmação do guard (`netbird-guard-committed.json`) presente e nenhuma tarefa de reversão do
  guard pendente. Sem o recibo, o `Watchdog` desfaria a proteção e desconectaria o NetBird no meio do ensaio;
- `netbird-guard.ps1 -Mode Verify` passando antes de qualquer troca;
- o host alcançando o próprio IP do `wt0` na 5193 (o inventário mede). É o caminho do encaminhador do piloto,
  e passou em 26/10 com o guard ativo (`remote-smoke.cjs`, em `MOOCA_ACESSO_REMOTO_2026-10-26.md`).

## 1. Teste puramente sintético

| Item | Proposta |
|---|---|
| Onde | CAIXA_MOOCA. O SHA validado vai numa pasta própria (`C:\Users\Tata\DeliveryOS-Ensaio-V1\`); a instalação atual fica intacta |
| Dados | Banco isolado `deliveryos_ensaio_v1`; piloto em arquivo, numa pasta de dados própria; `simulated`; GPS desligado |
| Quem e onde | **Caixa**: navegador do próprio computador, com o console pelo endereço do proxy (o piloto escuta só no IP do `wt0`, não em loopback) e o Copiloto em `127.0.0.1:5290`, que só existe no host. **Tablet**: console pelo proxy NetBird de hoje, com o login do proxy como está. **Motoboy**: um navegador com o código dele, sem celular |
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

Todas são desfeitas no fim. Corrigido depois do commit `4d70d1ab`: aquela versão previa um grupo de firewall
separado, só de permissão, que não abriria nada (L60 em `PROMPT_LESSONS.md`).

| Tipo | Mudança | Etapa |
|---|---|---|
| Serviços | Parar os processos atuais (crítico, assíncrono, piloto) pelos PIDs registrados e subir os do ensaio, nas mesmas portas: piloto em `100.107.78.202:5193` (para o proxy), crítico em `127.0.0.1:8080`, assíncrono, `source-ingest` e apresentação em `127.0.0.1:5290`. Os do ensaio sobem com os binários de `dist/` e as mesmas variáveis da cadeia integrada (`run-cadeia-v1-integrada-tests.ts`), apontando para `deliveryos_ensaio_v1` com os papéis do ensaio. **O `local-control.cjs` não serve para isso:** ele aponta fixo para `deliveryos_lab`. A apresentação observa a fila por `https://100.107.78.202:5443`, com `NODE_EXTRA_CA_CERTS` apontando para a CA do ensaio: no modo Remote o piloto não escuta em loopback, e a apresentação recusa mandar o token por HTTP fora dele (I9). Provado pelo T8 do gate do encaminhador | 1 e 2 |
| Flags | Etapa 1: GPS desligado. Etapa 2: `gps_capture_enabled: true`, `offline_queue_enabled: true`, retorno em sombra | 1 e 2 |
| NetBird | Inscrever o Xiaomi como peer, com chave de inscrição individual e política só celular → host em `5443` e `8443`. O serviço de proxy e o login dele não mudam | 2 |
| Firewall | O guard **bloqueia** em `wt0` todo TCP fora da 5193 (regra `DeliveryOS-Lab-OtherTCP`, portas `1-5192,5194-65535`). No Windows, bloqueio explícito vence permissão: um grupo separado só de permissão não abriria nada. A mudança mínima repete o padrão que o guard usa na 5193: (a) estreitar essa regra para `1-5192,5194-5442,5444-8442,8444-65535`; (b) num grupo temporário próprio, bloquear `5443`/`8443` para toda origem que não seja o IP do celular no NetBird; (c) permitir só esse IP, só o `node.exe`, só o IP do host em `wt0`. Nenhuma outra regra muda: a 5193 e os proxies ficam como estão | 2 |
| Verificação | Durante a janela, o `Verify` do guard reprova, e isso é esperado: dono da 5193 (etapas 1 e 2), terceiro peer e regra alterada (etapa 2). Fica anotado. Depois da reversão, ele tem de passar | 1 e 2 |
| TLS | CA de laboratório gerada no host (a chave privada não sai dele), com certificado para o IP do overlay. Gera-se com o `openssl` do host; o inventário mostra se existe (o Git para Windows traz um). Sem ele, a fila no Copiloto e a etapa 2 ficam `NOT_RUN`: a chave não é gerada fora do host. `tls-encaminhador.cjs` escuta só no IP do `wt0`. Na etapa 1, `100.107.78.202:5443` → `100.107.78.202:5193` (piloto), usado só pela apresentação, dentro do host. Na etapa 2 entra `100.107.78.202:8443` → `127.0.0.1:8080` (crítico), e o celular passa a usar os dois. É o equivalente do `socat` da bancada, provado 8/8 | 1 e 2 |

Nada toca a Ethernet, o roteador ou o proxy público.

## 4. Escritas em banco isolado

| Escrita | Como |
|---|---|
| Banco `deliveryos_ensaio_v1` no PostgreSQL do host | dono `deliveryos_owner`; `deliveryos_lab` intocado |
| Migrations 0001–0010 | binário oficial `migrate.js` |
| Papéis | Como na cadeia integrada (verde no CI): `papeis_minimos.sql` e `papel_leitura_produto.sql` aplicados só nesse banco, com os nomes trocados por cinco papéis próprios do ensaio (sufixo `_ensaio_v1`) e senhas geradas no host. Nenhum papel existente é usado nem alterado. Não se reaproveita `deliveryos_source_ingest`: o `local-control.cjs migrate` já lhe deu direitos em `deliveryos_lab`, e uma senha nova abriria a escrita no banco atual durante a janela. Os papéis do ensaio não têm direito nenhum lá |
| Unidade e ator | ITAIM e o motoboy voluntário, com identificador opaco, sem nome |
| Chave do produtor | rito `admin:entregas:producer` (plano + fingerprint), só `simulated` |
| Aparelho (etapa 2) | rito `admin:entregas:device` (plano + fingerprint) |
| Fatos | só `simulated`, só nesse banco |
| No fim | extrair a evidência agregada (contagens, hashes, latência, buracos de sequência); `DROP DATABASE deliveryos_ensaio_v1`; `DROP ROLE` dos cinco papéis do ensaio. Os papéis existentes saem como entraram |

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
`gps_capture_enabled: false`, ou parar os dois encaminhadores TLS (o celular perde o acesso na hora e o Copiloto
passa a declarar a fila indisponível; o tablet segue pelo proxy).

**Janela:** tem horário fixo de fim. O que não terminar fica `NOT_RUN`.

**Reversão (cerca de 10 min), nesta ordem:**

1. `gps_capture_enabled: false` e encerrar a viagem aberta.
2. Parar os processos e os encaminhadores do ensaio.
3. Remover o grupo temporário do celular e devolver `DeliveryOS-Lab-OtherTCP` exatamente a `1-5192,5194-65535`.
4. Tirar o celular do NetBird e revogar o aparelho.
5. Subir de volta o ambiente atual (`local-control.cjs start`, `switch-pilot.ps1 -Mode Remote`).
6. `netbird-guard.ps1 -Mode Verify` precisa passar: dois peers, três escutas e o mesmo digest das 258 regras
   gravado em 26/10. O digest cobre portas, origens, ação e programa: a regra devolvida com outro valor reprova.
7. Extrair a evidência, descartar o banco e os cinco papéis do ensaio e apagar a pasta de dados.
8. Rodar o inventário de novo e comparar com o de antes.

## 6. O que ainda exige a autorização do César

A pré-condição (rodar o inventário) não é autorização de mudança. As autorizações, por etapa:

| # | Autorização | Etapa |
|---|---|---|
| 1 | Instalar o SHA validado em pasta própria no CAIXA_MOOCA e, na janela, trocar os processos atuais pelos do ensaio (inclui o `source-ingest` `simulated` com atestação exigida, a apresentação em loopback e o encaminhador TLS da fila na 5443, com a CA de laboratório gerada no host) | 1 |
| 2 | Banco isolado: criar `deliveryos_ensaio_v1`, migrar, criar nele os cinco papéis próprios do ensaio (com sufixo, como a cadeia integrada; nenhum papel existente muda), registrar a chave `simulated` e o ator; descartar banco e papéis ao final | 1 |
| 3 | Rede do celular: Xiaomi como peer do NetBird (inscrição individual); no firewall, durante a janela, estreitar a regra de bloqueio do guard em `5443`/`8443` e liberar essas duas portas só para o IP do celular; CA de laboratório no celular e o encaminhador da plataforma (8443). O proxy público e a regra da 5193 ficam intocados | 2 |
| 4 | Aparelho e dados: APK de depuração com as URLs do ensaio; pré-vínculo; GPS com as coordenadas reais do voluntário sob o termo publicável, instância `simulated`, banco isolado descartado depois da evidência (ou guardado até 7 dias) | 2 |
| 5 | Pessoas e janela (portão A): voluntário, responsáveis, horário e parada de emergência pré-autorizada | 2 |
