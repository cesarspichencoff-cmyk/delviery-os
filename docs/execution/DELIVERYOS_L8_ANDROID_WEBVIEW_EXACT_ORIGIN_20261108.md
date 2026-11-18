# Delivery OS Itaim — L8: WebView vinculada à origem exata (08/11/2026)

**Escopo:** PR #137, `feat/gestor-shadow-observer-20261103`, aberta em rascunho. Correção apenas no aplicativo Android de homologação; nenhuma instalação, deploy, merge, serviço, caixa, pedido real ou despesa.

## Falha de fronteira e correção

`OriginLockedClient`, em `android/app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt`, permitia navegação dentro da WebView comparando **somente o host**. Mesmo servidor com outro protocolo ou porta não é a mesma origem. Uma página fora da origem configurada não deve receber a superfície `EntregasNative` do aplicativo. Esta é uma falha de contrato de navegação encontrada em revisão de código, **não há evidência de exploração ou de incidente em campo**.

A implementação agora vincula a navegação à tupla **protocolo + host + porta efetiva** da URL de configuração, com normalização de portas padrão HTTP/HTTPS e recusa de `userinfo`, URL nula, esquema inesperado, host diferente e porta diferente. O tratamento existente de certificado inválido (cancelamento) não foi relaxado. Navegações não autorizadas continuam bloqueadas dentro da WebView, sem redirecionamento automático para navegador externo.

## Prova que realmente foi executada

- Código: commit `25d9533261fa764f9c3be6179552be792b7616c6`.
- Sete testes Robolectric `OriginLockedClientTest`: mesma origem HTTPS com porta implícita/explícita; troca de protocolo; troca de porta; hostname semelhante; `userinfo` e requisição ausente; porta HTTPS personalizada; HTTP debug restrito ao host/porta configurados.
- O primeiro ensaio CI #42519990434 **falhou na compilação do teste** devido à sobrecarga Kotlin `shouldOverrideUrlLoading(null, null)`. Foi corrigido com tipo explícito `WebResourceRequest?`, commit `0115e4e4b520200363db4dea410374261844fa98`. Não esconder o ensaio reprovado nem confundi-lo com falha de app produtivo.
- [Android Room Recovery #42520196418](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42520196418), no commit `0115e4e4`: **completed/success**, `BUILD SUCCESSFUL in 2m 23s`, **29 suítes, 294/294 testes, zero falhas/erros**. A CI exige os sete métodos de `OriginLockedClientTest`, não só a compilação.
- [CI geral #42520196364](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42520196364), no mesmo commit: **completed/success**.
- Novo arquivo de teste: `android/app/src/test/java/br/com/tata/entregas/OriginLockedClientTest.kt`. O filtro da workflow Android foi ampliado para acompanhar os dois arquivos modificados e exigir os sete testes.

## Limites que permanecem abertos

`CI_PASS_ANDROID_294` e `CODE_READY` **não são** `WORLD_PROVEN`. Robolectric não executa a página real dentro do WebView de um aparelho. O teste valida a decisão de navegação, não todas as rotas possíveis de carregamento, iframes de terceiros, redirects, cookies ou respostas de um servidor comprometido. A exposição da interface JavaScript a subframes deve ser tratada numa auditoria específica antes da homologação de segurança final; este reparo não se apresenta como isolamento universal da ponte.

A L6 continua com testes Android de sincronização e a tela Chromium sintética, mas **não** há prova da jornada conjunta: clique no WebView Android → `syncNow` → WorkManager → HTTP de laboratório → Room → recibo visível. Ainda faltam Xiaomi, Doze/rede móvel, GPS consentido, HTTPS autorizado e aceite humano. L1 fonte/completude real e L4 Home real seguem bloqueados; Delivery OS V1 permanece **0/8 etapas integralmente aceitas em campo**.

## Próximo passo seguro

Preparar um ensaio de **WebView Android real em emulador ou dispositivo isolado**, com aplicativo debug, servidor de laboratório e identidades fictícias; exigir prova observável de clique, persistência e recibo, inclusive falha/reconexão. Não usar o CAIXA_MOOCA para criar a bancada. Não instalar APK de campo nem modificar Reader, SQL, impressoras, tarefas ou serviços sem autorização específica.
