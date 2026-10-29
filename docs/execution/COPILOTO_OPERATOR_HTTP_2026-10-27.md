# Copiloto: acesso individual e leitura pela aplicação

Escopo: Itaim. Composição candidata em revisão, sem instalação no Caixa Mooca, sem mudança no NetBird, sem envio de e-mail real e sem configuração de usuários/provedor.

## Implementado

`src/platform/copiloto/operator-http.ts` compõe a sessão própria, a autorização de gerente/líder por unidade e o leitor injetado pelo servidor. Não abre porta automaticamente. A rota de leitura usa sempre ITAIM, não aceita unidade, caminho de arquivo ou papel vindos do navegador. Os assets são recebidos do servidor e servidos por lista fixa.

- GET `/copiloto/pedidos/`, `app.js`, `app.css`.
- POST `/api/operator/login/begin`, `/api/operator/login/complete`, `/api/operator/logout`.
- GET `/api/copiloto/orders`.

Cookies saem somente em Set-Cookie, com HttpOnly/Secure/SameSite=Strict. JSON não contém credencial própria nem do provedor. Escritas de sessão exigem Origin exata, JSON e corpo limitado a 2 KiB/5 segundos. Host validado; sem CORS; respostas no-store; CSP sem script inline, iframe ou fonte externa. Erros internos não são refletidos.

A tela mostra origem e horário dos registros; nunca apresenta a lista como total de pedidos ativos. Itens antigos, conflitantes ou com horário futuro ficam ocultos. Falha de fonte, autorização ou saída limpa os registros anteriores. Atualização a cada 30 segundos; ao ocultar a aba ou navegar, a tela limpa a leitura e invalida respostas pendentes. Ao retornar, revalida. Nenhum token vai para localStorage/sessionStorage. O logout é local, não revogação global do provedor.

## Prova local

TypeScript compilado. `run-operator-http-tests.cjs`: seis famílias passaram sobre servidor HTTPS loopback real, certificado efêmero e provedor simulado. A jornada usa arquivo/checkpoint sintético → adaptador → motor TATÁ existente → autorização → HTTPS. Verificados origem, método, tipo/tamanho de corpo, host, consulta de unidade, headers forjados, revogação, cookie duplicado, fonte bloqueada/antiga e saída. Nenhum pedido privado ou segredo aparece na resposta.

Regressões: sessão 15, autorização 9 e leitor de arquivos 19 famílias. Fluxo de navegador mobile/desktop incluído no mesmo runner com `--browser` e no CI após instalar Chromium. Prova de navegador depende do resultado desse CI; não equivale a iPhone/Xiaomi nem ao provedor real.

Base anterior f94877c: CI produto 40468505370 e Android 40468505372 concluíram com sucesso. Não são evidência desta nova alteração.

## Prova adicional no Edge do caixa

Revisão bb1f4da85584f8a0172f1ed66e2c6ba6dfd054bb, árvore 502b7bd9131bd243e93772ee63d7d6f6c224b524: oito famílias passaram no Windows em HTTPS loopback isolado, incluindo Chromium/Edge 156.0.4314.42 nas larguras 390 e 1440. Os 12 arquivos de runtime, motor, tela e teste foram conferidos por SHA-256.

A única adaptação do runner foi usar o canal msedge já instalado e o certificado efêmero de localhost gerado no scratch no lugar de chamar OpenSSL no Windows. Nenhuma asserção foi retirada. Contextos novos, headless, sem reaproveitar sessão do usuário. Confirmados ausência de transbordamento horizontal/erro de página, cookies protegidos, limpeza após fonte bloqueada/revogação/logout e resposta atrasada incapaz de repor pedidos após sair.

A pasta de teste e o material TLS foram removidos em 27/10/2026 às 09h42 de São Paulo. Aplicação instalada, SQL, leitor, NetBird e GPS não foram alterados. Prova: `evidencias/mooca-local-2026-10-26/operator-browser-proof.json`.

CI Android 40504374926 passou no mesmo commit. O CI produto 40504374924 passou a composição HTTPS e a regra semanal, mas ainda instalava Chromium ao registrar esta evidência; não é declarado verde.

Conferência da fonte às 09h32 de São Paulo: últimos três eventos ainda anteriores à instalação da regra semanal, último observado em 26/10 às 23h04, bloqueados e sem offset no horário de abertura. Por ser antes das 11h, isso não prova falha do leitor. Somente metadados foram exportados, sem clientes, itens ou identificadores de pedidos. Ver `evidencias/mooca-local-2026-10-26/source-metadata-2026-10-27.json`.

## Pendências para uso real

1. Concluir o CI Linux/Chromium; a jornada já está provada no Edge isolado do Windows, sem prova no endereço público ou aparelho físico.
2. Validar configuração real do provedor existente, cookie/get-session e domínio do Delivery OS; definir vínculo aprovado e verificável de e-mail, subject, papel e unidade. Não criar autorização por suposição.
3. Confirmar procedência/modo da fonte e evidência temporal; testar observação nova após a regra semanal já instalada. Não resetar checkpoint para simular atualização.
4. Só então preparar instalação reversível no host e teste humano. GPS físico e recebimento durável continuam frentes distintas.

Limites: sessões e rate limits em memória por processo; sem prova de disponibilidade/distribuição. Certificado autoassinado e `ignoreHTTPSErrors` existem somente no teste efêmero; não relaxam o transporte HTTPS do provedor. O feed é de observações selecionadas pelo checkpoint, não inventário completo de pedidos ativos.
