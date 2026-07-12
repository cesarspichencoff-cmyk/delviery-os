# Taxonomia Inicial — TATÁ Evolução V0

> Vocabulário extensível para classificar evidências, casos e futuros padrões.
> **Não** exige reclassificação completa ao expandir: use namespaces e tags secundárias.
> Códigos estáveis em `snake_case`. Idioma de exibição pode ser PT-BR na Academia.

---

## 1. Princípios de desenho

1. **Namespace.root** — categorias de primeiro nível estáveis.  
2. **Filhos opcionais** — `cultura.respeito`, `erro.item_faltante`.  
3. **Multi-label** — um caso pode ter 1 primário + N secundários.  
4. **Separar fato de julgamento** — `erro.*` descreve evento; não implica culpa nominal.  
5. **Extensão** — novos códigos só sob namespace existente ou proposta `experimental.*` até aprovação César.

---

## 2. Categorias de primeiro nível

| Código | Nome | Uso |
|---|---|---|
| `cultura` | Cultura | Valores, respeito, colaboração, fofoca, conflito |
| `atendimento` | Atendimento | Cliente, tom, expectativa, SAC |
| `cardapio` | Cardápio | Itens, combos, disponibilidade, pausa de item |
| `comercial` | Regras comerciais | Preço, promoção, limite de compensação |
| `atraso` | Atraso | Produção, entrega, comunicação de atraso |
| `cancelamento` | Cancelamento | Motivos, prevenção, pós-cancel |
| `alteracao` | Alteração | Troca de item, observação, pós-impressão |
| `indisponibilidade` | Indisponibilidade | Insumo, pausa, 86 |
| `pedido_errado` | Pedido errado | Item trocado, pedido de outro cliente |
| `item_faltante` | Item faltante | Omissão na sacola/kit |
| `embalagem` | Embalagem | Caixa, sacola, quente/frio, lacre |
| `producao` | Produção | Praças, sushi, quentes, cozinha |
| `conferencia` | Conferência | Checagem antes de sair |
| `caixa` | Caixa | Comanda, organização, emissão |
| `logistica` | Logística | Rota, zona, prontos parados |
| `motoboy` | Motoboy | Espera na loja, despacho, comunicação |
| `comunicacao_interna` | Comunicação interna | WhatsApp, rádio, turno |
| `escalonamento` | Escalonamento | Quando e como chamar liderança |
| `compensacao` | Compensação | Cortesia, limite, fidelização |
| `reclamacao` | Reclamação | Cliente insatisfeito |
| `elogio` | Elogio | Feedback positivo |
| `falha_sistema` | Falha de sistema | POS, impressora, app |
| `falha_integracao` | Falha de integração | iFood, Odhen, Animo |
| `treinamento` | Treinamento | Formação, onboarding, reforço |
| `regra_informal` | Regra informal | “Sempre fazemos X” não escrito |
| `decisao_excepcional` | Decisão excepcional | Fora do padrão, justificada |
| `duvida_recorrente` | Dúvida recorrente | Mesma pergunta em N turnos |
| `erro` | Erro (genérico) | Usar com filho quando possível |
| `boa_solucao` | Boa solução | Recuperação bem-sucedida |
| `risco` | Risco | Quase-erro, insegurança |
| `aprendizado` | Aprendizado | Lição explícita |
| `lideranca` | Liderança | Decisão sob pressão, briefing |
| `fofoca` | Fofoca | Canal tóxico — classificar com cuidado, sem caça a pessoas |
| `conflito` | Conflito | Desentendimento interpessoal operacional |
| `autonomia` | Autonomia | Decisão dentro/fora da função |
| `colaboracao` | Colaboração | Ajuda entre praças/funções |
| `ideia_melhoria` | Ideia de melhoria | Sugestão de processo/produto |
| `qualidade` | Qualidade | Avaliação, estrela, moderação |
| `seguranca_etica` | Segurança e ética | Assédio, fraude, recusa legítima |
| `passaporte` | Passaporte | Progresso de formação (meta) |
| `caso` | Caso | Envelope de ocorrência capturada |
| `experimental` | Experimental | Temporário até promoção |

---

## 3. Filhos iniciais recomendados (extensíveis)

```text
cultura.respeito
cultura.responsabilidade
cultura.colaboracao
cultura.evolucao
cultura.qualidade

erro.omissao
erro.comisso
erro.item_faltante
erro.kit
erro.embalagem
erro.endereco_entrega
erro.comunicacao

atraso.producao
atraso.entrega
atraso.comunicacao_cliente

escalonamento.silencio
escalonamento.precoce
escalonamento.adequado
escalonamento.tardio

lideranca.pausa
lideranca.prioridade
lideranca.briefing
lideranca.feedback

autonomia.dentro_do_cargo
autonomia.ultrapassou
autonomia.sem_resposta_lideranca

embalagem.quente_frio
embalagem.segunda_sacola
embalagem.kit

producao.combinados
producao.duplas
producao.enrolados
producao.quentes
producao.sobremesa
producao.bar

comunicacao_interna.whatsapp
comunicacao_interna.voz
comunicacao_interna.turno

compensacao.dentro_limite
compensacao.fora_limite

falha_sistema.impressao
falha_sistema.pos
falha_integracao.ifood
```

---

## 4. Facetas transversais (tags, não substituem o código)

| Faceta | Valores exemplo |
|---|---|
| `impacto` | cliente · equipe · custo · tempo · reputacao |
| `urgencia` | imediata · turno · estrutural |
| `funcao` | caixa · atendimento · júnior · pleno · sênior · lideranca · sac · motoboy |
| `canal` | whatsapp · ifood · presencial · telefone |
| `confianca_fonte` | alta · media · baixa |
| `tipo_evidencia` | conhecimento · simulacao · comportamento · consistencia |

---

## 5. Como classificar um caso (V0)

1. Escolher **um** código primário (o que mais muda a ação de formação).  
2. Até 3 secundários.  
3. Facetas de função e impacto.  
4. Se incerto → `experimental.pendente_revisao` + revisão humana.  
5. **Nunca** classificar com nome de pessoa como categoria.

---

## 6. Evolução da taxonomia

| Mudança | Processo |
|---|---|
| Novo filho sob namespace existente | Proposta em T0B/T1 + aprovação César se virar conteúdo oficial |
| Novo namespace de 1º nível | Só com decisão explícita (doc V0.x) |
| Renomear código | Deprecated + alias; não apagar histórico |
| Remover | Soft-delete; manter em casos antigos |

---

## 7. Versão

| Campo | Valor |
|---|---|
| Versão | **V0** |
| Status | Utilizável na T0B |
| Congelamento rígido | Não — extensível por design |
