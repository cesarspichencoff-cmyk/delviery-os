# TATÁ Comandas — turno: custódia e histórico divergente (16/10/2026)

**Estado:** observação passiva real + decisão de arquitetura **DRAFT/HOLD**. Não é autorização de alteração da CAIXA.

## Objetivo e fronteira

Garantir que o serviço Windows V2 só *consuma* um turno confirmado, sem poder elevar uma declaração não autenticada a aprovação operacional nem reescrever sua própria trilha de auditoria. Preservar ordem real → V6.8 → três vias → piloto Epson Itaim sob portões separados.

Leitura realizada em `CAIXA_MOOCA`, no diretório `C:\ProgramData\TataComandaReader`, sem SQL, pedidos/clientes, alterações de ACL, logs, serviços, impressoras ou spooler. Metadados de identidade pessoal e conteúdo de `source_ref` não foram exportados.

## Evidência observada (FACT)

1. **ACL Windows (Get-Acl; leitura real):**
   - Pasta `state`: ACL de herança protegida; `SYSTEM` e `Administrators` com `FullControl`; `NT SERVICE\TataComandaReader` com `Modify, Synchronize`.
   - Arquivos `production-service-state.json` e `production-service-history.jsonl`: as mesmas permissões herdadas da pasta. Logo, **o próprio serviço tem capacidade técnica de modificar estado E histórico**. Isto não prova que o tenha feito.
   - `bin\set_production_service_state_v1.ps1`: o serviço tem `ReadAndExecute`, enquanto `SYSTEM` e `Administrators` têm `FullControl`.
   - No conjunto de ACLs lido, não apareceu concessão explícita a `Everyone`, `Authenticated Users` ou `BUILTIN\Users`. Não é garantia sobre todos os privilégios/identidades possíveis da máquina.
2. **Correspondência real estado↔última linha do histórico:**
   - Estado `production-service-state.json`: schema `deliveryos.production-service-shift-state.v2`, data **2026-10-14**, serviço **LUNCH**, `valid_from_local` presente e `valid_until_local` presente. SHA-256 `5725D734C894E61D590B2453B593AC3E5C72BFB4BE84F8138FE525E8358D0EEC`.
   - Última linha parseável de `production-service-history.jsonl`: schema `deliveryos.production-service-shift-history.v1`, data **2026-10-07**, serviço **DINNER**, `valid_from_local` **ausente**, `valid_until_local` presente. SHA-256 integral do arquivo `C54AA7DEA7A2FBFB2B724CBD324DFA179225CA1154786C4FAE7FEFB0A507F460`.
   - O histórico local tem cinco linhas segundo a API de metadados da estação, modificado pela última vez em **2026-10-07T21:44:42.509Z**; o estado foi alterado posteriormente. **A última linha desse arquivo não reflete o estado atual.**
3. **Canais de código observados:** busca passiva em **146** arquivos de script (`.ps1`, `.js`, `.cjs`) dos diretórios instalados `bin` e `shadow`, encontrando **5** caminhos com referências a nomes do estado/histórico (um atualizador, watchers de versões atuais/anteriores e arquivos temporários). A busca não comprova exclusividade dos escritores: binários, tarefas, operador, scripts externos e histórico alternativo não foram exaustivamente auditados.
4. **Escritor instalado:** `set_production_service_state_v1.ps1`, SHA-256 `0E59FB9BB242F29CB757536141A86F8A5F6A2D0BB52C494422FA6A713E7DCE3A`, grava o estado antes de anexar o histórico; omite `valid_from_local` no estado e no histórico, e registra `HUMAN_CONFIRMED_RULE` sem autenticação independente nesse script. **Não foi executado**.
5. **Consumidor Windows V2:** exige `valid_from_local` e `valid_until_local` explícitos e considera o fim exclusivo. A paridade do contrato `serviceShiftState.ts` e da revisão V7.4 foi corrigida em PR #107, CI aprovado. O candidato V8.12 só prepara uma proposta PowerShell sem efeitos, não instala novo escritor (CI [#38838986541](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38838986541), Windows+Linux SUCCESS).

## INTERPRETAÇÃO (não confundir com fato)

- Um arquivo de histórico que o mesmo principal consegue modificar **não é testemunha independente** do serviço.
- O desencontro entre o estado e a última linha desse histórico impede declarar auditoria de transição ou capacidade de recuperação confiável. **Não prova adulteração, ação indevida, origem exata da escrita de 14/10 ou inexistência de outro histórico.**
- Mudar uma data ou remover bloqueio para obter `ready=true` agora seria uma concessão de efeito sem prova e poderia retroagir autoridade a pedidos anteriores.

## Menor contra-rota segura — proposta, ainda NÃO autorizada

1. **Antes de qualquer mudança de ACL:** provar no código e em um sandbox que o leitor só precisa de leitura de `production-service-state.json` e que nenhuma dependência operacional legítima exige escrita como serviço. Localizar a origem do estado de 14/10 ou declarar autoria UNKNOWN; verificar mecanismos alternativos de histórico, caso existam.
2. **Separação de papéis no desenho:** identidade de execução do watcher com leitura limitada do estado; mecanismo *distinto* e explicitamente aprovado de confirmação/gravação de turno. Não aceitar `source_ref`, `HUMAN_CONFIRMED_RULE`, comentário do GitHub, hash ou token do próprio executor como autenticação independente. Reutilizar as identidades e controles Windows existentes somente se a custódia real puder ser provada.
3. **Registro transacional em sandbox:** ligar proposta de turno e autorização humana ao dia/unidade/serviço/janela, checar revisão anterior e CAS/concorrência; registrar tentativa durável antes da alteração e estado final confirmado depois. Testar queda antes, durante e depois de cada escrita e reconciliação sem autocorreção em estados ambíguos. Um JSONL na mesma pasta não é prova externa imutável.
4. **Piloto do efeito de estado:** só depois de aprovação humana específica e revisão de ACLs/rollback, em janela controlada, com captura mínima de hashes e possibilidade de parar sem tocar na impressão. Não atualizar retroativamente pedidos ou turnos antigos.
5. **Portões posteriores separados:** atestado SQL atual do principal, cinco fontes reais independentes V6.8, regras de embalagem/observação, três vias, deduplicação/reconciliação, prova física e autorização Epson Itaim.

## Prova e limites

- **REAL_READ_ONLY_FACT:** ACL, hash dos arquivos e divergência de última linha vistos no host.
- **CODE_READY/TEST_PASS:** V7.4, resolvedor legado e candidato V8.12 na PR (não instalados).
- **UNKNOWN:** quem alterou o turno em 14/10, se há trilha adicional, custódia independente e permissões SQL atuais.
- **NOT AUTHORIZED/NOT PROVEN:** alteração de ACL, atualização do turno, nova instalação, impressão física, merge, deploy e liberação operacional.

**Decisão:** manter PR #107 DRAFT/HOLD; preservar fonte e recibos; não aumentar complexidade de autenticação até provar uma fronteira de custódia distinta, já disponível e suficientemente segura.
