# DeliveryOS — autorização delegada no piloto por consulta viva à plataforma

**PR candidato em cadeia (PR #110 -> #112 -> #113 -> presente). DRAFT/HOLD.**

## Proposta
- A rota **`POST /api/device/pilot-delegation`** no runtime crítico já emite a credencial Ed25519 exclusiva após autenticar o aparelho e consultar cadastro PostgreSQL `identity.device` / `identity.actor` / `identity.unit`.
- Nova rota **`GET /api/device/pilot-identity`** recebe **somente** a credencial delegada (`pt1`), `X-Entregas-Unit` e verifica assinatura, audiência, expiração, escopo, unidade e cadastro vigente. Recusa revogados e retorna 503 se registro estiver indisponível; nunca libera por cache.
- O piloto verifica **localmente a assinatura Ed25519** e consulta via HTTPS a rota acima para conferência online antes de autorizar `POST /api/events/batch`. Não encaminha a credencial antiga da plataforma. Exige chave pública exclusiva, id e URL HTTPS explícitos; se não configurado, nenhum Bearer delegado é aceito.
- O domínio operacional recebe ator explícito por requisição, preservando `assertCan` e `unit_id` configurado. Tokens antigos do painel seguem no caminho de compatibilidade atual, sem conversão implícita para credencial de motoboy.

## Controles
- Chave privada **só na plataforma**; piloto recebe somente chave pública Ed25519.
- Sem configuração de emissor/verificador, não libera nova autenticação; chave fornecida inválida bloqueia boot.
- A consulta remota usa timeout limitado; HTTPS obrigatório; `403` de revogação ou divergência bloqueia, `503` mantém estado desconhecido, nunca equivale a autorização.
- Sem uso de GPS, sem transação real, sem credencial ou segredo no Git; sem alteração visual ou de contratos de eventos.

## Provas
- **16/16** testes do fluxo emissor -> validação local -> consulta online simulada -> autorização/recusa, incluindo troca de papel, revogação, expiração, token da plataforma indevido e erro de rede.
- TypeScript: exit 0.
- Testes do piloto: **15/15**.
- Guarda M1/C6: **40/40**.
- **Não ocorreu teste de HTTP/HTTPS com processos reais e PostgreSQL nesta etapa**. A consulta externa foi injetada em testes de contrato. Falta configurar chaves/URLs somente em sandbox e provar o fluxo completo.

## Para efetivar entrega de campo
1. Android: solicitar a credencial ao crítico com o token da plataforma, guardar a credencial de curta duração apenas no escopo piloto, renovar antes de enviar `/api/events/batch`, diferenciar 401/403/503 e preservar Room; rodar WorkManager em emulador com rede real.
2. Testar crítico + PG temporário + piloto HTTPS com duas identidades e uma Trip simulada, incluindo revogação, unit mismatch, replay e concorrência.
3. Conferir Entregas/Copiloto na mesma projeção e limites dos 3 eventos de parada isolados.
4. CI remoto, termo/consentimento quando aplicável, GPS conforme escopo consentido, equipamento físico e aprovação humana de piloto supervisionado.
5. Só então autorizar publicação. **Nenhum merge/deploy ou uso de pedidos reais nesta proposta**.
