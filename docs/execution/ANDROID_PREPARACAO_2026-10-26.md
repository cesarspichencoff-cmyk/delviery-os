# Preparação do Android para ensaio — 26/10/2026

Escopo: Itaim, preparação técnica. Há um Xiaomi disponível; modelo e versão permanecem não observados. Isso não bloqueia a compilação de bancada.

## Estado comprovado antes desta alteração

A PR #126 permanece DRAFT/HOLD em `e1398385b0f7947001972736e4cd74030e87d4e4`.

- Android: run 40232235279, 16 suítes JUnit, 110 testes, zero falhas/erros.
- Produto: run 40232235149 aprovado, incluindo despacho PostgreSQL 6/6, cluster 6/6, HTTP, navegador, acessibilidade e governança.
- Essas provas não significam instalação ou execução física.

## Entrega preparada

O fluxo Android passou a exigir relatório JUnit não vazio e sem falhas, compilar o APK debug e o APK de testes instrumentados, verificar ambos com ferramentas do SDK e gerar pacote com SHA-256, identidade e certificado público do assinante.

O empacotador recusa variante errada, pacote de testes divergente, ausência da marca debug, SDK mínimo inesperado, assinantes diferentes, assinatura ambígua, commit incompleto e ausência dos endereços de emulador no DEX. Onze controles sintéticos passaram localmente. O run 40281850540 executou as ferramentas reais do SDK, repetiu 110 JUnit sem falhas e publicou o pacote verificado (artefato 12633155576). Isso não executa instrumentação no aparelho.

O guia de compilação foi reescrito: a instrução antiga de usar debug como piloto de campo foi retirada. O artefato de bancada declara que não é para instalar em celular de motoboy. Nenhuma chave privada ou credencial operacional entra no pacote.

## Auditoria da fronteira de 10/10

| Obrigação | Evidência ou pendência |
|---|---|
| Continuidade e revisão atual | PR/HEAD e runs revalidados |
| Compilar e testar o núcleo Android | 110 JUnit aprovados no run 40281850540 |
| Produzir APKs e conferir pacote/assinatura/hash | Verificados com SDK real no run 40281850540; artefato 12633155576 |
| Diferenciar bancada de campo | Variantes e limites explícitos no guia e no pacote |
| Publicar servidor HTTPS de ensaio | Não executado; os arquivos consultados contêm somente URLs de exemplo |
| APK de campo assinado | Depende das duas URLs verificadas e custódia da assinatura |
| Termo e recibo remoto em sessão de campo | A tela registra o aceite com a sessão WebView antes de guardar a cópia no Kotlin (rider.js: answerTerm → adoptAck). A repetição posterior pelo SyncWorker não envia sessão e pode permanecer pendente; não é prova de ausência do registro inicial. Dados legais e prova física remota permanecem pendentes |
| Xiaomi: permissões, tela bloqueada, rede offline e bateria | Exigem aparelho real; modelo ainda desconhecido |
| Instalação, GPS e aceitação humana | Não executados |

Conclusão: pacote de bancada compilado e verificado, com provas de produto e campo ainda pendentes. Não há base para declarar o produto inteiro 10/10 ou pronto para operação.

## Próxima sequência

1. Conferir o novo CI e o manifesto do pacote gerado.
2. Validar o fluxo existente de aceite em sessão e a redundância da outbox local antes de alterar autenticação. A delegação atual é exclusiva de eventos; não ampliar escopo silenciosamente.
3. Definir/verificar o ambiente HTTPS, a assinatura e os campos operacionais do termo; apresentar um ensaio concreto para revisão.
4. Conferir modelo/Android do Xiaomi quando estiver disponível.
5. Executar o gate de campo sob as autorizações correspondentes, registrando APK, identidade, aceite/recusa, sincronização e parada.

Não foram criados servidor público, banco operacional, chave de assinatura de campo, cadastro de motoboy ou coleta GPS nesta preparação.

## Primeira execução e reforço dos verificadores

No commit 0de3dc4, o run Android 40280263018 compilou os APKs de app e instrumentação e repetiu os 110 JUnit sem falhas. A publicação ficou bloqueada pelo parser do formato de certificado retornado pelo SDK: nenhum pacote foi publicado como verificado. O parser foi ampliado para os formatos por índice, faixa de SDK e esquema, exigindo a mesma identidade em todas as ocorrências; rótulos duplicados e certificados divergentes continuam recusados. Os controles sintéticos passam a 11.

O run do produto 40280262948 acusou contraste em duas telas desktop. O teste executava axe após os dados estarem prontos, antes de garantir o fim das animações finitas de entrada e o carregamento das fontes. O ajuste de teste espera esse estado com limite de tempo, exercita um reveal prolongado no DOM real e exige opacity=1 antes da medição final. Um controle que injeta baixo contraste após o reveal precisa continuar sendo recusado. As regras axe permanecem ligadas, e nenhum CSS ou componente do produto foi alterado. A reprodução e o resultado desse ajuste ainda dependem do próximo CI.

Uma tentativa de reprodução na máquina Foxxy foi bloqueada pela revisão automática por envolver transferência de código para aquele dispositivo. Não houve execução dessa sonda; a contra-rota é o runner do repositório já autorizado, com dados sintéticos.

## Verificação seguinte

O run Android 40281850540 concluiu com sucesso no HEAD 287e9d8257210ef2a4e03879f7d63f48a3572326: 16 suítes, 110 JUnit, 11 controles do pacote, compilação de app e instrumentação, verificação SDK e upload. Arquivo do artefato: SHA-256 fa971ecd9305f8a13c11b4b4580063f5ce975a25065056e30394f7c03df03019, 4.633.677 bytes. É bancada para emulador, não instalação de campo.

O run de produto 40281850522 recusou corretamente o controle de estado final: o reveal ainda tinha opacity=0. A expressão string passada a waitForFunction retornava uma função em vez de executar a condição; a correção invoca a expressão explicitamente. O próximo CI precisa comprovar espera real, opacidade final e detecção de contraste ruim. Nenhuma regra foi suprimida.

A auditoria mais profunda de rider.js corrigiu a hipótese anterior sobre consentimento: answerTerm envia a escolha ao servidor com a sessão do WebView, exige resposta positiva e só então chama adoptAck para a cópia nativa e pedido de permissão. A fila nativa sem credencial merece investigação, mas não justifica criar outra autoridade de aceite nem afirmar que o aceite inicial está sempre quebrado.

## Consolidação da retomada — 26/10/2026

Revisão de código comprovada: `b88b5dcce3553765496a2b9b9e4d0e103b837aba`, PR #126 DRAFT, sem merge. Os dois runs foram revalidados como concluídos com sucesso na retomada:

- [Android 40282604107](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40282604107): 16 suítes, 110 JUnit sem falhas/erros, 11 controles do empacotador, compilação e verificação SDK dos APKs.
- [Produto 40282604287](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40282604287): PostgreSQL canônico 6/6, cluster 6/6, 12 auditorias axe sem violações e SEM_FAIL_NOVO OK. O reveal foi observado de nove opacidades zero até nove opacidades um; o baixo contraste injetado depois foi detectado.
- [Artefato atual de bancada 12632701697](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/40282604107/artifacts/12632701697): ZIP 4.633.708 bytes, SHA-256 `1528d9110ebc8fcb548cdbea4df73bc380e831509cfb893f4c288455f0e84a08`. O manifesto vincula o pacote à revisão acima. Não é variante de campo.

As seções anteriores preservam a cronologia dos checkpoints, inclusive as tentativas recusadas. Esta seção resolve a pendência de CI descrita nelas. Esta consolidação altera documentação; não altera runtime ou testes.

### Resultado da auditoria da repetição do termo

Em `MainActivity.recordTermAcknowledgement`, o registro recebido da página entra no Room como pending. No SyncWorker, o cliente do piloto não leva a sessão humana; Unauthorized conserva o registro e não chama markSent. A sessão separada da plataforma não é apagada por esse caso. Se não houver outra falha, o trabalho pode concluir sem que esse registro mude para sent. Logo, conclusão do WorkManager não comprova essa transferência. O registro inicial do servidor deve ser consultado no ambiente autenticado, como exige F04 do gate existente. Nenhum novo token ou escopo foi criado nesta auditoria.

### Próximo ensaio concreto

| Entrada necessária | Critério observável antes da instalação | Estado |
|---|---|---|
| URL HTTPS do piloto e da plataforma | As duas alcançáveis pelo aparelho e com certificados confiáveis; unidade Itaim e ambiente isolado identificados | Pendente |
| Custódia da assinatura pilot | Responsável e certificado público identificados; chave privada fora do Git | Pendente |
| Termo operacional aprovado | Identidade do controlador, contato, retenção, versão/hash e aprovação definidos pelo responsável | Pendente |
| APK pilot | Compilado com as URLs verificadas; identidade, assinatura e SHA conferidos | Depende das entradas acima |
| Xiaomi | Modelo/API e permissões observados; executar F01–F14 do gate, com evidências por cenário | Pendente físico |

A próxima ação técnica é gerar e verificar a variante pilot quando essas entradas existirem. O pacote debug já entregue não substitui essa etapa. Os resultados atuais não autorizam afirmar instalação, coleta GPS ou aceitação humana.

## Servidor inicial confirmado: Caixa Mooca

César indicou Caixa Mooca como host inicial e confirmou que permanece ligado durante o delivery. Isso não altera a unidade operacional do piloto: Itaim. A consulta remota foi somente de inventário, sem instalação, serviço, banco, firewall ou túnel criado.

Observado em 26/10/2026: Windows 11 Pro, seis núcleos, 15,9 GiB de RAM (4,8 GiB disponíveis na consulta), 293,3 GiB livres no disco e Node 24.21.0. CPU em consulta pontual: 18%, sem prova de carga simultânea no pico. Suspensão e hibernação automáticas AC/DC: índices zero no esquema ativo de alto desempenho. Não foram encontrados PostgreSQL, Docker Desktop, Caddy, cloudflared ou Tailscale no inventário de aplicativos consultado; a ausência de instalação portátil não foi provada.

Plano de preparação para revisão:

1. Usar uma pasta e dados próprios do Delivery OS, sem reutilizar banco ou configuração do caixa. Identificar/verificar a distribuição do PostgreSQL e as permissões antes de qualquer instalação. Não instalar Docker como requisito automático.
2. Preparar piloto e plataforma a partir da mesma revisão comprovada, com parâmetros Itaim e ensaio declarado, portas locais e credenciais específicas; não executar migrations no banco do caixa.
3. Definir dois endereços HTTPS estáveis e acesso ao domínio correspondente antes de gerar APK de campo. O Caddyfile atual contém tls internal explícito: apenas trocar ENTREGAS_DOMAIN não o converte em certificado público.
4. Fazer ensaio local de persistência, desligamento e impacto no caixa, depois validar HTTPS remotamente e aplicar o gate físico. Não há instalação nem publicação concluída.

Cloudflare Quick Tunnels foi avaliado como opção de teste temporário: não exige conta/domínio, mas o host muda a cada criação e não há garantia de disponibilidade. A autenticação por e-mail é interativa e não serve diretamente aos clientes nativos em segundo plano. Portanto, não é substituto automático dos endereços estáveis do app. Fonte oficial consultada: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ (26/10/2026).

Entrada pendente que muda a rota: domínio existente e acesso administrativo, ou escolha explícita de um ensaio temporário sem operação real. A consulta não estabeleceu nenhum deles.

## Ambiente local preparado no Caixa Mooca

Em 26/10/2026, sob instrução de César para preparar o host, foi criado `C:\Users\Tata\DeliveryOS-Ensaio`, separado do sistema do caixa. Não foi aplicado schema a banco existente. Código baixado do GitHub no commit be5a3e346981f22a7cab2f39470756c7dc00ef07, seleção restrita de arquivos do projeto, npm ci com lockfile e scripts de instalação desativados, build:platform aprovado no Windows com Node 24.21.0. O build-stamp registrou 77 fontes e SHA-256 2d4f1ddb3aeca4d8a1d6aebe5c1e7cd854a03e791d867b3cfa1b5c169798c77f.

PostgreSQL portátil 16.15 baixado do fornecedor EDB, sem Docker e sem serviço global. O hash calculado do ZIP foi 43bb45f173a6f08cf1d29a97a6d8deb119e8e8093a24c00d2d1001a0ccaa8281; é um registro de integridade do download, não uma comparação independente com checksum do fornecedor. Cluster novo com SCRAM, porta 55436 e escuta somente em 127.0.0.1. Credenciais aleatórias geradas no host; pasta com ACL restrita ao usuário local, Administradores e SYSTEM. Nenhum segredo foi colocado no Git.

- Piloto 5193, crítico 8080, assíncrono e PostgreSQL ativos após reinício do ensaio; somente loopback nas três portas.
- /api/health, /health e /ready retornaram 200. /api/term sem sessão retornou 401.
- Seis testes canônicos PostgreSQL do repositório passaram no Windows com fixtures sintéticas e banco de teste separado.
- Os três runtimes foram interrompidos somente após verificar PID, executável, comando e horário de criação. PostgreSQL foi parado e reiniciado; marcador de ensaio persistiu e os runtimes voltaram a responder. Isso não prova desligamento gracioso dos runtimes no Windows nem recuperação após reboot do computador.
- Papéis crítico, assíncrono e piloto conferidos sem superuser, createdb ou createrole. O piloto desta preparação usa seu armazenamento local isolado; os testes canônicos validam a leitura GPS da plataforma/PostgreSQL e não provam convergência total do armazenamento operacional.
- Configuração: unidade ITAIM, source_mode simulated, participantes fictícios, GPS desligado e termo não publicável. NetBird conectado, mas BlockInbound permanece true. Nada publicado por HTTPS.

A evidência sanitizada está em `evidencias/mooca-local-2026-10-26/deployment-state.json`. Os scripts executados foram preservados em `tools/windows-local-lab/`; dependem da pasta e das credenciais privadas do host e não são um instalador de produção.

Próximo passo: configurar os dois serviços HTTPS no painel NetBird e conferir autenticação/escopo; só depois preparar bind na interface NetBird e regras limitadas às portas necessárias. Não liberar todo o computador, rotas, DNS do caixa ou SSH. Inicialização automática no boot, backup fora do host, aprovação operacional do termo e teste físico continuam pendentes.
