# PostgreSQL operational preflight — prova isolada

Data: 2026-10-03
Escopo: **pré-cutover isolado; sem produção**
Base: `af117ec12cb2a7fb936abbf83abbb57c7c803570`
Branch: `tmp/postgres-operational-preflight-20261003`

## O que foi fechado

- `npm run verificar:banco` agora existe e aponta para a implementação canônica.
- O comando não aplica migration nem escreve dado de operação.
- Valida PostgreSQL 14+, TLS, `CREATE`, PL/pgSQL, JSONB, `FOR UPDATE SKIP LOCKED`,
  capacidade de conexões, identidade do migrator e drift de migrations/checksums.
- Papel de runtime usado como migrator é fail-closed.

## Prova real local

Alvo: PostgreSQL 17.11 descartável em `127.0.0.1:55432`.

1. banco vazio: `verificar:banco` PASS, com 0001–0008 explicitamente pendentes;
2. `npm run migrate`: 8 migrations aplicadas;
3. segundo `verificar:banco`: PASS, schema do checkout completo e sem drift;
4. fingerprint do catálogo antes/depois do preflight: `837674f64ff7d19cc068be94c7e07d01` em ambos;
5. `deliveryos_entregas_pilot` como credencial de migration: exit 1, recusada por papel de runtime e ausência de `CREATE`;
6. `DATABASE_PREFLIGHT: 8/8 PASS`;
7. `PILOT_POSTGRES_SERVER_CLUSTER: 6/6 PASS`;
8. `PILOT_STORAGE_CUTOVER: 7/7 PASS`;
9. platform deploy-audit: 30/30;
10. PB19: 27/27 GREEN.

## Portabilidade do gate

PB19 criava `node_modules` por symlink em raízes temporárias. No Windows sem Developer Mode isso
falhava com `EPERM`, sem relação com o runtime. O teste usa junction no Windows e symlink de
diretório nos demais sistemas. Nenhum código de produção foi relaxado.

## Fronteira

Ainda **não** está PROVEN para o banco operacional porque ele não foi escolhido/criado. Também não
foram executados: credenciais reais, migrations no alvo operacional, cutover real, deploy ou
`consumer_live`/UI live. O próximo efeito externo deve começar repetindo este preflight no alvo
autorizado.
