# DeliveryOS — contrato de autorização humana e segregação PostgreSQL (para revisão, NÃO implementado)

Estado em 15/10/2026: **PROPOSTA DE GATE G0→G4**, não login funcional, não migration produtiva, não deploy.
Autoridade final: César. Candidato de laboratório: PR #123. Fonte de prova: issue #103.

## Diferença que não pode ser apagada

O ensaio G0 de API local usa `DELIVERYOS_PRODUCT_SCOPE_TOKEN`: é **um segredo da instância de bancada**, não identifica uma pessoa, sua unidade, cargo ou autorização atual. NÃO colocá-lo em código web, HTML, armazenamento do navegador, QR code ou proxy aberto. O fato de a rota devolver HTTP 200 depois do Bearer **não prova login humano**.

`identity.actor` existente oferece `actor_id`, `unit_id`, `role`, `active`. Isso é um cadastro/plano de papéis; **não comprova que um operador tenha sido autenticado**. `device-session.ts` autentica um segredo previamente vinculado de *aparelho* (Android), não usuário humano. Não reusar um token de dispositivo como sessão de gerente.

## Sequência obrigatória de confiança, antes de qualquer tela real

1. **Identidade autenticada por provedor autorizado e comprovado**: validar assinatura/issuer, audience da aplicação, timestamps e vínculo de sessão (não confiar em `X-User`, `X-Unit`, IP, cookie autodeclarado ou `unit_id` enviado pela UI). Escolha/instalação de provedor somente após confirmação de que a organização pode usá-lo, sem novo custo assumido.
2. **Associação humana aprovada**: resolver identificador estável do sujeito para registro ativo de operador com cargo e conjunto autorizado de unidades por decisão administrativa verificável. O cadastro de aparelho/ator não prova esse vínculo sozinho; revogação deve cortar a leitura na próxima validação.
3. **Sessão protegida no servidor**: duração curta, rotação/revogação, cookie `Secure; HttpOnly; SameSite` e proteção CSRF para futuras mutações, limites de tentativa, logs de sucesso/falha sem segredo. Conteúdo de API só após a validação, sem cache compartilhado/CORS permissivo.
4. **Unidade derivada da autorização**: qualquer seletor é pedido de recorte, jamais concessão. A unidade efetiva vem da sessão verificada e da lista ativa autorizada. Rotas sem escopo, duplicadas, com unidade extra ou trocas de operador devem negar antes de consultar PostgreSQL.
5. **DB realmente limitado pelo próprio papel**: a conexão de leitura não pode ser proprietário das tabelas, superusuário nem `BYPASSRLS`; conceder somente `CONNECT/USAGE/SELECT` indispensáveis. Política `USING (unit_id = ...)` deve receber o contexto verificado do servidor por transação (p.ex. `SET LOCAL` em conexão dedicada), jamais string ou cabeçalho arbitrário do navegador. Omitir o contexto deve retornar nenhuma linha; toda requisição precisa limpar contexto por COMMIT/ROLLBACK antes de devolver conexão ao pool. Revisar cuidadosamente outros schemas/portas sem `unit_id`; não expor dados de fontes globais como se fossem por unidade.
6. **Execução produtiva separada**: proposta de migration revisada, privilégios mínimos, evidência de testes, plano de rollback, assinatura/aceite humano e janela autorizada. **Não criar automaticamente role/policy no banco da loja.**

## Cenários mínimos de contra-prova no PostgreSQL e no navegador

| Caso | Resultado obrigatório |
| --- | --- |
| Sem login, token vencido, assinatura inválida ou cabeçalho forjado | HTTP 401, zero consulta de dados |
| Identidade válida sem vínculo ativo de Itaim | HTTP 403, zero consulta de Itaim |
| Identidade de Itaim pede Vila-Lab pela URL, parâmetro duplicado ou rota auxiliar | HTTP 403, nenhum fato alheio na resposta |
| Consulta PostgreSQL sem filtro com papel de Itaim | Apenas linhas autorizadas (RLS) |
| Papel de leitura tenta `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` ou ler tabela não concedida | Negação PostgreSQL 42501 |
| Pool reutiliza conexão primeiro de Itaim, depois de Vila-Lab | Nenhum vazamento de contexto/linha entre sessões |
| Sem contexto RLS na transação | Nenhuma linha observável |
| Operador revogado durante sessão | Sessão rejeitada e dados negados |
| Histórico anterior à migration 0003, sem modo, pertencente à unidade autorizada | Leitura declarada indisponível, nunca "0 entregas" nem modo inventado |
| Histórico legado de outra unidade | Não bloqueia ou contamina a unidade autorizada |
| Falha na leitura, timeout ou abandono de conexão | Não reutiliza sessão/escopo nem exibe dados anteriores |

## Provas existentes versus lacunas

- **PROVEN em LAB:** PR #123, HTTP Bearer/401/403, leitura SQL escopada, teste PostgreSQL RLS temporário com role `NOBYPASSRLS`, migrations 0002→0009 com histórico sem `source_mode`, e teste HTTP de histórico local (S14).
- **NÃO PROVEN:** identidade humana, sessão/cookie confiável, IdP corporativo escolhido/autorizado, policy RLS em migration de produção, credenciais/role de aplicação, ciclo de conexões com `SET LOCAL`, acesso externo TLS, Gestor iFood real, uma Trip Android físico→PG→navegador, aceite e piloto.

**Próximo passo seguro de implementação:** construir prova de sessão humana isolada com identidades **fictícias**, sem vincular funcionários reais; depois provar o isolamento por papel PostgreSQL ao alternar sessões no pool. Só promover com revisão, fonte de identidade autorizada e autorização humana. Não declarar "login pronto" com os testes atuais.
