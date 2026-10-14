# Plataforma — emissão de credencial exclusiva do piloto (candidato)

**Estado: branch isolada para revisão. Sem deploy, sem habilitação, sem alteração no Android ou no servidor piloto.**

## Motivo
O Android recebe uma sessão da plataforma, mas o servidor piloto recusa `/api/events/batch` com HTTP 401 porque a chamada não possui credencial própria. Compartilhar o token de aparelho da plataforma com o piloto é proibido pela fronteira de audiência. O verificador de credencial delegada consta no PR #110 (commit `029193a`) mas não havia um emissor.

## O que este candidato acrescenta
- `src/platform/auth/pilot-delegation-issuer.ts`: valida a sessão assinada da plataforma, consulta um cadastro de autorização atual e assina **uma credencial Ed25519 diferente**, escopo `entregas:events:write` e audiência `deliveryos-pilot-event-write`, validade padrão 180s/máximo 300s.
- `src/platform/auth/pg-pilot-delegation-registry.ts`: consulta **somente** `identity.device`, `identity.actor` e `identity.unit`. A unidade e o papel vêm dos registros, nunca do pedido do Android. Aparelho revogado, sem `secret_hash`, ator inativo, unidade inativa ou associação cruzada são negados. SQL parametrizado.
- `src/platform/runtime/rota-delegacao-piloto.ts`: rota de decisão independente, `POST /api/device/pilot-delegation`, aceita exclusivamente Bearer da plataforma e retorna `pilot_token` de audiência distinta. Não aceita papel, unidade, ator ou segredo de aparelho do corpo do pedido.
- `src/platform/bin/critical.ts`: ligação mínima da rota ao runtime crítico. **Desativada por padrão**; requer `DELIVERYOS_PILOT_DELEGATION_PRIVATE_KEY_B64` (PEM Ed25519 em base64 canônico) e `DELIVERYOS_PILOT_DELEGATION_KEY_ID`. Configuração explícita inválida recusa o boot. A chave privada permanece no processo crítico, não no repositório, Android ou piloto. Em ausência de configuração a rota devolve 503.
- `run-pilot-delegation-issuer-tests.ts` e `run-pilot-delegation-route-tests.ts`: testes de emissão, verificação cruzada, expiração, rejeição de token de plataforma no piloto, revogação, divergência de unidade/papel e recusa de cadastro indisponível.

## Prova disponível
- Emissor + verificador PR #110: **24/24 testes PASS**.
- Handler da rota + consulta SQL injetável: **14/14 testes PASS**.
- Verificador anterior PR #110: **25/25 testes PASS**.
- TypeScript `tsc --noEmit`: **exit 0**.
- M1/C6: **40/40 PASS**.

Essas são **provas locais de contrato**, com repositório original intocado. Não houve acesso a banco operacional nem emissão de credencial válida para um motoboy real.

## Obrigações antes de produzir
1. Executar migração/consulta real `identity.device`/`identity.actor`/`identity.unit` no banco **descartável**; validar emissão HTTP real por TLS, inclusive chave ausente/ruim e registro revogado.
2. Integrar no piloto o verificador público do PR #110 com **checagem online** do cadastro autoritativo e vínculo de ator por requisição; rejeitar divergência de `unit_id`, `actor_id`, `role` e ordem de comandos. **Não copiar token da plataforma para o piloto**.
3. Rever risco de `PilotApplicationFacade` mutável ao atender requisições simultâneas antes de habilitar uma fonte adicional de atores.
4. Integrar o cliente Android para pedir a credencial **à plataforma**, guardá-la por audiência sem expô-la na WebView e enviá-la somente ao piloto, com refresh e reenvio idempotente.
5. Executar testes integrados plataforma→piloto→Android→Entregas/Copiloto, CI remoto, TLS e validação humana. GPS/termos/pedidos reais e publicação exigem portões separados.

**MANTER DRAFT/HOLD; este PR não habilita operação, não substitui a política do piloto e não constitui aceite para deploy.**
