# Diagnóstico do feedback humano — Mudança 004

Data da análise: 2026-07-28  
Base: `4030d4558673c98528357a9bb87903a993496bf7`  
Fonte primária privada: `%LOCALAPPDATA%\DeliveryOS\human-homologation`  
Artefato avaliado: `cfe462fe00147c6b0642fbd9e9fe15f19c8120781d5829d62f3dda663814dc04`

## Evidência consolidada

- 50 de 50 casos avaliados, em 10 categorias e 56 turnos.
- Média geral: 2,86/5.
- Naturalidade: 2,86; acolhimento: 2,66; clareza: 2,92; utilidade: 2,80;
  tamanho: 2,86; confiança: 2,84.
- Comparação cega: 18 vitórias da versão humanizada, 2 da baseline, 8
  equivalências e 18 casos em que ambas foram consideradas ruins.
- Tags mais frequentes, incluindo os três testes livres: `robotico` 34,
  `informacao_errada` 30, `pouco_acolhedor` 29, `muito_bom` 14, `seco` 4,
  `curto_demais` 2 e `nao_respondeu` 2.
- 14 casos receberam nota 1 ou 2. Há 90 comentários humanos entre avaliações,
  comparações cegas e conversa livre.

As contagens acima usam somente a revisão mais recente de cada voto append-only.
Os registros privados não são copiados para o Git.

## Conclusão

A falha principal não é falta de variedade verbal. O fluxo anterior seleciona
uma estratégia e protege claims, mas não consulta todo o conhecimento relacionado
antes de compor. Por isso, respostas seguras ficam vazias, respostas factuais
ficam secas e ocorrências recebem cautelas internas no lugar de orientação ao
cliente.

`ACOLHIMENTO SEM COMPREENSÃO E DIREÇÃO NÃO É ATENDIMENTO HUMANIZADO.`

## Causas estruturais

| Causa | Casos observados | Categorias afetadas | Conhecimento disponível | Comportamento atual | Comportamento esperado | Correção arquitetural |
|---|---:|---|---|---|---|---|
| Conhecimento existente não recuperado | 12 | cardápio, pagamentos, delivery, eventos | links de cardápio, experiências, meios confirmados, delivery, Oke | afirma não ter informação | combinar fato principal e fatos relacionados | busca ampla, matriz de cobertura e rastreabilidade |
| Conhecimento recuperado, mas mal apresentado | 9 | informações, reserva, fila, delivery | endereço, horários, links, tolerâncias | reproduz frase técnica ou seca | resposta direta com detalhe útil e fechamento proporcional | Response Plan V2 e playbook |
| Resposta correta, porém insuficiente | 15 | informações, ocorrências, segurança, grupos | fatos e entidades do caso | entrega o mínimo sem explicar o próximo passo | explicar o que fazer, por quê e o que ocorre depois | componente de direção e explicação |
| Ausência de direção ou ação | 19 | delivery, ocorrências, segurança, eventos, handoff | canal, capacidade e fila humana | acolhe ou limita sem fazer o caso avançar | ação comprovada, orientação ou pergunta mínima | playbooks e gate de actionability |
| Pergunta errada ou excessiva | 6 | reserva, fila, multiturno, segurança | campos já fornecidos ou link suficiente | pergunta dado desnecessário ou reinicia assunto | pedir apenas o campo necessário para avançar | seleção de pergunta por necessidade e contexto |
| Compreensão literal/contexto ignorado | 7 | atraso, retirada, multiturno, handoff | pedido, canal e intenção ativos | cai em ambiguidade ou perde correção | preservar assunto, pedido e canal entre turnos | inferência segura e busca contextual |
| Fallback indevido | 11 | crianças, dieta, pagamento, delivery, evento, privacidade | informação direta ou relacionada | “não tenho informação confirmada” | responder o confirmado e explicar o limite real | gate `available_knowledge_unused` |
| Acolhimento superficial ou linguagem pronta | 28 | todas | contexto do pedido e estado do cliente | “Certo”, “Entendi” ou “Sinto muito” sem especificidade | reconhecer concretamente a necessidade | gate `humanized_but_unhelpful` |
| Excesso de cautela exposto ao cliente | 13 | item, qualidade, segurança, grupos | política interna de não promessa | verbaliza “não vou presumir” e “resultado observável” | aplicar a restrição silenciosamente e orientar | separar regra técnica de texto público |
| Estratégia incompatível | 10 | reserva, atraso, retirada, eventos, privacidade | intenção e capacidade corretas | estratégia genérica ou de ambiguidade | playbook específico por necessidade | catálogo de playbooks versionado |
| Ação disponível não utilizada | 8 | ocorrências, Oke, grupo, handoff | registro, handoff ou orientação de canal | diz apenas que o caso fica aberto | declarar ação apenas quando executada e evidenciada | classificação explícita de ação |
| Limite legítimo mal explicado | 8 | feriado, acessibilidade, dieta, disponibilidade, reembolso | limite real conhecido | recusa vazia ou jargão técnico | dizer o que se sabe, o que falta e o caminho seguro | fallback legítimo enriquecido |

As categorias se sobrepõem: um caso pode possuir mais de uma causa. As
quantidades indicam casos observados e não devem ser somadas como total.

## Padrões por domínio

### Informações e experiências

Endereço e horário estavam corretos, mas sem convite natural. Crianças,
vegetarianismo, experiência do chef, rodízio e glúten revelaram que o sistema não
usa informação relacionada. O cardápio e as duas experiências confirmadas devem
ser oferecidos sem transformar ausência de composição detalhada em afirmação de
segurança alimentar.

### Reserva, fila e grupos

O link foi apresentado corretamente, mas a conversa perguntou quantidade quando
isso não era necessário para consultar o sistema. “Resultado observável” é
linguagem técnica. Consulta de reserva e disponibilidade futura continuam
dependendo de integração; até lá, o texto deve orientar o link e declarar o limite
em linguagem comum. Grupo grande exige coleta mínima e handoff real, sem afirmar
mesa ou fila confirmada.

### Delivery e iFood

A resposta deve diferenciar delivery próprio, pedido no iFood, preparação,
entrega, pedido marcado como entregue e problema de produto. Taxa depende do
endereço e deve ser consultada no canal. Para problema no iFood, a orientação
oficial é feita dentro do pedido em `Ajuda`, com seleção do problema e evidências
quando aplicáveis. Reembolso é análise, nunca promessa.

### Ocorrências

O item concreto foi identificado, porém o cliente recebeu a regra interna de não
compensação. O novo texto deve reconhecer o item, usar canal e pedido já
informados, explicar a etapa e pedir apenas o que falta. Evidências devem ser
solicitadas apenas quando previstas pelo procedimento aplicável.

### Segurança alimentar

Seriedade e ausência de causalidade foram preservadas, mas faltou orientação de
saúde e diferenciação entre qualidade sensorial, risco sanitário, alergia e
mal-estar. Não será feita afirmação genérica sobre higiene sem evidência. Sintomas
graves exigem orientação urgente; suspeita de doença transmitida por alimento
exige busca de serviço de saúde, coleta mínima e escalonamento.

### Multiturno, privacidade e humano

Correções de pedido e itens adicionais precisam manter o caso ativo sem repetir
perguntas. Privacidade deve ser explicada com o princípio de dados mínimos, sem
inventar retenção. Pedido de humano deve gerar handoff somente quando confirmado;
caso contrário, deve ser apresentado como orientação ou ação indisponível.

## Mecanismos que serão alterados

1. Catálogo de cobertura das 52 intenções.
2. Busca ampla e determinística por fatos, procedimentos e capacidades.
3. Playbooks por necessidade de atendimento.
4. Response Plan V2 com resposta direta, conhecimento, ação e direção.
5. Composição baseada no plano, não em frases isoladas.
6. Gates independentes para conhecimento ignorado e acolhimento sem utilidade.
7. Nova rodada de homologação, sem apagar votos anteriores.

## Limites mantidos

- Nenhum fato TATÁ novo é inferido a partir do feedback.
- Comentários humanos orientam a experiência, mas não autorizam claims
  operacionais sem catálogo ou capacidade.
- Não há integração real, API de IA, envio de mensagem ou uso de cliente real.
- A aprovação final da experiência permanece com César.
