# DeliveryOS — prova executada do bloqueio Q-019 / M1-C6

**Data:** 2026-10-13
**Repositório:** `cesarspichencoff-cmyk/delviery-os`
**Commit testado, sem aproximação:** `7dddd9f5b0487bc164c1251d85b16a2330bc231e` (HEAD da PR #106 no momento da leitura).
**Estado:** TEST_FAIL confirmado na cópia isolada; Q-019 continua PAUSE; NÃO houve autorização histórica, merge, deploy ou teste de Android.

## Procedimento reproduzível

- Dispositivo de testes autorizado: Foxxy. Nenhuma ação na máquina `CAIXA_MOOCA`.
- Criada uma worktree local em detached HEAD do SHA exato acima; nenhum checkout ou reset nos diretórios de trabalho existentes.
- Execução, na raiz da worktree: `npx.cmd --offline --yes tsx src/platform/run-m1-bridge-tests.ts`. `tsx v4.23.15`, `node v24.18.0`; execução sem instalação de dependência pela rede.
- Resultado do processo: `exit 1` em aproximadamente 5 s; **37 verificações passaram, 1 falhou**.
- Após a execução: `git rev-parse HEAD` preservou SHA exato e `git status --porcelain` retornou limpo.
- Log local (não contém dados operacionais de clientes): `%TEMP%\deliveryos-q019-m1-7dddd9f5-20261013.log`, 3342 bytes. SHA-256 **`19B578C878DE2BBE343E3258831492016EC162DD460D361ADE6AC991C9878211`**.

## Resultado literal relevante

```text
M1A.1 — ponte canonica e estrutural: 37 passaram
1 FALHARAM:
  - C6 a metade do FUTURO: mudanca pos-baseline so passa dentro do envelope:
    caminho protegido mudou depois do baseline sem estar AUTORIZADO:
```

Os seguintes 12 caminhos foram retornados pelo guard C6:

1. `src/perfil-delivery/decisao.js`
2. `src/platform/copiloto/attention-authority.ts`
3. `src/platform/copiloto/causal-attention-orchestrator.ts`
4. `src/platform/copiloto/causal-identity-bridge.ts`
5. `src/platform/copiloto/conference-bridge.ts`
6. `src/platform/copiloto/shadow.ts`
7. `src/product/ui/surfaces/copiloto.js`
8. `src/product/ui/surfaces/operacao-viva.js`
9. `src/product/viewmodels/copiloto-vm.ts`
10. `src/product/viewmodels/historico-vm.ts`
11. `src/product/viewmodels/operacao-viva-vm.ts`
12. `src/product/viewmodels/tata-comanda-vm.ts`

**C6 comparou a lista atual acima com a lista esperada vazia.** Portanto, não se trata de teste verde nem de aviso ignorável.

## Leitura conservadora

1. Foi demonstrado que a lista reconstruída na folha [preflight Q-019](./DELIVERYOS_Q019_VISUAL_PREFLIGHT_2026-10-13.md) coincide com os 12 caminhos efetivamente recusados em `7dddd9f5`.
2. O teste por si só **não determina** se esses patches devem ser preservados, corrigidos ou revertidos. O envelope `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md` ainda informa `AWAITING_CESAR_M1B_EXECUTION_APPROVAL`.
3. Não abrir `AUTHORIZED_PATHS` para os 12 caminhos como grupo nem reancorar o baseline. Avaliar alterações por missão, classe, commit, autorizações históricas e regressões negativas antes de solicitar aprovação estreita.
4. Reexecutar C6 no commit exato de qualquer correção futura e guardar prova dos controles negativos; `product-ux` CI verde não substitui C6.
5. A aprovação visual humana, o ensaio Android sintético sem GPS e o pedido próprio Neemo/Teknisa supervisionado permanecem etapas distintas e NÃO EXECUTADAS.

**Efeitos desta prova:** uma worktree local limpa, um log local com hash e este documento na branch de auditoria. PR #106 permanece Draft/HOLD e nenhuma produção foi alterada.
