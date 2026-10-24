# V8.41 — Separação de custódia fiscal/operacional e autorização de turno
**Estado: PROPOSTA PARA REVISÃO — NÃO INSTALADA / NÃO AUTORIZADA / NÃO PROVADA NO HOST**

## Foco e fronteira
Proteger mudança de turno e nonce de autorização contra escrita, exclusão e falsificação pelo serviço leitor, preservando a capacidade do leitor de registrar eventos operacionais. Esta proposta **não** executa migração, altera serviço, reinicia caixa, imprime, modifica SQL, troca ACL ou envia dados à Teknisa. Não resolve o incidente de sincronização de XML, tratado separadamente pela equipe.

## Observações fundamentadas (não generalizar para prova de token)
1. V8.39: prova de **laboratório** de assinatura Ed25519, nonce exclusivo e duas contas Windows distintas. Não autentica pessoa real, testemunha externa, relógio/revogação ou proteção contra perda de energia. Run CI #39331555525 PASS.
2. V8.40: Windows descartável PASS (CI #39356929490). A observação real e somente leitura na CAIXA_MOOCA documentada na Issue #102, comment #6282972985, confirma serviço `TataComandaReader` em execução, conta virtual, `ServiceSidType=NONE`. Esse último dado isolado **não** comprova composição de token/grupos nem ausência da identidade virtual.
3. `C:\ProgramData\TataComandaReader\evidence` apresenta uma ACE **explícita de escrita** para o SID derivado do serviço. Isso é compatível com registros operacionais; **não** comprova proteção de um ledger de autorizações e impede classificá-la como pasta independente apenas porque se chama `evidence`.
4. O watcher V2 instalado ainda apontava para `C:\ProgramData\TataComandaReader\state\production-service-state.json` na última auditoria material V8.23; essa árvore foi registrada como gravável pelo serviço. O destino proposto no V8.14, `C:\ProgramData\TataComandaReader\approved-shift\production-service-state.json`, estava ausente na última auditoria. **Não há rechecagem atual desses dois caminhos no host nesta etapa.**
5. Uma consulta remota adicional de ACLs em 20/10/2026 foi **bloqueada pela camada de segurança da ferramenta antes da execução**. Não insistir com uma rota equivalente e não classificar o comando bloqueado como observação real.

## Layout proposto — SOMENTE desenho
| Papel | Caminho | Escrita pretendida |
|---|---|---|
| Estado V2 atual | `C:\ProgramData\TataComandaReader\state\production-service-state.json` | Legado; NÃO migrar automaticamente |
| Eventos operacionais | `C:\ProgramData\TataComandaReader\evidence` | Serviço leitor conforme necessidade operacional, **não** custódia |
| Turno aprovado futuro | `C:\ProgramData\TataComandaReader\approved-shift\production-service-state.json` | Custodiante independente; leitor estritamente leitura |
| Nonces futuros (novo candidato) | `C:\ProgramData\TataComandaReader\custody\shift-authorization-nonces` | **Somente custodiante autenticado**; leitor sem criar/alterar/excluir |
| Testemunha de aprovação | **Fonte externa independente A DEFINIR** | Não controlada pelo serviço leitor nem pela mesma conta local |

O caminho `custody\shift-authorization-nonces` é apenas uma **sugestão de namespace**, não instalação, decisão sobre owner, conta de escrita existente ou garantia de isolamento físico. Um diretório no mesmo volume/host **não constitui** testemunha externa nem resistência comprovada a perda de energia.

## Contrato de permissão e identidade antes da implementação
- **Leitor** `NT SERVICE\TataComandaReader`: acesso de leitura ao estado aprovado e aos recibos necessários, nunca Write/Modify/Delete/TakeOwnership/ChangePermissions sobre turno protegido, nonce ou configuração de confiança. Confirmar **token efetivo**, grupos e privilégios no host real; ler apenas DACL não basta.
- **Custodiante**: identidade de pessoa real escolhida/confirmada por César e autenticada por mecanismo confiável, com chave sob custódia independente do leitor. Nomes de contas, SIDs de laboratório, comentários em JSON e `HUMAN_CONFIRMED_RULE` não bastam.
- **Confiança/tempo/revogação**: chave pública pinada e testemunha externa autenticada; revogação consultada a fonte independente; relógio e nonce consumido devem ser verificados de modo durável e com tratamento de replay/crash.
- **Local do registro**: a pasta `evidence` e a árvore `state` **não** podem servir como ledger de aprovação enquanto concedem escrita ao leitor. Um candidato de ledger exige ACL de parent, owner, herança, regras explícitas e herdadas, acesso de grupos amplos, reparse points e efetivo token de serviço **medidos**, sem aplicar ACL por inferência.

## Prova necessária antes de qualquer corte
1. Confirmar, somente leitura, diretórios/arquivos reais existentes, caminho de origem usado pelo watcher atual, ACLs relevantes, serviço, old generation, supervisor e efeito das reinicializações SCM.
2. Escolher explicitamente custodiante humano/autoridade de assinatura e origem externa da prova; comprovar separação de privilégios.
3. Validar em ambiente descartável a transição assinada, expiração, revogação, duas tentativas concorrentes, crash, histórico e rollback de **bytes reais de teste**, com consulta de fonte externa *real* ou marcar desconhecido.
4. Somente numa janela autorizada específica: preparar troca reversível, verificar desativação de geração antiga, custódia exclusiva, backup/rollback; execução/ativação não estão autorizadas pelo simples “continuar”.
5. Portões independentes V6.8, auditoria SQL, três vias físicas e validação humana permanecem pendentes.

## Decisão operacional
**HOLD**. Documento de arquitetura / plano de aceite. **Não criar** `approved-shift`, `custody`, não alterar ACL, estado atual, serviços, política fiscal, spooler ou impressão sem autorização específica de efeito, controle de rollback e evidência do alvo real.

Fontes internas: [Issue #102 (V8.40 real)](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/102#issuecomment-6282972985), [Issue #102 (V8.23)](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/102#issuecomment-6227331440), [V8.39 CI](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/39331555525).
