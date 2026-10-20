# V8.42 — Autorização humana e testemunha independente por turno
**Estado: REVISÃO DE ARQUITETURA / HOLD. NÃO INSTALADO. SEM APROVAÇÃO OPERACIONAL.**

## Base factual
- A PR #107 permanecia OPEN/DRAFT/UNMERGED no início desta revisão, HEAD V8.41 09fb5fbb7a6c48ca2649f05f5616346ddce72829; CI V8.41 2/2 sucesso.
- V8.40 observou em leitura o serviço real TataComandaReader em execução e uma ACE de escrita para o leitor em C:\ProgramData\TataComandaReader\evidence. **Nunca** converter essa pasta em ledger de autorização independente.
- V8.36–V8.39 já cobrem assinatura Ed25519, escopo do turno, nonce e ACL em laboratório; V8.41 já valida caminhos propostos. Nenhum dos quatro autentica pessoa real ou controla testemunha externa.
- Projeto atual: **HOLD**. Não alterar arquivos do caixa, serviço, ACL, SQL, fiscal, impressoras, pedidos, old-generation ou entrar em contato com Teknisa.

## Decisão arquitetural proposta
A autorização tem **três autoridades separadas** e duas superfícies locais:
1. **Leitor** (serviço Windows): produz solicitação contendo unidade, identificador de turno, revisão atual e próxima, digests pré/pós, turno-alvo e ID exclusivo; **não** aprova, não emite grant, não persiste uso único em custódia, não escreve arquivos protegidos.
2. **Responsável humano** (identidade real e papel atribuído pela operação): em superfície externa ao serviço, vê **unidade + turno atual→pretendido + revisão/identificador + horário de validade** e confirma uma mudança específica com autenticação forte e gesto explícito. Nenhuma pessoa, cargo, passkey ou conta está cadastrada/aprovada nesta fase.
3. **Serviço de custódia externo** (domínio operacional e administrativo distinto do leitor/caixa): autentica humano e papel, valida challenge vinculado ao HASH DO PEDIDO EXATO, revogação e relógio de servidor, **reserva uso único atomicamente**, emite recibo/assinatura verificável e mantém histórico externo durável. Chave privada nunca deve residir no caixa; chave pública pinada/verificada fora da entrada recebida. O serviço não pode aceitar declarações de "approved=true" do leitor como autoridade.
4. **Writer local restrito**, identidade distinta do leitor: só após decisão externa atual e verificada, confere pré-imagem/revisão e grava estado protegido mediante transação controlada, mantendo capacidade de restauração de bytes reais. O leitor recebe somente leitura. Identidade real, token, ACL, owner e privilégios permanecem UNKNOWN até preflight autorizado.
5. **Testemunha independente**: custódia remota com trilha resistente a exclusão/adulteração, hash encadeado/âncora externa, auditoria de alterações e backup testado; banco remoto sozinho **não equivale** a imutabilidade ou à prova de domínio de falha. Definir retenção, proteção contra operador privilegiado, desastre e recuperação antes de chamar de independente.

**Proposta preferida para experiência humana:** login/step-up via passkey WebAuthn com verificação do usuário na aplicação da custódia e tela explícita "Autorizar esta troca de turno". **WebAuthn autentica o usuário no domínio correto; não assina automaticamente o texto da troca.** O servidor precisa associar o challenge ao hash imutável do pedido exibido, ao papel e à sessão e validar essa associação ao autorizar. Alternativas ou exigência de dupla aprovação dependem da política humana ainda indefinida.

## Contrato de solicitação e concessão
O pedido fixa: store_id, shift_record_id, from_revision, to_revision=from_revision+1, from_sha256, to_sha256, target_shift, request_id. Digest canônico com separação de domínio (versão). A tela do humano recupera a versão **do lado da custódia**; não confia em HTML/texto controlado pelo leitor.
A concessão assinada vincula esse digest, authorization_id aleatório, principal humano autenticado, papel autorizado, key_id, issued_at/expires_at, época de revogação, ID de recibo do ledger e política. O servidor verifica validade, chave e revogação no momento de **reservar/aplicar**, não somente no login. Prazo máximo de laboratório V8.36 = 900s; operar com janela menor é recomendação **a decidir**, nunca flexibilizar automaticamente.
O leitor não pode emitir grant, consumir nonce, reescrever concessão, alterar regra de confiança ou promover "CI PASS" a decisão real.

## Fluxo seguro e estados de falha
0. **REQUEST_CREATED** — somente solicitação; estado atual não muda.
1. **HUMAN_CONFIRMED** — challenge, UI exata, autenticação e autoridade avaliados no servidor externo.
2. **EXTERNAL_RESERVED** — operação atômica externa reserva authorization_id + (unidade, turno, revisão de origem). Restrição UNIQUE e CAS; uma reserva anterior, estado indefinido ou banco indisponível => HOLD, nunca "tentar de novo" com novo ID automaticamente.
3. **PROTECTED_WRITER_APPLIED** — writer independente verifica o grant, a pré-imagem exata e confirmação atual de reserva/revogação; gravação atômica local com journal/preimage para rollback. Sem controle comprovado da janela entre consulta externa e escrita local, ativação bloqueada. Nenhum outro writer/geração antiga pode alterar o mesmo estado.
4. **EXTERNAL_SETTLED** — recibo durável externo amarra estado pós-aplicação/hash, custódia, identificador e resultado.
**Ambiguidade** em qualquer etapa após reserva (rede, crash, energia, commit local sem ACK, divergência de hashes) => **HOLD_UNRECONCILED**, preservar evidências e exigir reconciliação humana baseada na fonte autoritativa. A autorização reservada não é reutilizada; sem rollback automático ou segundo disparo de turno. Também **HOLD** em offline, relógio/revogação não confiável, principal revogado, suporte à custódia indisponível ou turno já modificado. Uma alteração local não confirmada externamente não é "concluída".

## Separação física/lógica proposta, não instalada
- Legado: C:\ProgramData\TataComandaReader\state\production-service-state.json — não migrar implicitamente.
- Evidência do leitor: C:\ProgramData\TataComandaReader\evidence — leitor pode escrever; não custódia.
- Estado aprovado futuro: C:\ProgramData\TataComandaReader\approved-shift\production-service-state.json — reader read-only; writer restrito.
- Espelho/cache local de nonces: C:\ProgramData\TataComandaReader\custody\shift-authorization-nonces — **não é autoridade de uso único nem testemunha externa**. A proteção remota permanece indispensável, mesmo com ACL perfeita.

## Escolhas a fechar antes de construir produtor real
1. **César/gestão** designa titular e substituto reais, escopo (unidade, turno, horários), dupla aprovação quando necessária, procedimento de saída/revogação e recuperação de autenticador. Nunca inventar identidade.
2. Identificar infraestrutura **já disponível** que possa operar custódia independente, chave com acesso segregado, logs/retention e controle de custos. Comparar reutilização própria vs serviço adicional; novo custo só com autorização.
3. Modelo de confiança: domínio, chaves, rota de rotação/revogação, relógio servidor, autenticação do writer, credential bootstrap e firewall para impedir leitor de alterar/revogar/apagar.
4. Semântica de aplicação real: pré-imagem de bytes, transação de arquivo/rename/fsync conforme Windows, watcher old-generation, crash/power-loss e como provar consumidor único.
5. Validar riscos de administrador local e comprometimento do SO: ACL local não resiste necessariamente a admin/SYSTEM; a testemunha remota precisa detectar alteração mesmo nessa hipótese.

## Evidência mínima para saída de HOLD (gates independentes)
- G1: identidade da pessoa e delegação de autoridade aprovadas na operação, com prova de revogação.
- G2: fluxo WebAuthn/challenge ligado à operação exata em sistema externo real; autenticação testada, sem aceitar alegação do cliente.
- G3: reserva atômica e durável, unicidade, prevenção de replay, casos de concorrência, crash e queda de energia na custódia externa **observados**, com ledger externo que não pode ser modificado pelo leitor.
- G4: chaves pinadas, assinatura verificada, revogação e tempo independentes, observação real da disponibilidade/falha de rede.
- G5: writer/reader effective token, grupos, owner/herança/ACL e diretórios reais medidos, old-generation neutralizada e rollback de bytes reais demonstrado em janela segura.
- G6: cinco fontes independentes V6.8, impressões físicas três vias Itaim, aprovação humana e demais bloqueios preexistentes; sem confundir esses testes com G1–G5.
- G7: permissão operacional específica para implantação/alteração, cronograma e reversão. Até lá PR rascunho, sem merge/deploy.

## Verificador V8.42 e limite de prova
O verificador offline planejado em tools/comandas_human_custody_protocol_v842_offline.cjs avalia **somente forma, sequência e consistência de alegações**. Não autentica humanos, não verifica assinaturas externas e não concede permissão. Mesmo cinco eventos formalmente válidos resultam REVIEW_ONLY_UNTRUSTED_SEQUENCE_COHERENT, nunca PRODUCTION_AUTHORIZED. Eventos incompletos/fora de ordem => HOLD. O resultado não representa a CAIXA_MOOCA.

## Fontes e rastreabilidade
- OWASP Transaction Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- NIST SP 800-63B-4, phishing/replay resistance e WebAuthn: https://pages.nist.gov/800-63-4/sp800-63b.html
- Microsoft SERVICE_SID_INFO (ServiceSidType distinto da conta virtual): https://learn.microsoft.com/en-us/windows/desktop/api/winsvc/ns-winsvc-service_sid_info
- V8.41: docs/COMANDAS_V841_SEPARACAO_CUSTODIA_TURNO_REVIEW_ONLY.md; Issue #102 (checkpoint V8.41) e PR #107.
