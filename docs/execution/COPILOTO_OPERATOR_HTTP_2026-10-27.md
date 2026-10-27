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

## Pendências para uso real

1. Provar esta composição no Chromium pelo CI e revisar seu resultado.
2. Validar configuração real do provedor existente, cookie/get-session e domínio do Delivery OS; definir vínculo aprovado e verificável de e-mail, subject, papel e unidade. Não criar autorização por suposição.
3. Confirmar procedência/modo da fonte e evidência temporal; testar observação nova após a regra semanal já instalada. Não resetar checkpoint para simular atualização.
4. Só então preparar instalação reversível no host e teste humano. GPS físico e recebimento durável continuam frentes distintas.

Limites: sessões e rate limits em memória por processo; sem prova de disponibilidade/distribuição. Certificado autoassinado e `ignoreHTTPSErrors` existem somente no teste efêmero; não relaxam o transporte HTTPS do provedor. O feed é de observações selecionadas pelo checkpoint, não inventário completo de pedidos ativos.
