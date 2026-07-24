# Segurança e privacidade — v1

IMPLEMENTADO, testado. `security/pii-guard.js` — independente do
`conference-brain/live/pii-guard.js` (mesmo princípio, reimplementado sem
require cruzado, ver `IFOOD_EXISTING_ASSETS_INVENTORY.md` §3.1).

## 1. Sanitização de payload

`sanitizeFreeText(text)` — ALLOWLIST por TOKEN, nunca blocklist: um token
só sobrevive literal se bater INTEIRO com vocabulário funcional conhecido
desta integração (`KNOWN_TOKENS`: `code`s de evento, `ORDER_STATUS`,
tipos de negociação, estados de packaging, `webhook`/`polling`/`simulator`).
Qualquer outro token — em qualquer script, maiúsculo ou minúsculo — vira
`[token-suprimido]`. Nunca usa forma de nome (capitalização) como critério
— testado explicitamente com nome minúsculo e CJK.

## 2. Classificação de campos

Duas camadas independentes:
1. **Por NOME de campo** (`contracts/schemas.js#FORBIDDEN_FIELDS`) — recusa
   a escrita se qualquer registro contiver `customer_name`,
   `customer_phone`, `customer_address`, `customer_note`, `raw_token`,
   `raw_secret`, `cookie`, `session_token`, ANTES de olhar o valor.
2. **Por NOME de campo em log/diagnóstico**
   (`security/pii-guard.js#redactForLog`,`SENSITIVE_KEY_PATTERN`) — mais
   ampla que a lista fechada acima (regex sobre `name|nome|phone|telefone|
   address|endereco|note|nota|observ|token|secret|segredo|cookie|senha|
   password`), porque um log pode ter campos que a persistência nunca
   veria. Campo sensível vira `"[campo-sensivel-omitido]"` — nem o valor,
   nem um hash dele; o próprio NOME do campo já é informação demais para
   log.

## 3. Hash de payload

`contracts/envelope.js#sha256` — todo payload externo bruto vira só
`payload_hash` (sha256) na inbox; o corpo nunca é persistido inteiro.
Quarentena idem: `payload_hash` calculado quando disponível, corpo bruto
nunca gravado (só um excerto truncado a 500 caracteres em
`webhook-receiver.js#receiveRaw` para o caso de JSON inválido — nunca além
disso, nunca em texto livre não sanitizado no restante do sistema).

## 4. Logs sem PII

Nenhum `console.log` em nenhum módulo de `src/integrations/ifood-official/`
imprime um registro bruto — quem quiser logar usa `redactForLog()`
primeiro. Verificado por grep: zero `console.*` fora de
`tools/ifood-simulator/` (nenhum lá também, na verdade — o simulador só
retorna dados, não imprime).

## 5. Segredo abstrato / configuração sem credencial real

`contracts/auth.js` — `client_id_ref`/`client_secret_ref` são REFERÊNCIAS
(strings opacas apontando para onde o segredo mora, fora deste
repositório), nunca o valor. `auth/auth-context.js#tokenReference` idem —
o VALOR do token nunca passa por nenhum módulo desta missão. Nenhum
arquivo `.env`/credencial foi criado.

## 6. Retenção configurável

`outbox`/`negotiation` não implementam TTL nesta missão (registrado como
limitação — ver `IFOOD_HOMOLOGATION_NEXT_STEPS.md`); o padrão de retenção
configurável já existe no conference-brain (`live/evidence.js`,
`retention_days`) e pode ser reaproveitado como REFERÊNCIA de padrão, não
como código, quando esta integração precisar de purge automático.

## 7. Quarentena e trilha de processamento

Cobertos por `inbox/inbox.js` — ver `IFOOD_INBOX_OUTBOX_V1.md` §1.3-1.4.
Toda transição de estado (inbox e outbox) é auditável pelo histórico
append-only do `storage/store.js` — cada `put()` acrescenta uma linha, o
arquivo inteiro é a trilha.

## 8. O que NÃO foi implementado nesta missão

Rate limiting de requisições reais (não há requisição real); rotação
automática de credencial (não há credencial real); criptografia em
repouso do `data/integrations/ifood-official/*.runtime.jsonl` (mesma
lacuna que o conference-brain já tem, documentada como limitação
compartilhada, não nova desta missão).
