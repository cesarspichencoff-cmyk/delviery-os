# Acesso individual ao copiloto — preparação e fonte reaproveitável

## O que foi encontrado

A branch TATÁ OS `test/neon-auth-relay-full-build-proof-20260923`, commit `2067dbdfc6900b4aa96030a4992f581a8e9b8b64`, contém fluxo de OTP por e-mail, cookie HttpOnly/Secure e renovação de JWT. Arquivos examinados: `api/neon-auth-begin.js`, `api/neon-auth-complete.js`, `api/neon-auth-token.js`, `lib/neon-auth-relay.js` e `infra/neon/evidence/auth-phase-a-disposition-2026-09-23.json`.

O relay tem origem candidata fixa do TATÁ OS e consulta o vínculo de atores desse aplicativo. Não é integração pronta para o Delivery OS. A evidência de 23/09 descreve preview protegido e lacunas de prova humana naquele momento; não comprova o estado atual da produção.

Consulta somente leitura, via conector Neon em 27/10, ao projeto `billowing-feather-54441034`, branch `br-restless-haze-ac0qsfw3`: a lista de domínios confiáveis contém três endereços TATÁ OS (produção, alias de projeto e preview). Não contém `https://deliveryos-piloto.eu1.netbird.services`. Nenhuma configuração, usuário, domínio, sessão ou permissão foi alterada; nenhum OTP foi enviado. Não houve leitura de credenciais.

As skills Neon e Neon Auth foram utilizadas para avaliar o reaproveitamento. Orientação aplicada: preservar identidade existente e verificar o fluxo efetivo; não provisionar outro projeto apenas para acrescentar login. O custo incremental dessa futura reutilização ainda precisa ser confirmado; nesta etapa não houve provisionamento nem gasto novo.

## Implementação entregue

`src/platform/auth/operator-read-authority.ts` fornece uma barreira de leitura server-side com dependências explícitas:

1. `verifyIdentity`: adaptador de provedor confiável que deve validar sessão/assinatura; não basta decodificar um JWT.
2. Conferência de issuer, audience próprio, sujeito e validade; unidade solicitada deve ser a unidade configurada.
3. `lookupGrant`: cadastro autorizado do servidor, consultado novamente a cada leitura. Exige mesmo issuer/sujeito/unidade, vínculo ativo, gerente/líder, validade e referência de aprovação.
4. Revalidação de validade após aguardar o cadastro; somente então chama a leitura de pedidos.

Erros do provedor/cadastro/fonte retornam indisponibilidade sem mensagens privadas ou dados antigos. Campos verificados são copiados antes de aguardar o cadastro, evitando mudança de escopo por objeto mutável. Revogação é observada na próxima consulta; não se promete atomicidade com uma revogação ocorrida após a decisão e durante a leitura.

Não é implementação de IdP, login, cookie, cadastro de funcionários ou validação criptográfica. As funções de provedor/cadastro dos testes são inteiramente sintéticas. Não há rota instalada que exponha pedidos reais nem integração instalada com o Neon. A senha compartilhada do proxy continua sem autoridade de identidade humana.

## Prova e próximo passo

- TypeScript completo compilou.
- `node tests/tata-reader/run-operator-read-authority-tests.cjs`: nove famílias PASS — positivo, ausência de credencial, unidade errada, issuer/audience/data inválidos, vínculo/role/validade, revogação, expiração durante consulta, indisponibilidade e objeto mutável. Negativas verificam ausência de leitura de dados.
- Suíte adicionada ao CI de produto após a compilação já existente.
- CI do commit anterior `7c9bac6e`: runs 40466065170 e 40466065219 concluídos com sucesso. Não são CI deste novo delta.

Próximo trabalho concreto: implementar o adaptador do provedor preservando a origem do Delivery OS, sessão própria e vínculo de operadores por sujeito. Antes de habilitar, revisar inclusão do domínio, issuer/audience efetivos, cadastro autorizado, revogação, custo/limites e fluxo real em navegador. Não reutilizar cookie, audience ou autoridade de estoque do TATÁ OS como concessão implícita para o Delivery OS. O resolvedor temporal e o seletor por checkpoint já estão preparados em revisão e não precisam ser reimplementados.
