# Sessão própria do Delivery OS — candidato de integração

## Entrega em revisão

`src/platform/auth/neon-operator-session.ts` implementa o fluxo de servidor de OTP e sessão própria. Usa endpoints compatíveis com o fluxo Neon/Better Auth encontrado no TATÁ OS, mas recebe URL HTTPS e origem do Delivery OS por configuração confiável. Não utiliza cookie do TATÁ OS nem devolve JWT/cookie do provedor ao navegador.

- Antes de solicitar código, exige origem exata e cadastro do servidor que associe o e-mail a um sujeito já aprovado. Não há registro automático de funcionário.
- Guarda fluxo de login por cinco minutos, com cookie próprio Secure/HttpOnly/SameSite=Strict e até cinco tentativas de código. Cada endereço pode solicitar três códigos em cinco minutos neste processo.
- Após validar OTP, consulta `get-session?disableCookieCache=true` e confere sujeito/e-mail/validade contra o cadastro aprovado. Cria um identificador aleatório próprio de 256 bits; somente o hash indexa a sessão no servidor. Credenciais upstream permanecem em memória no servidor.
- Sessão própria de até dez minutos, limitada pela validade upstream, cookie `__Host-deliveryos_operator`. Cada leitura reconsulta o provedor e o cadastro aprovado. O vínculo de unidade/papel é aplicado pela barreira `operator-read-authority.ts` já existente.
- Issuer identifica o endpoint HTTPS configurado; audience identifica a origem local à qual esta sessão foi vinculada. Isso não é validação de claims de JWT externo: não há decodificação de JWT neste fluxo.
- Logout invalida a sessão local; não promete logout global no provedor. Reinício do servidor perde as sessões e exige novo login, em vez de aceitar credenciais órfãs.
- Tentativas simultâneas de completar o mesmo fluxo são recusadas; logout ou expiração durante a consulta impedem emissão tardia. Respostas do provedor têm prazo de cinco segundos, redirects recusados e limite de 64 KiB. Erros retornam códigos genéricos, sem conteúdo upstream.

## Provas

TypeScript completo compilou. A suíte `run-neon-operator-session-tests.cjs` passou em 15 famílias com fetch/provedor **simulados**, sem rede ou envio de e-mail. A cadeia exercitada foi begin → OTP → sessão upstream → cookie local → validação de identidade → vínculo de Itaim → leitura sintética. Inclui revogação, origem errada, sujeito divergente, expiração/reinício, cookies duplicados, logout concorrente, repetição, limites e respostas excessivas. As nove famílias da barreira de autorização também passaram. Nova suíte incluída no CI de produto.

CIs anteriores, no commit 854fd7eb: produto 40467614968 e Android 40467614828 concluídos com sucesso. Não equivalem ao CI deste delta.

## Limites antes de habilitar

Não instalado no caixa, sem rota HTTP/UI conectada e sem teste real de navegador/provedor. Nenhum OTP foi enviado; nenhum domínio, usuário ou permissão Neon foi alterado. O domínio Delivery OS continua ausente da lista de confiança observada na etapa anterior.

A integração precisa fornecer cadastro aprovado de e-mail/sujeito e de sujeito/unidade/papel, confirmar configuração do provedor para contas existentes, configurar origem própria, validar respostas/cookies reais e comportamento em navegador. O contrato get-session usado está documentado no Better Auth, mas a versão/configuração do serviço Neon existente ainda precisa de prova efetiva. Uma consulta get-session pode renovar estado de sessão no provedor; não é anunciada como operação puramente de leitura do banco remoto.

Sessões e limites são locais ao processo. Não são rate limiting distribuído ou persistência de sessão entre processos/reboots. Rotação de cookies upstream, carga e indisponibilidade prolongada ainda exigem ensaio. A retirada de aprovação corta a próxima consulta, não desfaz uma leitura já iniciada. Sem rota publicada, esses controles não são apresentados como login instalado.

Referência: [Better Auth — gerenciamento de sessões](https://better-auth.com/docs/concepts/session-management), especialmente consulta ao provedor sem cookie cache para reduzir atraso de revogação. A skill Neon Auth foi usada na investigação anterior; preservou-se o provedor existente sem provisionar infraestrutura.

Próximo passo: compor rotas HTTP/CSRF/no-store e tela de login com esta sessão, a autorização por unidade e a leitura por checkpoint; então revisar configuração real e provar o fluxo humano no endereço final. Não repetir implementações já comprovadas de horários, persistência, backup local ou seleção dos eventos.
