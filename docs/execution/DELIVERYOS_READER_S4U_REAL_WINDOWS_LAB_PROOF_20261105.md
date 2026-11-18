# Delivery OS Itaim — prova real de S4U no Windows de laboratório

**Data:** 05/11/2026. **Escopo:** somente laboratório GitHub Actions, sem acesso à rede produtiva, a pedidos, ao `CAIXA_MOOCA`, ao Gestor ou ao banco SQL. **Etapa:** L1 de L8, N2/N3 ainda HOLD e **0/8 aceites operacionais**. PR #137 continua DRAFT/HOLD.

## O que foi efetivamente executado

[GitHub Actions #42045292512](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42045292512), no commit `3a233c4d463f3f5bc49cbb924a7a4f2447843231`, terminou **completed/success — 4/4 jobs**.

O job Windows invocou `tests/silent-runner/verify-s4u-windows-fixture.ps1` somente em uma VM GitHub descartável (guarda explícita para `GITHUB_ACTIONS=true`, repositório exato e hostname diferente de `CAIXA_MOOCA`). O roteiro:
1. Criou diretório temporário com nome fixo `deliveryos-s4u-lab`, marcador obrigatório e **entrada inteiramente fictícia**.
2. Registrou **tarefa temporária com nome GUID** no Task Scheduler, principal do usuário da VM, `LogonType=S4U`, `RunLevel=Limited`, política `IgnoreNew`, executável `node.exe` e script de fixture, sem tarefas reais.
3. Iniciou a tarefa apenas na VM e comprovou a criação de um recibo de início. O script `s4u-observer-fixture.cjs` leu o arquivo fictício local e escreveu dois comprovantes em pasta temporária, sem abrir serviços, navegadores ou pedidos.
4. Conferiu **10/10 amostras de ausência de janelas visíveis** pelo PID do processo e confirmou que o foco não mudou.
5. Confirmou execução na **sessão 0** e recibo `LAB_LOCAL_READ_WRITE_OK`, com `ordersPublishable=0` e `customerDataExported=false`.
6. Aguardou o **encerramento real** da tarefa antes de conferir `LastTaskResult=0`. Remoção da tarefa temporária e diretório da VM no bloco `finally`.

**Evidência do log Windows:** `S4U_DISPOSABLE_WINDOWS_LOCAL_IO_PASS 1/1 S4U_PRINCIPAL 10/10_NO_VISIBLE_HWND NO_FOCUS_CHANGE FICTIONAL_ONLY SESSION_0`. A regressão anterior do executor nativo manteve `SILENT_OBSERVER_WINDOWS_LAB_PASS 45/45 NO_VISIBLE_WINDOWS`; também passaram `NATIVE_READER_LAB_SCRIPT_IDENTITY_PASS 3/3` e `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS 10/10`.

## Falhas reais encontradas e não ocultadas

- [CI #42044558441](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42044558441): **FAILED** porque o cmdlet `New-ScheduledTaskPrincipal -RunLevel` usa o enum `Limited` em vez do valor do XML `LeastPrivilege`. Falhou antes de registrar a tarefa.
- [CI #42044878676](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42044878676): **FAILED** após o processo S4U ter iniciado e escrito os dados fictícios: `LastTaskResult=267009` é `0x41301`, estado transitório **RUNNING**, não um erro definitivo. Corrigido para aguardar `LastTaskResult=0` e `Task.State` diferente de `Running`, com limite e falha fechada.
- **CI final:** #42045292512 terminou com quatro jobs concluídos com sucesso. Não foram suprimidos erros nem afrouxadas as verificações de janela/privacidade.

## O que essa prova NÃO significa

- O ensaio utilizou a **conta do runner GitHub**, não a conta efetiva `Tata`. Permissões ACL e direito de logon em lote (`SeBatchLogonRight`) no caixa **não estão comprovados**.
- A tarefa temporária executou **um script fictício**, não `observer.cjs` nem as dependências do Reader V2; não comprova paridade de status ou cobertura de pedidos.
- As dez amostras mostram ausência de janela visível no laboratório, **não garantem zero flash em qualquer instante** e não substituem a percepção do operador no caixa.
- S4U não dá acesso à rede nem a EFS; o código observado parece local, mas o usuário de campo e suas ACLs precisam de confirmação.
- O Agendador da máquina operacional não foi tocado. Não houve download/exposição de conteúdo bruto, abertura de comanda, instalação, tarefa criada no caixa, alteração de XML, merge, deploy ou impressão.

## Próximo gate material

**Antes de trocar a tarefa instalada `DeliveryOS-Itaim-Reader-Observe`:** verificar de forma passiva sua identidade, os caminhos locais efetivamente usados e permissões; depois montar um teste supervisionado e reversível da tarefa real com a mesma conta, horário, política de instância e argumentos. A intervenção **altera uma tarefa Windows**, portanto exige autorização separada de César. A autorização existente, condicionada à leitura de uma comanda antiga sem janelas/alterações, **não autoriza esse efeito**.

Se ACL ou execução em lote for inviável, não insistir em alteração S4U; usar a alternativa de launcher GUI nativo já testada, igualmente sujeita a autorização e prova no ambiente real. Somente depois de invocação local silenciosa comprovada retomar N2/N3 de uma revisão já emitida, com recibo sanitizado, sem copiar ou exportar o pedido bruto.

**Veredito:** `S4U_REAL_DISPOSABLE_WINDOWS_LAB=PROVEN`; `S4U_LOCAL_IO_LAB=PROVEN`; `NO_VISIBLE_HWND_SAMPLED=PROVEN`; `S4U_ITAIM_ACL=UNKNOWN`; `FIELD_TASK_CHANGED=NO`; `N2/N3=HOLD`; `V1_ACCEPTED=0/8`.
