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
