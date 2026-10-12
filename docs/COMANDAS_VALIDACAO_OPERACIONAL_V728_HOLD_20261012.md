# Comandas térmicas — preparação de validação operacional V7.28

**Data-base:** 12/10/2026. **Destino:** operação CAIXA Itaim; Cozinha, Sushi e Conferência.  
**Estado de liberação:** `DRAFT / HOLD / NÃO INSTALADO`. Documento preparatório, não é autorização, aceite humano, certificado de segurança ou relatório de máquina.

## 1. O que o GitHub consegue provar sem Windows

- O GitHub Actions executa o consumidor V2 **candidato V7.14**, motor canônico da Academia fixado por SHA-256, reconciliação V6.8 e renderer offline das três prévias SVG. Nada disso altera serviço, sequência, impressora, banco ou produção.
- V7.24 copia as oito fontes de regras e o executável para um diretório temporário, registra seus hashes e recusa discrepâncias de linhagem.
- V7.25 usa `O_NOFOLLOW`, `O_NONBLOCK`, `fstat` do mesmo descritor e leitura limitada para reduzir substituições de origem durante a leitura. **Não é isolamento contra um agente com acesso privilegiado ao próprio processo.**
- V7.26 reexecuta pedidos fictícios adversariais: alergias em nota geral/item, duplicidade de fonte de observação, vínculo item/produto incorreto, origem de observações não comprovada, alteração de quantidade, revisão divergente e falta de aceite independente de nota geral.
- V7.27 bloqueia um defeito evidenciado por teste RED: o `order_key` adulterado era ecoado pelo consumidor e aceito pelo reconciliador, produzindo três prévias. Agora o gate exige `order_key === CDFILIAL + "|" + CDLOJA + "|" + NRCOMANDA` antes de executar o V2.
- V7.28 testa alterações individuais nas oito propriedades brutas de cabeçalho e cinco propriedades de item previstas no snapshot do watcher; cada mutação sem revisão do hash precisa resultar em **BLOCKED e zero prévia**.
- Em nenhum estágio se prova automaticamente que uma nota é segura, que existe aprovação humana de turno ou que um operador reconheceu uma exceção.

**Último CI verde confirmado antes da matriz V7.28:** [#38207072502](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38207072502). A versão V7.28 depende do próprio CI verde do commit subsequente para ser considerada TEST_PASS.

## 2. Oito portões materiais de mundo — todos abertos

| Portão | Evidência mínima necessária | Situação |
|---|---|---|
| 1. Serviço e permissões | Identidade real de `TataComandaReader`, executável, usuário/ACLs e vínculo do processo obrigatório | **UNKNOWN** |
| 2. Oito fontes reais | Arquivos regulares, digest do motor canônico fixo e schemas/identidade em leitura autorizada | **UNKNOWN** |
| 3. Turno | Revisão humana atual, `valid_from_local` e `valid_until_local`, sem vigência retroativa | **UNKNOWN** |
| 4. Bloqueios atuais | Todas as razões relevantes de identidade, praça, sacolas, caixas, kits e observações resolvidas por evidência | **UNKNOWN** |
| 5. Pedidos reais | E2E em 8 contratos e ao menos 23 pares reais atuais com snapshot exato, observações e reconciliação | **UNKNOWN** |
| 6. Embalagem física | Fatos de caixa, sacola, kit e montagem atestados pela operação, não apenas por regra simulada | **UNKNOWN** |
| 7. Recuperação e duplicidade | Backup, rollback ensaiado, monitoramento e **supressão durável de impressão repetida** no fluxo instalado | **UNKNOWN** |
| 8. Epson física | Teste óptico e aceite explícito CAIXA Itaim, papel e alinhamento/legibilidade reais | **UNKNOWN** |

**Portão adicional de arquitetura:** a inspeção do código conhecido do serviço Windows `runtime/windows/TataComandaReader.ContinuousService.v2.cs` aponta para watcher e `live_shadow_consumer_loop_v1.cjs`, **não demonstra** chamada obrigatória do V2/V6.8. O contrato de execução instalado permanece **NÃO PROVADO**. Uma execução verde do CI não o substitui.

## 3. Roteiro seguro quando o acesso remoto autorizado retornar

1. Revalidar HEAD do PR #99, manter HOLD e autorização vigente. Não executar nenhum upgrade ou reiniciar serviço para obter a evidência.
2. Fazer observação do serviço **somente leitura**, usando `tools/auditar_servico_windows_v723_readonly.ps1` em contexto local autorizado; conferir privacidade do relatório e validar o envelope em `tools/validar_observacao_windows_v723.js`. Hash compatível **não certifica** identidade operacional, ACL nem a chamada do V6.8.
3. Verificar ligações efetivas watcher → consumidor → reconciliador, contrato de revisão, turno e contador, preservando cópia de evidências restrita; não copiar mensagens de clientes para comentários do GitHub.
4. Obter observações exatas de 23 pares e os oito contratos E2E. Evidenciar o comportamento de pedidos duplicados, revisões posteriores e ordens simultâneas. **Prévia duplicada offline não equivale a impressão duplicada real nem demonstra prevenção de reimpressão.**
5. Com as evidências acima, avaliar rollback sem trocar a versão instalada e planejar eventual ensaio físico Epson somente após aceite separado de César.
6. Só considerar qualquer decisão de merge/implantação/impressão após autorização humana específica e fechamento integral dos portões materiais.

## 4. Itens que não podem ser promovidos por interpretação

- `TEST_PASS` de GitHub `≠` serviço instalado. Um arquivo de snapshot fixo `≠` motor/fonte instalada atual.
- Comparação de hash de arquivo `≠` confirmação de execução por serviço, nem autenticação de aprovação humana.
- `ready_for_downstream_shadow` e `service_resolution.evidence` dentro de fixture `≠` turno autorizado.
- O mesmo snapshot pode ser reproduzido várias vezes na ferramenta offline. **Idempotência operacional e relação com spooler são lacunas abertas.**
- Um SVG cuja soma SHA coincide com uma referência `≠` boa impressão Epson no papel.
- Exceções legadas e `source_refs` autodeclarados `≠` atestação de kits/sacolas por operador.

**Fronteira de efeitos vigente:** não merge, não deploy, não SQL write, não Windows write, não restart de serviço, não spooler, não impressão, não contador real e não despesa adicional.
