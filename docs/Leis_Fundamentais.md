# Leis Fundamentais

> Derivadas da [Constituição](Constituicao.md). Não são manifesto, design ou marketing — são **leis**.
> Governam arquitetura, design, UX, linguagem, módulos, estoque, compras, inteligência e **qualquer
> produto futuro**. O teste único de qualquer ideia, por 20 anos:
> **"isso respeita nossas leis fundamentais?"** — não → morre; sim → merece existir.
>
> Método: cada candidata foi **atacada** (red team). Só virou lei o que sobreviveu. O que não
> sobreviveu está registrado no fim, para que ninguém o ressuscite por engano.

---

## As Leis

### Lei 1 — A memória nasce do trabalho
O sistema nunca pede que um humano **registre o que o trabalho já revela**. Toda memória durável é subproduto do ato; memória de esforço separado é proibida.
- **Ataque:** e quando observar é impreciso e perguntar seria mais exato? E o cadastro e a contagem física, que são input humano?
- **Veredito:** sobrevive. Perguntar-por-evento pode ser mais exato hoje, mas **decai amanhã** (a operação provou isso quatro vezes) — e a lei protege a memória *durável*, não a do instante. Cadastro (uma vez) e contagem física (o sistema não enxerga o mundo) não violam: não são "registrar o que o trabalho revela", são referência e calibração. A lei proíbe o **log por evento**, não o inevitável.

### Lei 2 — A atenção é sagrada
No ponto de operação, o sistema mostra **o mínimo que leva à ação certa, e nada mais** — e sempre devolve mais foco do que consome.
- **Ataque:** "mínimo necessário" proíbe o estado calmo (que não exige ação)? E os relatórios, que mostram muita coisa?
- **Veredito:** sobrevive, com escopo. O calmo mostra quase nada e não pede nada — é o limite inferior do "mínimo", não exceção. Relatórios são **pull** (escritório, sob demanda), não **push** (chão); a lei governa a superfície operacional. *(Absorveu a candidata vaga "nunca compete com a operação": competir é gastar mais atenção do que devolve.)*

### Lei 3 — Presença sem exigência
O sistema **vem até você** e **recua quando tudo flui**. Nunca precisa ser vigiado; nunca obriga a ser observado.
- **Ataque:** se recua, como confio que está funcionando (e não travado)? "Recuar" vira tela vazia?
- **Veredito:** sobrevive, refinada. Recuar é **parar de exigir**, não sumir: o calmo é presença serena (um pulso vivo), nunca tela morta. É isso que distingue "saudável" de "quebrado".

### Lei 4 — Nunca vigia nem pune pessoas
O sistema jamais é instrumento de punição ou de vigilância de indivíduos. Ele melhora a operação **por desenho**, não por flagrar gente.
- **Ataque:** mas ele captura autoria (quem montou, quem fechou) para aprender e medir. Isso não é vigilância pronta para punir?
- **Veredito:** sobrevive — e é por isso que precisa ser lei. A autoria existe para **entender e treinar o sistema**, nunca para perseguir a pessoa. A tensão é real (atribuição é faca de dois gumes); a lei governa o **uso**: nunca punitivo. Sem esta lei, viramos o chicote que a operação já tem demais.

### Lei 5 — Nunca mente
A verdade do sistema vem do **ato observado**, não do relato. Ele nunca apresenta inferência como fato e é sempre honesto sobre sua confiança (o que viu × o que supõe).
- **Ataque:** às vezes o único sinal é um relato (um texto de SAC, uma nota humana). Isso é proibido?
- **Veredito:** sobrevive. Relato e inferência são **insumos válidos** — desde que marcados como tais, com menor confiança. A lei proíbe **disfarçar** suposição de certeza, não usar suposição. Confiança falsa destrói o produto mais rápido que erro nenhum.

### Lei 6 — O humano decide; a máquina mostra
O julgamento operacional é sempre humano. A inteligência informa, projeta e propõe; **nunca decide no lugar da pessoa**.
- **Ataque:** isso proíbe automações úteis (pausar um item quando o insumo zera)?
- **Veredito:** sobrevive, com fronteira. Automação **mecânica, determinística e reversível** não é julgamento — é permitida. O que a lei proíbe é automatizar o **julgamento consequente** (o que segura, o que sacrifica, quando quebrar a regra). A máquina consome estado; ela não vira o maestro.

### Lei 7 — O sistema serve o trabalho
O sistema serve o trabalho; **nunca o trabalhador vira operador do sistema**. A pessoa é amplificada, jamais reduzida a alimentar telas.
- **Ataque:** no cadastro e na contagem a pessoa *opera* o sistema. Violação?
- **Veredito:** sobrevive. Inputs inevitáveis e raros não tornam o trabalho **servo** do software. A violação é quando a tarefa principal de alguém passa a ser "manter o sistema". Se isso acontecer, é o sistema que está errado — não a pessoa.

### Lei 8 — Na dúvida, subtrai
O valor do sistema mede-se pelo **fardo que remove**, não pela capacidade que acrescenta. Diante de duas soluções, a **menor** vence.
- **Ataque:** subtrair sempre não impede um produto rico e completo (estoque, compras, financeiro)?
- **Veredito:** sobrevive. Riqueza vem da **profundidade do mesmo núcleo** (projeções), não do acúmulo de funcionalidades-ilha. Cada adição precisa **pagar** seu custo de atenção e complexidade; na dúvida, não entra. É esta lei que nos impede de virar ERP.

### Lei 9 — Vocabulário mínimo e emergente
A linguagem do sistema é **mínima e nasce da realidade**. Modelo canônico grande, definido de antemão, é proibido.
- **Ataque:** sem um modelo rico desde o início, não falta estrutura para crescer?
- **Veredito:** sobrevive. O modelo grande-de-antemão é a **armadilha** clássica do enterprise (e contradiz "descoberta, não invenção"). A linguagem cresce quando a realidade exige — e só então. Poucos primitivos, estendidos pela realidade, escalam; um dicionário inventado apodrece.

### Lei 10 — O ativo é o corpus, não a funcionalidade
O ativo composto é o **corpus acumulado** e a **linguagem canônica** que o sustenta — não as features. Integrações (iFood, etc.) são adaptadores **descartáveis**; o núcleo é agnóstico de fonte.
- **Ataque:** isso é estratégia, não lei — e por que o núcleo não pode conhecer o fornecedor?
- **Veredito:** sobrevive como lei porque **governa decisões diárias** (onde investir, o que é núcleo, o que é descartável). Se o comportamento ramifica por fornecedor, o fornecedor vira refém e o ativo deixa de ser nosso. Fonte é metadado; conhecimento de vendor vive nos adaptadores.

### Lei 11 — Observabilidade antes de inteligência
Primeiro o sistema faz a operação **se ver**; só então a torna mais inteligente. Nenhuma camada de IA, previsão ou automação antes de o estado ser observável e confiável.
- **Ataque:** e se a inteligência for o grande diferencial — por que esperar?
- **Veredito:** sobrevive. Inteligência sobre estado que o sistema não enxerga (ou enxerga errado) é alucinação cara. A sequência é inegociável: **ver → confiar → projetar → (só então) sugerir**. Governa todo roadmap.

### Lei 12 — Nunca grita lobo
A urgência do sinal é **proporcional à realidade**, e o sinal só existe quando é **confiável**. O sistema nunca dramatiza, nunca alarma falso.
- **Ataque:** ser conservador no alerta não deixa passar problema real (falso negativo)?
- **Veredito:** sobrevive. Um alarme falso destrói a confiança, e sem confiança **todos** os sinais morrem (a operação aprende a ignorar). É melhor um sinal a menos e confiável do que um a mais e duvidoso. Confiabilidade é pré-condição de existência do alerta.

---

## Candidatos que NÃO viraram lei (cortados pelo red team)

- **"O sistema nunca compete com a operação."** — Vago demais para ser lei (todo pixel compete por um instante). Reabsorvido, com critério mensurável, na **Lei 2** (devolver mais atenção do que consome).
- **"O sistema elimina o erro humano."** — **Cortado.** Contradiz a Constituição: a pessoa é a inteligência, não o defeito. Não eliminamos o humano — nós o amplificamos e absorvemos a falha por desenho (folga, verificação no ponto), não removendo a pessoa.
- **"Recompensar quem erra menos (placar / dias-sem-erro / gamificação)."** — **Cortado.** A própria equipe propôs isto, mas viola a **Lei 2** (rouba atenção) e a **Lei 4** (vira vigilância e ranking de pessoas). Atenção é cara demais para gastar com troféu.
- **"O sistema deve ser bonito / minimalista / rápido."** — Não é lei: beleza, minimalismo e velocidade são **consequências** das leis acima (subtração, atenção, recuo), não fundamentos independentes.

---

## Como as leis governam (mapa rápido)

| Domínio | Leis que mais o governam |
|---|---|
| Arquitetura | 1, 9, 10, 11 |
| Design / UX | 2, 3, 12 |
| Linguagem | 9, 5 |
| Módulos (estoque, compras, produção…) | 1, 7, 8, 10 |
| Inteligência / IA | 5, 6, 11 |
| Cultura / liderança no produto | 4, 7 |
| Qualquer produto futuro (HospitalOS, etc.) | todas |

**Estas leis são atemporais. Sobrevivem ao DeliveryOS. Mudá-las exige mudar a Constituição — e mudar a Constituição é refundar a empresa.**
