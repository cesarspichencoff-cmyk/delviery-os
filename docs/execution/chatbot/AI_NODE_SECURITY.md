# Segurança do DeliveryOS AI Node v1

## Registro

O código de instalação é aleatório, expira, pertence a uma unidade e é armazenado
somente como hash. No primeiro uso, o node gera Ed25519, envia só a chave pública
e recebe `node_id` e credencial limitada. A chave privada é protegida no Windows
com DPAPI e o arquivo recebe ACL restrita. Uma instalação não compartilha chave
com outra unidade ou computador.

Estados de node: `pending`, `active`, `maintenance`, `degraded`, `revoked` e
`blocked`. Revogação, rotação e bloqueio de modelo produzem eventos append-only.

## Requisição assinada

Cada chamada inclui node, timestamp, nonce, hash SHA-256 do corpo e assinatura.
O servidor recusa replay de nonce, relógio fora da tolerância, corpo divergente,
node não ativo, unidade divergente ou algoritmo não permitido.

## Menor privilégio

O node pode apenas emitir heartbeat, pedir claim, marcar processamento e entregar
resultado. Não acessa PostgreSQL, SQL, shell do modelo, navegador, MCP, internet
livre ou filesystem arbitrário. O provider local aceita somente caminhos dentro
de `bin/` e `models/` e bind loopback.

## Ferramentas do modelo

Allowlist fechada:

- `get_active_conversation_state`;
- `search_tata_knowledge`;
- `get_service_playbook`;
- `get_verified_public_information`;
- `get_allowed_actions`;
- `get_pending_questions`;
- `resolve_reference_candidates`;
- `prepare_handoff`.

O modelo solicita; o DeliveryOS valida, executa ou rejeita. Nenhuma ferramenta
executa ação operacional por conta própria.

## Segredos e logs

Logs usam códigos, hashes, duração, versão e correlação sintética. Não registram
mensagem, resposta integral, token, chave, código de instalação, PII, stack
trace público ou reasoning. Exports e screenshots passam pelo mesmo scanner.

