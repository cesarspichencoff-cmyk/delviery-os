# Estado Atual — DeliveryOS

> Última atualização: 04/07/2026, sobre o commit `d8f227f`. Quando este documento divergir do
> repositório, o repositório vence — e este arquivo deve ser atualizado.

## 1. Função deste documento

Memória executiva oficial do DeliveryOS. Deve ser lido no início de novas conversas, junto com
`CLAUDE.md` e os documentos específicos da missão atual. Existe para reduzir dependência da janela de
contexto e evitar que decisões importantes fiquem presas em conversas antigas. **Se houver conflito
entre conversa antiga e documentos versionados, os documentos versionados são a fonte oficial.**

## 2. Visão do DeliveryOS

Não é ERP, não é dashboard, não é sistema de alertas, não é checklist. É uma **camada de consciência
operacional**: protege atenção humana, transforma sinais em decisão e transforma cada turno em
memória. A ambição é criar capacidades que humanos não conseguem sustentar sozinhos em escala (memória
que não decai, atenção que não cansa, estado que não se perde). A interface é consequência da
inteligência operacional — nunca o centro do produto. Fundamentos completos: `docs/Constituicao.md` →
`docs/Leis_Fundamentais.md` → `docs/Manifesto_Produto_Design.md` → `docs/Modelo_Operacional_Consciencia_DeliveryOS.md`.

## 3. Princípios inegociáveis

- DeliveryOS não muda de tela. Ele muda de consciência.
- Atenção humana é recurso sagrado. Silêncio é sinal de saúde.
- O sistema declara o que sabe, o que suspeita e o que não sabe. Nunca tratar hipótese como verdade.
- Nunca trocar a causa raiz do Foco. Se não houver ação segura dentro do foco ativo, mostrar o foco
  puro (`buildFoco()`).
- Nunca inventar inteligência para parecer melhor. A interface parece simples porque pensou tudo por trás.
- O produto nunca vira dashboard, ERP, BI, SaaS genérico ou vigilância da equipe.
- Dado incompleto é aceitável. Dado falso é veneno.
- Fluxo obrigatório para dado novo: bruto → inventário → parser → validação → relatório → aprovação
  humana → integração.
- Aprendizado estrutural: observação → evidência → proposta → aprovação humana → regra. Nunca regra
  automática.

## 4. Estado atual do projeto

**Fase: consolidação da cadeia de atenção e decisão.** A prioridade não é adicionar funcionalidade —
é garantir que Motor (`motor.js`, que elege a tensão que ocupa o slot de atenção) e Decisão
(`decisao.js`, que escolhe a ação exibida) representem **a mesma tensão operacional**. A fissura entre
os dois foi identificada pelo Red Team, **medida** por auditoria (30,8% dos onsets de foco mostram ação
de causa raiz diferente da que abriu o foco), e a estratégia de correção mais segura já está
documentada — aguardando aprovação para implementar.

## 5. O que já está consolidado

- `CLAUDE.md` como contrato de trabalho permanente (parceiro, não executor).
- **Composição real é pré-condição** para decisão operacional confiável (`docs/Decisao_Arquitetural_Composicao_Real.md`)
  — sintético só como fallback/demo/teste, sempre rotulado.
- 12 janelas reais replayadas com composição+timing+desfecho reais (`docs/Relatorio_Evidencia_Composicao_Real_12_Janelas.md`).
- Viés sintético provado em todas as 12 janelas, sem exceção na direção.
- Cardápio real: 199 itens / 8 praças (`data/cardapio_knowledge_seed.json`), casamento 100% contra 154
  itens únicos de 11 dias reais.
- Builder do cardápio corrigido com prova de diff vazio + trava permanente
  (`npm run verificar:cardapio`, `docs/Correcao_Builder_Cardapio.md`).
- Modelo Operacional da Consciência (`docs/Modelo_Operacional_Consciencia_DeliveryOS.md`) + seu Red
  Team (`docs/RedTeam_Modelo_Operacional_Consciencia.md`).
- Contrato Motor × Decisão (`docs/Contrato_Motor_Decisao.md`).
- Medição da divergência Motor × Decisão (`docs/Medicao_Divergencia_Motor_Decisao.md` +
  `tools/auditar_divergencia_motor_decisao.js`).
- Portabilidade: repo roda em qualquer máquina (sem caminhos absolutos), política de dados
  (`docs/Politica_Dados.md`), procedimento de continuidade (`docs/Procedimento_Continuidade.md`).
- Pedido de fonte contínua ao iFood pronto para envio (`docs/Mensagem_iFood_Pedido_Fonte_Continua.md`
  + `docs/Checklist_Fonte_Continua_iFood.md`).
- Proposta conceitual de Conferência Dirigida (`docs/Proposta_Sinal_Conferencia_Dirigida.md`) — sem código.
- Direção visual futura salva como inspiração (ver §13).

## 6. Evidências principais

- 12 janelas reais · 3.526 pedidos · 10.565 itens (20-30/06) + 790 itens (janela 01/07) · cobertura
  média 99,7% por UUID.
- Praça única: real 17% vs sintético 64% (médias; intervalos **sem sobreposição** — máx. real 30% <
  mín. sintético 58%).
- 2ª sacola/kit: real 59% vs sintético 21% (intervalos sem sobreposição).
- Tempo em foco: real > sintético em **12/12 janelas** (+36,5 min em média).
- Confiança alta nas recomendações: real 99,3% vs sintético 16,7%.
- 758 observações reais de cliente em 543 pedidos (16,9%) · **24 pedidos com alergia declarada** em 11
  dias — sinal ainda não acionável no motor.
- Divergência Motor × Decisão: **30,8%** dos 266 onsets de foco (82 casos de troca proibida de causa
  raiz), presente nas 12/12 janelas (16%-47%).
- Concentração da divergência: `order` 75,5% de troca · `fechamento` 100% (n=5) · `praca` 30,8% ·
  **`conferencia` 1,4% e `saida` 0% — saudáveis, não mexer**.

## 7. Decisões arquiteturais tomadas

- `sess.active.sit` é a fonte da verdade da atenção; `decisao.js` não pode escolher livremente outra
  causa raiz.
- Foco dominante = onde a atenção está. Ação dominante = o que fazer sobre esse foco. Ação pode
  **refinar** o foco (mesma causa, alvo mais específico), nunca **trocar** de causa raiz.
- Sem ação segura dentro do escopo do foco ativo → cair para `buildFoco()` puro.
- Calmo, Ambiente e Foco são conclusões da Consciência, não telas. Ambiente é clima, não alerta suave.
  Foco é interrupção justificada.
- Resolução e Memória Operacional são **conceituais, não codificadas** — Memória Operacional não deve
  ser implementada antes de haver sinal suficiente (medição pendente) e cadeia de atenção confiável.
- Correção recomendada (documentada, **não implementada**, em `docs/Decisao_Correcao_Motor_Decisao.md`):
  restringir `priorizar_praca`/`fechar_simples` à mesma praça do foco; fallback para `buildFoco()`;
  nenhum candidato novo para `order`/`fechamento`.

## 8. Riscos atuais

- Divergência Motor × Decisão (medida, ainda não corrigida): ação exibida pode ter causa raiz diferente
  da tensão ativa.
- `order` e `fechamento` sem candidatos próprios — os mais mal servidos pela Decisão.
- `priorizar_praca` pode vencer com praça diferente da que abriu o foco (67% das trocas proibidas).
- Assimetria de cooldown em `firedAt` (`motor.js:267-268`) — cooldown conta de momentos diferentes
  conforme o foco resolve cedo ou estoura o teto; não corrigida.
- Resolução sem definição de granularidade (praça-agregada vs. pedido-específica).
- Memória Operacional pode virar log sofisticado se implementada antes de medir sinal disponível.
- Ambiente pode virar alerta disfarçado (não tem piso de estabilidade temporal próprio).
- "Consciência" pode ser mal interpretada como serviço central mágico/IA — é nomenclatura sobre
  `motor.js`+`decisao.js`, nada mais.
- Design antes da arquitetura cognitiva estável → risco de dashboard/SaaS genérico/futurismo.
- Dado primário (exports iFood, WhatsApp, Bloco 3) ainda sem backup fora da máquina local.

## 9. Dívidas técnicas e conceituais

1. Reconciliar Motor × Decisão (decisão documentada; implementação pendente de autorização).
2. Provar a correção re-rodando a auditoria de divergência pós-implementação.
3. Decidir/corrigir a assimetria de `firedAt`.
4. Projetar Resolução (granularidade + o que registrar).
5. Medir se há sinal suficiente para Memória Operacional valer a pena (antes de desenhá-la).
6. Projetar Memória Operacional Autogerada (só depois do item 5).
7. Planejar calibração de baseline **com dado real** (nunca sintético).
8. Criar Linguagem de Produto (próximo documento da sequência fundadora).
9. Criar Linguagem Visual — só depois do modelo cognitivo estável.
10. Duplicação `buildFoco()` × textos de `decisao.js` (decidir fonte única de texto — separado da
    correção de escopo).

## 10. O que NÃO deve ser feito agora

- Não implementar Memória Operacional nem Resolução formal.
- Não criar design visual final, nem dashboard.
- Não criar novos candidatos de ação sem decisão arquitetural explícita.
- Não alterar `conferencia` e `saida` (medição: saudáveis).
- Não fazer tuning de baseline.
- Não depender de API perfeita do iFood (fonte contínua ainda em negociação).
- Não expandir funcionalidades antes de estabilizar atenção e decisão.
- Não criar uma "Consciência" como serviço central mágico; não transformar o projeto em IA genérica.
- Não commitar nada sem autorização do César; dados brutos/gerados nunca entram no Git.

## 11. Missão atual

A missão de definir a estratégia de correção **já foi executada**: `docs/Decisao_Correcao_Motor_Decisao.md`
existe no working tree, **aguardando autorização de commit**. A próxima decisão é do César: aprovar (ou
ajustar) a estratégia documentada e, só então, autorizar a implementação mínima.

**Estado do Git no momento desta escrita:** HEAD local = `origin/main` = `d8f227f`. Não commitados:
`docs/Decisao_Correcao_Motor_Decisao.md` e este próprio arquivo (`docs/Estado_Atual_DeliveryOS.md`).
Medição e ferramenta de auditoria já commitadas (`d8f227f`). Nada deve ser commitado sem autorização.

## 12. Próximas missões recomendadas (ordem lógica)

1. ~~Decisão de Correção Motor × Decisão~~ — feita, aguardando aprovação/commit.
2. Implementação mínima da correção (só após aprovação da decisão documentada).
3. Auditoria pós-correção (`tools/auditar_divergencia_motor_decisao.js` re-rodada; troca proibida deve
   cair para ~0).
4. Decisão sobre assimetria de `firedAt`.
5. Modelo de Resolução.
6. Medição de sinal para Memória Operacional → Modelo de Memória Operacional Autogerada.
7. Linguagem de Produto.
8. Linguagem Visual.
9. Interface Cognitiva.

## 13. Direção visual futura

Inspiração salva (moodboard, **não** UI final), vinda das telas mobile mais limpas e claras exploradas
em conversa: conceitos **"em fluxo"**, **"Conferência Dirigida"**, **"Conferir antes de despachar"**.

Direção desejada: claro · limpo · premium · mobile-first/PWA · **uma ação dominante** · tipografia
forte · silêncio visual · alta elegância · pouca informação · sensação de decisão calma.
Proibido: neon, futurismo espacial, dashboard, SaaS genérico, interface poluída.

Frase-guia: **"Uma decisão calma dentro do bolso."**

Nada disso deve ser implementado antes da arquitetura cognitiva estável (§9-10). Régua de qualidade
continua a do Manifesto: Apple/Tesla/Linear/Stripe/Notion como padrão, nunca como estilo a copiar.

## 14. Como iniciar uma nova conversa

```text
Leia CLAUDE.md, docs/Estado_Atual_DeliveryOS.md e os documentos específicos da missão.

Considere esses documentos a fonte oficial do projeto.

Não use memória implícita da conversa anterior como autoridade se houver conflito com os documentos.

Antes de executar, confirme:
- estado atual do Git;
- missão atual;
- arquivos que serão tocados;
- arquivos proibidos;
- critério de sucesso.

Não implemente nada antes de confirmar que entendeu o estado atual do projeto.
```
