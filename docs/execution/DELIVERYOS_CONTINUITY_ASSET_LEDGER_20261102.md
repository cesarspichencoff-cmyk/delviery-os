# Delivery OS — inventário de continuidade e alimentação responsável

Estado: CANDIDATE / DRAFT / HOLD. Última reconciliação: 2026-11-02.
Escopo: Itaim, Delivery OS V1. Isto é um índice de execução, subordinado a
`docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`. Não altera produto ou produção.

## Regra de incorporação

- Fonte original e prova verificável antes de qualquer promoção.
- Diferenciar COMMITADO, LOCAL PRESERVADO, TESTADO, CAMPO DESCONHECIDO e BLOQUEADO.
- Diferença de hash ou branch não comprova funcionalidade perdida.
- Reutilizar o que já existe; submeter apenas diferenças com benefício demonstrável.
- Material privado, dados pessoais, credenciais e backups de banco não vão ao GitHub.
- Prova sintética/JVM/AVD não é homologação no caixa nem no Android físico.
- Nunca aplicar automaticamente SQL histórico, habilitar GPS, mesclar PR ou reinstalar serviços.

## Pontos de ancoragem (revalidar SHA antes de agir)

| Elemento | Referência | Limite |
|---|---|---|
| Autoridade do produto | `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` | governa as fontes de produto, não esta nota |
| Continuidade da missão | issue #103 | histórico e checkpoints |
| Candidata integrada | PR #133 / `39f394c95744cf4c152ee5c99982f80afa5544a6` | três workflows SUCCESS; DRAFT, não implantada |
| Pré-verificador de recuperação | PR #134 / `c6f06612bdbca6d867a7968ac08df83ba301be44` | Windows + Linux sintéticos SUCCESS; não inicia serviços |
| Patrimônio amplo Git | PR #132 / `1877e3a669ebb114b5b69025e2dfb4b4bb03435c` | manifesto nessa revisão separada, não instalado na PR #133 |
| Recertificação de segurança | branch `review/deliveryos-foxxy-security-recert-20261102` | workflow novo ainda sem execução confirmada |
| VÉRTICE | `cesarspichencoff-cmyk/vertice-runtime.`, `vertice-active`, `VERTICE_ENTRY.md` | verificar versão vigente ao mudar a missão |

## Provas concretas e fronteira

1. Foxxy conectou em 02/11. Detectadas 44 worktrees do DeliveryOS; sete com alterações locais ou arquivos não rastreados.
2. Fonte histórica `d9214332` é ancestral da candidata integrada (+265, -0 commits). O ZIP Visual V2 original e o manifesto visual estão no Git.
3. Clone independente no Foxxy em `39f394c9`. Emulador Android 14 separado executou `:app:connectedDebugAndroidTest`: **19 testes, zero erros/falhas/ignorados**. O emulador de teste foi desligado. Os 19 não substituem prova física de GPS, bateria, offline ou servidor real.
4. Dez arquivos privados de preservação criados no próprio Foxxy: quatro patches de arquivos rastreados e seis ZIPs contendo 159 arquivos não rastreados. Patches validaram em `git apply --reverse --check`; ZIPs foram abertos, contados e receberam hashes SHA-256. Nenhum original foi removido.
5. Limite importante: essas cópias **permanecem no mesmo computador**. Isso não é backup externo, não comprova restauração integral e não permite descartar os originais.
6. No caixa `CAIXA_MOOCA` (computador que atende o **Itaim**), o laboratório antigo não estava ativo após reboot; piloto 5193 e plataforma 8080 sem listener. PostgreSQL 16 com arquivo de PID anterior ao boot; não foi reiniciado nem alterado. GPS continua OFF. Ver checkpoints na issue #103.

## Trabalhos a diferenciar, não copiar cegamente

- Teste local antigo `run-pilot-delegation-issuance-tests.ts`: API antiga; árvore atual já contém `run-pilot-delegation-issuer-tests.ts` e `run-pilot-delegation-route-tests.ts`. Recertificar as versões atuais, incluindo mudança de ator/unidade, revogação e expiração.
- Teste antigo `run-pg-inbound-receipt-contract-tests.ts`: usa pressupostos da proposta SQL 0011. **Não importar GRANT permissivo nem a migração 0011**. A CI de produto já contém ensaios PG de RLS e papel de unidade; manter essa fronteira.
- Worktree Foxxy `deliveryos-term-identity-authority-20261020`: dos 16 arquivos rastreados modificados, 5 eram idênticos à candidata e 11 diferiam. Dos 13 não rastreados, nove tinham blobs idênticos, um diferia e três nomes não constavam do HEAD.
- Worktrees locais de `SyncWorker`, autenticação, `pilot-facade`, teste visual M1B e correlação divergentes: só aplicar por semântica + testes direcionados, preservando guards atuais.

## Fila de ações — ordem e prova de fechamento

1. **Recertificação de segurança:** abrir PR isolada a partir da branch de testes, executar os testes da API vigente e vincular evidência à issue #103. Nenhum SQL histórico.
2. **Inventário semântico dos arquivos locais ainda diferentes:** classificar cada diferença como já incluída, melhoria aplicável, alternativa histórica ou risco; anotar teste negativo/positivo. Nada de merge por volume.
3. **Backup real:** avaliar cópia privada criptografada fora do Foxxy e do caixa, recuperação testada e responsabilidades. Não registrar credenciais nem dados em artefatos públicos.
4. **Caixa Itaim:** só recuperar laboratório em janela segura, após verificar identidade, cluster PostgreSQL, backup/rollback e condição das portas. Leitor comercial e produtor TATÁ intactos.
5. **Campo:** aceite individual, APK assinado, vínculo de dispositivo, termo, revogação e teste F13 (encerramento da viagem com aparelho offline). GPS e iFood são gates independentes.

## Regra de encerramento

Cada avanço registra: origem/commit, decisão (KEEP/ADAPT/HOLD/REJECT),
prova executada e SHA, regressões conhecidas, efeito autorizado e próxima
pendência. Sem esses dados, indicar PENDENTE e não chamar 10/10.
