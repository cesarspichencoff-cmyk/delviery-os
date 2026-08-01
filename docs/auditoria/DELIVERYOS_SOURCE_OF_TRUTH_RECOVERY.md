# Recuperação da fonte de verdade original do DeliveryOS

> Missão analítica. Nada foi implementado, alterado ou conectado.
> Branch `feature/deliveryos-hybrid-platform-foundation-v1` · HEAD `d7c28e8` · working tree com um
> único arquivo novo esperado (`docs/auditoria/`) · Figma `IMWH8ZKMF5ra3QJYiR6vGa` lido em modo leitura.
> Vereditos confirmados: `CONFERENCE_BRAIN_UNIT_COMPLETE`, `COPILOT_SHADOW_UNIT_COMPLETE`,
> `PRODUCT_SYSTEM_UNIT_COMPLETE`.
> Continuação de `DELIVERYOS_PRODUCT_REALIGNMENT_AUDIT.md`, que **não foi alterado**.
> Data: 2026-08-01.

---

## 1. Veredito executivo

**O produto que César descreveu nesta conversa não precisa ser inventado: ele já está inteiramente desenhado no repositório, em documentos que ele mesmo validou entre junho e julho de 2026 — e parou de avançar não por decisão de arquitetura, mas porque três documentos de produto terminaram com 24 perguntas objetivas para ele que nunca foram respondidas; o projeto então seguiu construindo a camada que não dependia dessas respostas (plataforma, contratos, Brain, Copiloto shadow, Product System), e essa camada acabou ocupando o lugar do produto.**

Correção importante da auditoria anterior: eu havia concluído que "DeliveryOS e Copiloto deveriam ser
a mesma coisa", a partir de `PRODUCT_CONSTITUTION.md` §1. **César corrigiu, e a documentação lhe dá
razão** — o Mapa Mestre de Domínios trata DeliveryOS como plataforma com domínios (Operação Viva,
Entregas, Suprimentos, Caixa) e o Copiloto como o ativo de decisão dentro dela. A frase da
constituição de produto é sobre **nomenclatura de marca**, não sobre arquitetura. Retifico.

Segunda correção: eu havia lido o Manifesto como "um foco por vez, esconde o resto". **Está errado.**
O `Mapa_Sinais_Operacionais.md` e o `Mapa_Ambientes_V1.md` mostram que o desenho original **sempre**
previu múltiplos problemas visíveis simultaneamente, em registros diferentes de urgência. Não há
contradição entre o que César pediu agora e o que estava desenhado — **é a mesma coisa**.

---

## 2. Cobertura documental

| Métrica | Quantidade |
|---|---|
| Documentos `.md` em `docs/**` | **306** |
| Documentos `.md` na raiz | 3 (`CLAUDE.md`, `README.md`, `ARQUITETURA.md`) |
| Lidos integralmente nesta missão | **11** |
| Lidos integralmente na auditoria anterior (mesma sessão) | 9 |
| Inspecionados por busca dirigida (grep/termos) | ~60 |
| Classificados como técnicos, fora do escopo de produto | ~120 (`docs/entregas/**` de contrato, `docs/cloud/**`, `docs/tata-evolucao/**` de formação) |
| Históricos acessíveis só por Git | 0 encontrados removidos e relevantes |
| Não encontrados / inacessíveis | 2 (ver §19) |

**Honestidade sobre a cobertura:** não li os 306. Li integralmente os que governam produto,
operação e visão; inspecionei por termo os demais. `docs/tata-evolucao/` (≈120 arquivos) é o produto
**separado** de cultura e formação — o Mapa Mestre §2.5 o declara fora do DeliveryOS, e por isso foi
tratado como fonte secundária, exceto onde carrega vocabulário operacional (boqueta).

### Documentos lidos integralmente nesta missão

| Caminho | Categoria | Relevância |
|---|---|---|
| `docs/Logica_Embalagens_DeliveryOS_V0.md` | operação · embalagem | **máxima** — origem de "duas sacolas" e "só quente" |
| `docs/Mapa_Sinais_Operacionais.md` | produto · sinais | **máxima** — os 22 sinais operacionais |
| `docs/Mapa_Ambientes_V1.md` | produto · UX · usuários | **máxima** — os 6 ambientes, incl. Caixa e Conferência |
| `docs/Auditoria_Praca_Comanda_Atencoes_V1.md` | operação · Atenções Leves | **máxima** — viabilidade medida das atenções |
| `docs/Mapa_Mestre_Dominios_DeliveryOS_V0_1.md` | arquitetura · domínios | alta (lido na auditoria anterior) |
| `docs/Modelo_Operacional_Consciencia_DeliveryOS.md` | produto · cognição | alta (idem) |
| `docs/Camada_Decisao_Operacional.md` | Copiloto | alta (idem) |
| `docs/Manifesto_Produto_Design.md` · `Constituicao.md` · `Leis_Fundamentais.md` | constituição | alta (idem) |
| `docs/Estado_Atual_DeliveryOS.md` | memória de produto | alta (idem) |
| `docs/PRODUCT_CONSTITUTION.md` | visual · identidade | alta (idem) |
| `docs/entregas-design-audit/JOURNEY_COVERAGE.md` | jornadas | média (idem) |

---

## 3. Fontes investigadas além de documentos

| Fonte | Método | Achado central |
|---|---|---|
| `src/perfil-delivery/motor.js` | leitura dirigida | `mode = foco \| ambiente \| calmo` (linha 272); `FLOORS` com `DEBOUNCE 3`, `COOLDOWN 45`, `MAXFOCUS 8`, `STALE 120` (linha 34) |
| `src/perfil-delivery/decisao.js` | leitura dirigida | saída `acao/porque/primeiro/impacto/confianca` (linhas 89-96) |
| `src/platform/copiloto/shadow.ts` | grep | 3 políticas; **0** referências a `perfil-delivery` |
| **Protótipo original em execução** | `preview_start` porta 5178 | ver §7 — prova visual |
| Figma `IMWH8ZKMF5ra3QJYiR6vGa` | screenshot nó `2:4` e páginas 01/02 | capa mede o produto em "629 testes verdes" |
| Frontend Unidade 6 | execução anterior (porta 5290) | 4 rotas, 11 módulos, tabelas, metric strips |
| Git | `log`, `show`, `--diff-filter` | pivô em `a03508c` (12/07) e `4335d16` (26/07) |
| Termos obrigatórios | grep com variações | ver §4 |

**Busca de termos (contagem de arquivos que contêm):** boqueta **11** · "2ª sacola" **35** ·
"duas sacolas" **8** · "só quentes" **3** · quente **98** · praça **116** · pausa **104** ·
caixa **96** · atendimento **38** · reclama **48** · "atenção soberana" **1** (e é um documento da
Unidade 6, não fundador) · Calmo/Ambiente/Foco **48 ocorrências** em `prototipos/` e **0** em
`src/platform`, `src/product`, `src/conference-brain`, `docs/figma`.

---

## 4. Hierarquia das fontes

Estabelecida pelos próprios documentos, não por mim:

```
1. docs/Constituicao.md               ← filosofia; sobrevive ao DeliveryOS
2. docs/Leis_Fundamentais.md          ← 12 leis red-teamed; "isso respeita nossas leis?"
3. docs/Manifesto_Produto_Design.md   ← constituição do produto
4. docs/Modelo_Operacional_Consciencia_DeliveryOS.md ← como a consciência decide
5. docs/Mapa_Mestre_Dominios_DeliveryOS_V0_1.md      ← plataforma e domínios
6. docs/Mapa_Sinais_Operacionais.md   ← O QUE o sistema percebe (22 sinais)
7. docs/Mapa_Ambientes_V1.md          ← ONDE isso aparece (6 ambientes)
8. docs/Logica_Embalagens_*.md        ← regra física (sacola, quente/frio)
9. docs/Camada_Decisao_Operacional.md ← COMO prioriza (o Copiloto)
10. docs/Estado_Atual_DeliveryOS.md   ← memória executiva de produto
--- abaixo desta linha, execução ---
11. CLAUDE.md · docs/execution/**     ← contrato de trabalho e memória técnica
12. docs/figma/** (Unidade 6)         ← camada de apresentação recente
```

**A falha estrutural está entre 10 e 11:** `CLAUDE.md` §11 manda ler os quatro arquivos de
`docs/execution/`. **Nenhum deles referencia os itens 1–10.** `NEXT_RESUME.md` nunca cita
`Estado_Atual_DeliveryOS.md`, `Mapa_Sinais_Operacionais.md`, `Mapa_Ambientes_V1.md` nem
`Logica_Embalagens`. Quem começa uma missão lendo a memória executável **não encontra o produto**.

---

## 5. Produto original recuperado

### 5.1 A promessa

- **Problema:** a operação *"para de produzir para se procurar"* — o imposto do "cadê?".
  *(fato documental: `Manifesto`, frase fundadora)*
- **Transformação:** a operação ganha **propriocepção** — sabe onde está sem parar para descobrir.
- **"Sistema operacional" significa:** uma plataforma com domínios soberanos que compartilham fatos,
  com **um único dono da decisão cognitiva** — não um pacote de apps.
  *(fato documental: `Mapa_Mestre_Dominios` §1, §3)*
- **Áreas reunidas:** Operação Viva (núcleo) · Entregas · Suprimentos (futuro) · Caixa e Atendimento
  (futuro, escopo não fechado). TATÁ Evolução é **produto separado**.
- **Papel dos dados:** insumo classificado em 5 categorias que nunca se misturam — fato observado ·
  hipótese inferida · memória histórica · dado ausente · desconhecido/implausível.
  *(fato documental: `Modelo_Operacional_Consciencia` §1)*
- **Papel da inteligência:** ranquear por **impacto físico** e decidir se vale interromper.
- **Papel do humano:** decidir. Sempre.
- **Diferença de um dashboard:** *"dashboard te dá tudo e te deixa procurar; DeliveryOS te dá a única
  coisa e esconde o resto"* — com a ressalva crítica da §10 deste relatório: "esconder o resto"
  significa **não pedir ação sobre o resto**, não torná-lo invisível.

### 5.2 Organização original

| Camada | Conteúdo | Classificação |
|---|---|---|
| **Núcleo** | Operação Viva — Calmo/Ambiente/Foco, único dono da decisão cognitiva | produto final |
| **Domínio** | Entregas — executa a entrega física; **fornece fatos, nunca cria Foco** | primeira versão |
| **Domínio futuro** | Suprimentos — sinais para Ambiente, sem Foco direto | visão futura |
| **Domínio adiado** | Caixa e Atendimento — escopo não fechado | visão futura |
| **Separado** | TATÁ Evolução — consome evidências anonimizadas sob contrato | outro produto |
| **Motor** | `motor.js` + `decisao.js` | implementado e provado |
| **Apresentação** | "Parados Agora" (uma tela) | protótipo validado |
| **Conceitual** | Resolução · Memória Operacional | declarados não construídos |

**Regra transversal explícita:** *"Nenhum domínio cria Foco diretamente."*

### 5.3 Os 22 sinais — o produto, item a item

`Mapa_Sinais_Operacionais.md` cataloga 22 sinais, cada um com registro (🟢 calmo · 🌫️ ambiente ·
🔶 foco) e disponibilidade ([A] iFood agora · [C] cardápio · [K] KDS · [S] SAC).
**Todos os pedidos de César nesta conversa já estão aqui:**

| César pediu | Sinal original | Registro | Disponibilidade |
|---|---|---|---|
| "itens que mais estão saindo" | **S18** item com pico de venda agora | 🌫️ ambiente | [C] |
| "praça mais congestionada" | **S5** praça sobrecarregada | 🌫️ ambiente | [C] |
| "possível necessidade de pausar uma praça" | **S15** item deveria estar pausado · **S17** risco de ruptura | 🔶 foco | [A]+[C] |
| "cliente reclamando" | **S19** faltou item / item errado (desfecho × comanda) | 🔶 pós | [S]+[C] |
| "pedido muito atrasado" | **S1** pronto sem sair · **S3** saiu sem entregar · **S4** produção travada | 🔶 foco | [A] |
| "duas sacolas" | **S14** pedido grande / mais de uma sacola | 🔶 conferência | [C] |
| "só quentes" | **S12** só pratos quentes → fechável | 🔶 fechamento | [C]+[K] |
| "estado geral quando está bem" | **S10** custódia — 🟢 *"não é alerta; é o sistema sempre saber"* | 🟢 calmo | [A]+[K] |
| "orientação de como agir" | cada sinal tem campo **ação** e **impacto** | — | — |

**Nada do que César pediu é novo. Tudo tem sinal, registro, dado de origem e ação já definidos.**

---

## 6. Arquitetura operacional original

| Conceito | Definição original | Fonte | Usuário | Decisão apoiada | Dado necessário | Estado atual | Situação |
|---|---|---|---|---|---|---|---|
| Pedido | unidade viva com estado, tempo e composição | motor `sits`/`ctx` | todos | tudo | iFood | projeção de **viagem**, não de pedido | **substituído** |
| Item | nome + categoria + praça principal + praças dependentes | seed 199 itens | boqueta | praça, caixa | cardápio | ausente do produto atual | **esquecido** |
| Quente / frio | temperatura decide sacola separada | `Logica_Embalagens` §7 | boqueta | montagem | cardápio | `soQuentes` no motor; ausente no produto | **somente protótipo** |
| Sacola / 2ª sacola | volume + quente-frio + bebida grande + estabilidade | `Logica_Embalagens` §11 | boqueta · conferência | conferência reforçada | cardápio + regra do César | heurística `segundaSacola` (combo ou ≥8 itens), 47–61% | **parcialmente preservado** (proxy, não regra) |
| Embalagem / caixa | 7 tamanhos por categoria e quantidade | `Logica_Embalagens` §4-5 | boqueta | montagem | validação | **não implementado** | **somente futuro** |
| Praça (8 internas) | bancada que produz o item | seed + motor | gerente | priorização | cardápio | ausente do produto atual | **esquecido** |
| Ambiente (6 do César) | Caixa · Sushi · Quentes · Cozinha · Conferência · Motoboy | `Mapa_Ambientes` §1 | todos | onde olhar | mapa praça→ambiente | **não implementado** | **somente futuro (bloqueado)** |
| Congestionamento | `load[praça] > BASELINE[praça]` | motor | gerente | pausar / remanejar | iFood + cardápio | ausente | **esquecido** |
| Capacidade | pedidos vivos vs baseline da praça | motor | gerente | segurar entrada | iFood | `capacidade_operacional: "desconhecida"` | **implementado com outra função** |
| Pausa | pausar item/praça antes de romper | S15/S17 | gerente | decisão de pausa | iFood pausa + ficha | ausente | **esquecido** |
| Boqueta | posto de expedição/conferência da loja | `Arquitetura_Sincronizacao_Local_V1`, `tata-evolucao/**` | boqueta | conferir e despachar | comanda | **sem tela** | **esquecido** |
| Conferência | abrir sacola, conferir, juntar, identificar pendências | `Mapa_Ambientes` §1 | conferência | conferir | pronto-por-praça | sinal de risco por pedido, sem fila | **parcialmente preservado** |
| Caixa | de onde saem as comandas; separa sacola, cartinhas, embalagens | `Mapa_Ambientes` §1 | caixa | organização inicial | **nenhum dado existe** | **não modelado** | **conflito não resolvido** |
| Comanda | identificador físico da bancada | `Auditoria_Praca_Comanda` §2 | boqueta | achar o pedido | **não existe em fonte digital** | ausente | **bloqueio de origem** |
| Atendimento | responder ao cliente | citado por César; domínio "Caixa e Atendimento" adiado | atendimento | responder | SAC | **escopo não fechado** | **somente futuro** |
| Cliente / reclamação | desfecho × comanda | S19 | atendimento · gerente | corrigir e aprender | SAC/review | ausente | **esquecido** |
| Atraso | tempo acima do piso (`FLOORS.EXPED 30`, `PROD 45`) | motor | gerente | priorizar | iFood | `atraso` como número de dimensão | **implementado com outra função** |
| Erro / ocorrência | omissão de item; vira memória automática | S19 | gerente | treinar, nunca punir | SAC | ocorrência em Entregas (domínio) | **parcialmente preservado** |
| Motoboy | prontos parados na expedição | S1/S2, ambiente Motoboy | gerente | chamar motoboy | iFood | Entregas + Android | **preservado** |
| Prioridade | `unblock×2 + carga×0,5 + severidade` | `decisao.js` | gerente | o que olhar primeiro | motor | **desconectado** | **substituído sem decisão explícita** |
| Resolução | fechar ciclo; distinguir resolvido de demovido por teto | `Modelo` §7 | sistema | aprender | ciclo de foco | **conceitual** | **somente futuro** |
| Histórico / comparação | mesma segunda vs segunda passada | — | gerente | avaliar intervenção | Memória Operacional | **inexistente** | **esquecido** |
| Resultado de ação | desfecho confirmado × desconhecido | `Modelo` §8 | gerente | confiar no sistema | Resolução | **inexistente** | **somente futuro** |

---

## 7. Visual original — prova em execução

Executei o protótipo original (`tools/serve_prototipo.js`, porta 5178, config `prototipo` já
existente). **Fato visual, não inferência:**

```
DELIVERYOS            18:04
em fluxo                              ← CALMO (o estado, nomeado)
Duplas carregando                     ← AMBIENTE (rótulo 1)
Combinados acima do normal            ← AMBIENTE (rótulo 2)
ATENÇÃO
QUENTES EM RISCO                      ← FOCO (situação)
→ liberar prontos pra bancada         ← FOCO (ação)
2 em andamento                        ← PULSO
REPLAY 12/06 · COMPOSIÇÃO SINTÉTICA   ← procedência declarada
```

Medição do DOM (fato do código):

| Métrica | Protótipo original | Frontend Unidade 6 |
|---|---|---|
| Elementos com texto | **16** | centenas |
| Tabelas | **0** | sim (viagens, linhas inválidas) |
| Menus (`<nav>`) | **0** | 2 (rail + barra mobile) |
| Botões | **0** | inspetores em toda tela |
| Links | **0** | 11 de navegação |
| Scroll necessário | **não** | sim, longo |
| Fundo | `#e5e8e0` claro | `#faf8f4` claro |
| Fonte | Satoshi | Spectral / Hanken / IBM Plex |

**Os três problemas aparecem ao mesmo tempo** — dois em Ambiente, um em Foco. O produto original
**nunca escondeu problemas**; ele os mostrou em registros diferentes de urgência. É literalmente o
que César pediu nesta conversa.

**Três gerações visuais coexistem no repositório:** (1) protótipo Satoshi `#e5e8e0`;
(2) cânone TATÁ verde profundo/creme com Spectral (`tokens.css`, Figma 01.x); (3) capa do Figma em
fundo escuro com verde neon. A (3) está fora do cânone que a (2) estabelece no mesmo arquivo.

---

## 8. Papel original do Copiloto

**Correção acatada:** o Copiloto **não é** o DeliveryOS inteiro; é o ativo de decisão dentro dele.

| Aspecto | Definição original | Fonte |
|---|---|---|
| Responsabilidade | *"não mostra mais problemas; reduz decisões"* — ranqueia o que já foi percebido | `Camada_Decisao_Operacional`, epígrafe |
| Momento | **dentro do Foco**, quando o motor já decidiu interromper | idem §"onde aparece" |
| Fontes | `snap` (situações + carga) + `INFO` (composição do pedido) + `fonteReal` | idem §"o que entra" |
| Priorização | `unblock×2 + carga×0,5 + severidade`; empate → severidade | idem §"como ranqueia" |
| Explicação | ação ≤4 palavras · por quê · primeiro olhar · impacto · confiança (sussurro) | idem §"hierarquia oficial" |
| Não coleta dado novo | *"a camada só ranqueia o que os sinais já provaram"* | idem |
| Silêncio | devolve `null` quando calmo — *"silêncio é feature"* | idem |
| Limite humano | nunca decide; a decisão é do gerente | Lei 6 |

**Restrição arquitetural que o define:** `sess.active.sit` é a fonte da verdade da atenção — o
Copiloto pode **refinar** o foco, nunca **trocar** a causa raiz. Isso foi medido (30,8% de troca
proibida), corrigido e provado no commit `37ca1c9` (05/07), com `Relatorio_Pos_Correcao_Motor_Decisao.md`.

### Motor original — o que se sabe com evidência

| Item | Valor | Evidência |
|---|---|---|
| Entradas | `snap`, `INFO`, `fonteReal` | `decisao.js` assinatura |
| Saídas | `acao · porque · primeiro · impacto · confianca · dados · tipo · todas` | `decisao.js:89-96` |
| Tipos de ação | `priorizar_praca`, `fechar_simples`, `chamar_motoboy`, `conferencia`, `conferir_saida`, `olhar_pedido` | grep |
| Calibração | 30 dias reais, **460 recomendações**, 56 (12%) dependentes de composição | `Camada_Decisao_Operacional` §"o que depende de item real" |
| Confiança | alta para tempo/estado; média (teto) para composição sintética; sobe automaticamente com fonte real | idem §"confiança proporcional" |
| Anti-zumbi | `STALE 120 min` (p99 medido: 57 exped / 71 prod) | idem §"regras anti-zumbi" |
| Papel visual | bloco `AÇÃO RECOMENDADA` **dentro do foco existente** — *"nenhum redesenho"* | idem §"onde aparece" |

### Copiloto shadow atual

| Item | Valor |
|---|---|
| Entradas | conclusões `source_health` do Conference Brain |
| Saídas | título descritivo, descrição, evidência, `evidence_grade`, validade, limitações |
| Políticas | `sinal-velho`, `capacidade-saturada`, `ocorrencias-acumuladas` |
| Garantias | evidência obrigatória, PII sanitizada, expiração, retirada, invalidação, store idempotente |
| `requires_human` | literal `true`; estado `executed` não existe |
| Limitação | recomenda sobre a **fonte**, nunca sobre pedido ou praça |

### Reconciliação — respostas com evidência

- **São componentes da mesma arquitetura?** **Não hoje.** `shadow.ts` tem 0 referências a
  `perfil-delivery`; nenhum arquivo de `src/platform`, `src/product` ou `src/conference-brain` o importa.
- **São gerações diferentes?** **Sim.** Motor: até 05/07. Shadow: 31/07. Nenhum documento registra
  transição entre eles.
- **Um deveria validar o outro?** **Sim, e essa é a leitura mais produtiva:** o shadow tem as
  garantias que o motor não tem (evidência rastreável, expiração, PII, persistência auditável); o
  motor tem a inteligência que o shadow não tem (ranking por impacto, calibração real, gestão de atenção).
- **Responsabilidades complementares?** **Sim.** O motor decide *o quê*; o shadow prova *que se pode confiar*.
- **Algum substituiu o outro sem decisão?** **Sim — o shadow ocupou o nome "Copiloto" na navegação e
  no Figma, sem que nenhum documento decidisse aposentar o motor.** É a substituição silenciosa mais
  relevante desta auditoria.
- **O que preservar de cada um?** Motor: ranking, `FLOORS`, restrição de escopo (`dentroDoEscopo`),
  formato de 4 linhas. Shadow: contrato de recomendação, evidência, expiração, PII, store.
- **O que o Copiloto original exigia e nenhum dos dois entrega?** **Memória e comparação** —
  "aquilo que eu fiz ontem funcionou?" exige Resolução (§7 do Modelo) e Memória Operacional (§8),
  ambas conceituais desde 2026-07.
- **O que não conectar sem nova validação?** Os dois motores. Ligar `decisao.js` ao pipeline novo
  sem decidir **qual é a fonte da verdade da atenção** criaria dois donos do Foco — exatamente o
  defeito que `37ca1c9` corrigiu.

---

## 9. Papel original da Operação Viva

| | |
|---|---|
| **Função original** | núcleo de consciência; **único dono** de Calmo/Ambiente/Foco; pergunta *"o que precisa da sua atenção agora?"* |
| **Fonte** | `Mapa_Mestre_Dominios` §2.1 |
| **Objetos** | pedidos, itens, praças, ambientes, fatos, desconhecidos, decisão, replay |
| **Função atual** | `projetar()` — projeção de **viagens** com 9 dimensões de telemetria |
| **Nome permaneceu, função mudou?** | **Sim.** Fato do código: 0 ocorrências de calmo/ambiente/foco em `operacao-viva.ts` |
| **Houve decisão explícita?** | **Não encontrada.** Nenhum ADR, decisão ou lição registra a troca |
| **A projeção atual é errada?** | **Não.** É correta e útil — é uma camada **menor** que herdou o nome maior |
| **O que preservar** | a projeção, o replay, o cursor, a quarentena, a classificação observado/inferido/contexto |
| **O que recuperar** | a decisão cognitiva: modo, slot de foco, debounce, cooldown, ambiente |
| **O que precisa de outro nome** | uma das duas coisas — **não renomeado nesta missão, por instrução** |
| **Exige César** | qual das duas fica com o nome "Operação Viva" |

Relação com Conference Brain: o Brain **não existe** em nenhuma fonte original (Constituição, Leis,
Manifesto, Modelo, Mapa Mestre). Ele veio do worktree `deliveryos-copiloto-secure-bind-v1`. Isso não
o invalida — mas significa que ele é **infraestrutura adotada**, não um módulo previsto pelo produto.

---

## 10. Calmo, Ambiente, Foco — e a resolução da suposta contradição

| | Calmo | Ambiente | Foco |
|---|---|---|---|
| **Significado** | nada exige atenção agora | clima da operação | interrupção justificada |
| **Entrada** | nenhuma `sits` cruza piso | `sev` 1, ou `sev` 2+ não sustentada, ou perdeu o slot | `sev` ≥2, sustentada por `DEBOUNCE`, fora de `COOLDOWN` |
| **Saída** | pulso ("N em andamento") | até **2** rótulos curtos + cor | 4 linhas + sussurro |
| **Quantidade** | quase nada | teto rígido de 2 | exatamente 1 |
| **Esconde** | listas, contagem por praça, KPI | números, listas, bloco de ação | score, ranking, dados-fonte |
| **Tratamento de problemas** | 🟢 responde **se perguntado** (S10) | acompanha sem interromper | prescreve ação |
| **Transição** | → Ambiente quando surge situação | → Foco por persistência | → Resolução por sumiço ou teto |
| **Persistência** | — | `pending.since` corre por baixo | `MAXFOCUS` 8 min |
| **Relação com Copiloto** | Copiloto devolve `null` | **proibido** bloco de ação | Copiloto ranqueia a ação |

### A contradição aparente, resolvida

César disse: *"não quero que o sistema esconda problemas para mostrar somente uma atenção; quero
todos os problemas relevantes visíveis, com urgência diferenciada."*

**Isso não contradiz o desenho original — é o desenho original.** Prova em três camadas:

1. **Protótipo em execução (§7):** mostra 2 problemas em Ambiente **e** 1 em Foco, simultaneamente.
2. **`Mapa_Ambientes_V1` §10:** *"Vermelho não fica escondido no Ambiente — ele **é** (ou vira) o Foco"*,
   e o modelo visual propõe **6 cartões**, um por ambiente, todos visíveis com cor.
3. **`Mapa_Sinais_Operacionais`:** 22 sinais, cada um com registro próprio; 🟢 calmo é
   *"responde sempre"*, não "invisível".

O que o desenho original proíbe não é **mostrar** vários problemas — é **pedir ação** sobre vários ao
mesmo tempo. "Exclusividade de slot" governa a **ação prescrita**, não a visibilidade.

**Onde há conflito real:** César pediu *"justificativa baseada em dados"* e *"dicas práticas de
atuação"* para os problemas secundários. O desenho original **proíbe bloco de ação em Ambiente**
(`Modelo` §3, `Mapa_Ambientes` §11). Isso é um **conflito genuíno** que só ele resolve — ver §20, Q3.

---

## 11. Jornadas dos usuários

### Papéis, como o original os diferenciava

O projeto **não** previa quatro sistemas. Previa **um sistema com seis ambientes**
(`Mapa_Ambientes` §1), onde cada papel olha o ambiente que lhe diz respeito:

| Papel | Ambiente(s) | Objetivo | Informação imediata | Papel do Copiloto | Telas hoje |
|---|---|---|---|---|---|
| **Gerente / César** | todos (visão de 6 cartões) | decidir onde intervir | estado geral + foco | ranqueia a ação | nenhuma |
| **Boqueta / conferência** | Conferência · Caixa | conferir e despachar sem erro | atenções do pedido na bancada (2ª sacola, só quente, observação) | atenções leves | nenhuma |
| **Caixa** | Caixa | organizar comanda, sacola, cartinha, embalagem | **sem dado — não modelado** | — | nenhuma |
| **Atendimento** | (domínio adiado) | responder ao cliente | histórico do pedido | S19 | nenhuma |

**Restrição documentada:** Caixa e Conferência **não são mensuráveis** com a fonte atual
(`Mapa_Ambientes` §7) — mostrá-los como Verde seria *"inventar operação"*. E a **comanda não existe
em fonte digital** (`Auditoria_Praca_Comanda` §2), o que impede identificar o pedido na bancada — o
bloqueio central da jornada da boqueta.

### As 18 jornadas × experiência atual

Classificação: **resolve · orienta · informa · diagnostica tecnicamente · demonstra · não existe**

| # | Jornada | Desenho original | Experiência atual |
|---|---|---|---|
| 1 | início do turno | Calmo + pulso | **demonstra** |
| 2 | operação estável | Calmo + Atenções Leves (bloqueado) | **demonstra** |
| 3 | item começa a sair muito | S18 🌫️ | **não existe** |
| 4 | praça congestiona | S5 🌫️ → S6 antecipa | **não existe** |
| 5 | pedido precisa de 2 sacolas | S14 🔶 + `Logica_Embalagens` §11 | **não existe** |
| 6 | pedido só quentes | S12 🔶 fechável | **não existe** |
| 7 | pedido incompleto | S13 / S21 | **não existe** |
| 8 | pedido atrasa | S1/S3/S4 🔶 | **diagnostica tecnicamente** (viagem, não pedido) |
| 9 | cliente reclama | S19 🔶 pós | **não existe** |
| 10 | atendimento responde | domínio adiado | **não existe** |
| 11 | caixa entende a situação | ambiente Caixa (sem dado) | **não existe** |
| 12 | decidir pausa | S15/S17 🔶 | **não existe** |
| 13 | situação melhora | Resolução (conceitual) | **não existe** |
| 14 | situação piora | Ambiente → Foco | **não existe** |
| 15 | gerente sai da loja | — **nunca desenhado** | **não existe** |
| 16 | gerente retorna | — **nunca desenhado** | **não existe** |
| 17 | comparar com segunda passada | Memória Operacional (conceitual) | **não existe** |
| 18 | a ação funcionou? | Resolução §7 — *"nunca presumir causa"* | **não existe** |

**2 demonstram · 1 diagnostica tecnicamente · 15 não existem. Zero resolvem.**

Jornadas **15 e 16 nunca foram desenhadas em fonte nenhuma** — César as trouxe nesta conversa e na
anterior. São requisito novo, não recuperação. Elas exigem **notificação fora da tela**, que o
Manifesto §4 restringe (*"nunca enxurrada de notificações"*) mas não proíbe.

---

## 12. Memória Operacional, Resolução e Evolução

| | Definição original | Fonte | Estado |
|---|---|---|---|
| **Resolução** | fechamento de ciclo; **distinguir** resolvido-de-fato de demovido-por-teto | `Modelo` §7 | parcialmente implementado (o foco é limpo; o motivo não é registrado) |
| **Memória Operacional** | experiência estruturada, nasce da Resolução real; `confianca_na_decisao` × `desfecho_confirmado` (podendo ser `null`) | `Modelo` §8 | **conceitual, nunca construído** |
| **Evolução** | não existe como módulo em fonte original; aparece só como item de menu na Unidade 6 | — | **inventado na Unidade 6** |

**Regra que protege as três:** *"nunca infere que a ação funcionou sem confirmação; sem sinal
positivo explícito, o desfecho fica marcado como 'resolvido, causa desconhecida', nunca como sucesso
presumido"* (`Modelo` §7). Isso responde diretamente ao pedido de César por comparação: o sistema
pode comparar, mas **não pode atribuir causa** sem evidência.

**Comparação por dia da semana / faixa horária: não existe em nenhuma fonte.** O mais próximo é o
backtest de 30 dias (`tools/autoteste_8pracas.js`) e as 12 janelas reais — ferramentas de
**engenharia**, nunca expostas como produto.

### Por que pararam — ponto exato

`Estado_Atual_DeliveryOS.md` §9 (05/07) lista as dívidas em ordem: **(4) projetar Resolução →
(5) medir se há sinal suficiente para Memória Operacional → (6) projetar Memória Operacional**. E §10
proíbe: *"Não implementar Memória Operacional nem Resolução formal"* — porque o item (5) nunca foi
medido. A proibição estava **certa** e continua de pé. O que falhou não foi a proibição: foi que
ninguém voltou a executar os itens 4 e 5, e o projeto seguiu para outra frente.

---

## 13. Produto atual — o que cada tela é de fato

| Tela | Objetivo atual | Usuário real | Dado | Decisão que apoia | Pertence a |
|---|---|---|---|---|---|
| Entregas | listar viagens montadas e o que não se sabe do aparelho | quem constrói | fixture | nenhuma | operação (parcial) + auditoria |
| Operação Viva | expor 9 dimensões de telemetria de viagem | quem constrói | fixture | nenhuma | **auditoria técnica** |
| Conference Brain | provar que a cadeia está viva e recusa inventar pedido | quem constrói | fixture + controle | nenhuma | **auditoria técnica** |
| Copiloto | mostrar propostas sobre saúde de fonte, sem ação | quem constrói | fixture | nenhuma | **auditoria técnica** |
| 7 módulos futuros | reservar lugar | — | nenhum | nenhuma | visão futura |

**Respostas diretas exigidas pela missão:**

- **Por que a home virou Entregas?** Porque foi o único domínio com dado navegável (facade em
  memória). Fato do código: `app.js` faz `return h && h.startsWith("/") ? h : "/entregas"`. Foi
  decisão minha na Unidade 6, sem fonte original que a sustente — **o original nunca teve "home de
  módulo"; tinha uma tela só.**
- **Onde deveria aparecer o estado geral?** Na tela única, como **Calmo + pulso + até 2 ambientes**,
  evoluindo para os **6 cartões** do `Mapa_Ambientes`.
- **Onde deveria aparecer o Copiloto?** **Dentro do Foco**, não como rota — *"o foco vira situação +
  recomendação + porquê + impacto + confiança; nenhum redesenho"*.
- **Onde deveriam aparecer itens e praças?** Nas evidências do Foco e nos cartões de Ambiente.
- **Onde deveriam aparecer boqueta, caixa e atendimento?** Como **ambientes** (Caixa, Conferência),
  não como módulos de menu — e só quando houver dado, nunca "verdes inventados".
- **Onde deveriam aparecer comparações?** Em Memória Operacional — que não existe.
- **Onde deveriam aparecer problemas simultâneos?** Em Ambiente, com cor, **todos visíveis**.
- **Onde deveria existir detalhe técnico?** Fora do chão: *"relatórios são pull (escritório), não
  push (chão)"* (Lei 2). É exatamente o lugar das 4 telas atuais.
- **Conference Brain: tela operacional ou auditoria?** **Auditoria.** Ele não aparece em nenhuma
  fonte de produto; expõe `run_id`, `cycle_id` e versões de contrato.
- **Navegação de 11 módulos corresponde ao original?** **Não.** O original tem 3 domínios internos
  (Operação Viva, Entregas, Suprimentos), 1 adiado (Caixa e Atendimento) e 1 produto separado (TATÁ
  Evolução). "Evolução", "Treinamento", "Seleção e RH", "Gestão" e "CRM e Conversa" como módulos do
  DeliveryOS **não têm origem documental** — foram criados na Unidade 6.

---

## 14. Comparação original × atual (matriz de reconciliação)

| Elemento | Fonte original | Decisão original | Implementação atual | Alinhamento | O que aconteceu | Recuperação necessária |
|---|---|---|---|---|---|---|
| DeliveryOS | `Mapa_Mestre` §1 | plataforma com domínios + motor soberano | plataforma com domínios, **sem motor** | **parcialmente alinhado** | a plataforma foi construída; o motor não foi ligado | ligar o motor como dono do Foco |
| Copiloto | `Camada_Decisao` | ranqueia ação dentro do Foco | recomenda sobre saúde de fonte, rota própria | **desviado** | substituição silenciosa | reposicionar dentro do Foco |
| Operação Viva | `Mapa_Mestre` §2.1 | núcleo cognitivo | projeção de viagens | **desviado** | nome preservado, função trocada | decidir o nome; recuperar a função |
| Calmo | `Modelo` §2 | pulso, sem lista/KPI | ausente | **ausente** | nunca portado | recuperar |
| Ambiente | `Modelo` §3 | até 2 rótulos, sem ação | ausente | **ausente** | nunca portado | recuperar + evoluir p/ 6 cartões |
| Foco | `Modelo` §4 | 1 por vez, 4 linhas + sussurro | ausente | **ausente** | nunca portado | recuperar |
| Atenção soberana | `PRODUCT_CONSTITUTION` §3 | 1 atenção + 1 ação por contexto | só como nome de estilo tipográfico | **desviado** | virou token visual | recuperar como regra |
| Pedidos | motor `sits` | unidade viva | viagem projetada | **desviado** | `order_id` não propagado (D29) | decisão de produto |
| Itens | seed 199 | categoria → praça | ausente do produto | **ausente** | esquecido | recuperar |
| Quentes / frios | `Logica_Embalagens` §7 | separa sacola | `soQuentes` no motor | **parcialmente alinhado** | só no motor desconectado | recuperar |
| Sacolas | `Logica_Embalagens` §11 | 6 causas de 2ª sacola | heurística 47-61% | **conflito** | proxy nunca validado | **8 perguntas ao César** |
| Praças | seed + motor | 8 praças | ausente | **ausente** | esquecido | recuperar |
| Congestionamento | motor `load>BASELINE` | S5 ambiente | ausente | **ausente** | esquecido | recuperar |
| Pausa | S15/S17 | foco acionável | ausente | **ausente** | esquecido | recuperar |
| Reclamações | S19 | foco pós-desfecho | ausente | **ausente** | depende de SAC | decidir fonte |
| Atrasos | S1/S3/S4 | foco | dimensão numérica | **desviado** | virou telemetria | recuperar |
| Gerente | Manifesto | usuário central | **0 menções** nos artefatos novos | **ausente** | perdido na memória | recuperar |
| Boqueta | `Mapa_Ambientes` §1 | ambiente Conferência/Caixa | sem tela | **ausente** | bloqueado por comanda | **perguntas ao César** |
| Caixa | `Mapa_Ambientes` §1 | ambiente | sem dado | **conflito** | não modelado | decidir fonte |
| Atendimento | domínio adiado | escopo não fechado | item de menu "CRM" | **não comprovado** | inventado na Unidade 6 | decidir escopo |
| Memória Operacional | `Modelo` §8 | nasce da Resolução | inexistente | **ausente** | bloqueado pelo item (5) | medir sinal primeiro |
| Resolução | `Modelo` §7 | distingue resolvido de demovido | parcial | **parcialmente alinhado** | nunca formalizada | projetar |
| Evolução | — | **não existe** | item de menu | **não comprovado** | inventado na Unidade 6 | decidir se existe |
| Conference Brain | — | **não existe em fonte original** | 25 arquivos + tela | **não comprovado** | infraestrutura adotada | reposicionar como auditoria |
| Entregas | `Mapa_Mestre` §2.2 | fornece fatos, nunca cria Foco | domínio completo + tela | **alinhado** | preservado | manter |
| Figma | `PRODUCT_CONSTITUTION` §2 | cânone Sprint Visual V2 | 01.x alinhado; capa fora do cânone | **parcialmente alinhado** | capa mede testes | substituir capa |
| Frontend | Manifesto §11 | sem tabela, sem lista, sem KPI | tabelas, metric strips, 11 rotas | **desviado** | estrutura de painel | redesenhar após decisão |
| Android | `Modelo_Viagens_*` | captura de campo offline | implementado e provado | **alinhado** | preservado | manter |
| Notificações | Manifesto §4 | "nunca enxurrada" | inexistentes | **ausente** | nunca desenhadas | **requisito novo** |
| Comparação semanal | — | **não existe** | inexistente | **ausente** | nunca desenhada | **requisito novo** |

**Placar: 3 alinhados · 6 parcialmente alinhados · 10 desviados · 10 ausentes · 2 conflitos · 3 não comprovados.**

---

## 15. Linha do tempo da deriva

| Data | Commit | Evento | Efeito |
|---|---|---|---|
| — | `b5b8c23`, `1d212cc` | Constituição, Leis, Manifesto | a visão é escrita e red-teamed |
| — | `7ef56f6` | backtest 30 dias | a inteligência é medida |
| — | `82eb2f3` | Camada de Decisão | nasce a ação de 4 linhas |
| 02/07 | `6607ec9` | caso "402 min" | honestidade de confiança vira regra |
| **05/07** | `37ca1c9` | correção Motor×Decisão **implementada** | troca proibida → 0 |
| **05/07** | `72561c9` | `Estado_Atual_DeliveryOS.md` | **última memória de produto** — e já nasce desatualizada (diz que a correção está pendente) |
| ~05-12/07 | — | **três documentos param em perguntas ao César** (8+8+8 = 24) | **o produto trava, não por técnica** |
| 12/07 | `a03508c` | pivô 1 — domínios | **preserva** Calmo/Ambiente/Foco por escrito |
| 18-20/07 | `96d76a3`…`de1d7eb` | pivô 2 — Entregas ganha UX própria | primeiro módulo com jornada própria |
| 20/07 | doc integração | Copiloto ainda dono de Calmo/Ambiente/Foco, "não conectado" | **último artefato com o vocabulário** |
| **26/07** | `4335d16` | pivô 3 — `src/platform` | começa a era da observabilidade |
| 27-31/07 | Unidades 1-5 | plataforma, contratos, Brain, shadow | coerente com a Lei 11 |
| 01/08 | Unidade 6 | Product System, Figma, 11 módulos | **apresentação nasce na linguagem da observabilidade** |

**O ponto exato da deriva: entre 05/07 e 12/07**, quando 24 perguntas ficaram sem resposta e o
projeto escolheu avançar no que não dependia delas. Os pivôs 1 e 3 não são a deriva — são
consequência de um bloqueio de produto que nunca foi tratado como bloqueio.

---

## 16. Causa-raiz

Não é deriva de arquitetura. Não é erro de execução. São **três causas encadeadas**:

**Causa 1 — O produto ficou bloqueado em perguntas humanas, e o bloqueio nunca foi registrado como
bloqueio.** `Logica_Embalagens` §15 (8 perguntas), `Mapa_Ambientes` §13 (8), `Auditoria_Praca_Comanda`
(8). Todas objetivas, respondíveis por áudio, todas travando a camada de produto. **Nenhuma aparece
em `docs/execution/BLOCKERS.md`** — que registra Android, PostgreSQL, Docker e backup. O sistema de
memória tinha lugar para bloqueio técnico e **nenhum lugar para bloqueio de produto**.

**Causa 2 — A memória executável não referencia a memória de produto.** `CLAUDE.md` §11 manda ler
quatro arquivos de `docs/execution/`. Nenhum deles cita `Estado_Atual_DeliveryOS.md`,
`Mapa_Sinais_Operacionais.md`, `Mapa_Ambientes_V1.md` ou `Logica_Embalagens`. Quem retoma o trabalho
lê o estado técnico e **não encontra o produto** — foi exatamente o que aconteceu comigo nas
Unidades 1 a 6.

**Causa 3 — "Completo" passou a significar tecnicamente completo.** Os vereditos
(`..._UNIT_COMPLETE`) medem testes, contratos e ausência de regressão. Nenhum deles pergunta se uma
jornada humana foi resolvida. Com uma régua que só mede o que é mensurável, o trabalho migra
naturalmente para o que é mensurável.

**A causa-raiz única, se for para nomear uma:** o projeto tinha um método rigoroso para provar
verdade técnica e **nenhum método para manter viva a intenção de produto entre sessões**. A intenção
não foi rejeitada — ela foi deixada de fora do único mecanismo que sobrevive à troca de contexto.

---

## 17. Ativos preserváveis

| Ativo | Classificação | Justificativa |
|---|---|---|
| Constituição, Leis, Manifesto | **preservar integralmente** | sobreviveram intactos e ainda decidem |
| `Mapa_Sinais_Operacionais` (22 sinais) | **preservar e integrar à visão** | é o backlog de produto já pronto |
| `Mapa_Ambientes_V1` (6 ambientes) | **preservar e integrar** | responde ao pedido atual de César |
| `Logica_Embalagens` | **preservar e integrar** | regra física de 2ª sacola / quente-frio |
| `motor.js` + `decisao.js` | **preservar e reposicionar** | o coração; hoje desconectado |
| Backtest 30 dias · 12 janelas · seed 199 itens | **preservar integralmente** | evidência insubstituível |
| Event log append-only + trigger | **preservar como infraestrutura** | Lei 1 em arquitetura |
| Outbox, idempotência, replay | **preservar como infraestrutura** | provados |
| Runtimes crítico × assíncrono | **preservar como infraestrutura** | a rua não para |
| PostgreSQL + migrations | **preservar como infraestrutura** | verificado contra servidor real |
| Android offline-first + auth de dispositivo | **preservar integralmente** | P0 corrigido e provado |
| GPS / viagens | **preservar como infraestrutura** | domínio Entregas alinhado |
| PII guard, `erroSeguro` | **preservar integralmente** | Lei 4 |
| Stores (JSONL do Brain) | **preservar como infraestrutura** | auditável |
| Conference Brain | **preservar como infraestrutura · reposicionar** | não é módulo de produto |
| Copiloto Shadow | **preservar e reposicionar** | vira camada de garantia do motor |
| Operação Viva atual | **preservar e renomear** | projeção correta com nome errado |
| Design System (tokens, 22 estados, a11y) | **preservar integralmente** | bom, raro, reutilizável |
| Motion System | **preservar e simplificar** | correto, mas dimensionado para telas densas |
| Componentes (`campo`, `metric`, evidência, limitação) | **preservar e reposicionar** | úteis fora do painel |
| Telas da Unidade 6 | **reposicionar como auditoria** | não descartar; mudar de lugar |
| Figma 01.x | **preservar integralmente** | fundação e componentes sólidos |
| Figma 02 (telas) | **redesenhar após decisão** | representa a camada errada |
| Figma capa | **substituir** | mede o produto em testes; fora do cânone |
| Navegação de 11 módulos | **simplificar** | 5 sem origem documental |
| `docs/execution/**` | **preservar e ampliar** | precisa carregar produto e bloqueio humano |
| Testes (419) | **preservar integralmente** | nenhum mede produto, mas todos protegem verdade |

**Nada nesta lista pede exclusão.**

---

## 18. Elementos que precisam ser recuperados

Em ordem de dependência, **sem implementar**:

1. **As 24 respostas do César** (Embalagens 8 · Ambientes 8 · Praça/Comanda 8) — destravam Atenções
   Leves, Mapa de Ambientes e a regra real de 2ª sacola.
2. **Os três estados** (Calmo · Ambiente · Foco) como conceito de produto no Figma e no frontend.
3. **O ranking do Copiloto** (`decisao.js`) como fonte da ação dentro do Foco.
4. **Os 6 ambientes** como superfície de "todos os problemas visíveis com urgência diferenciada".
5. **Praça, item, quente/frio, sacola** como vocabulário de primeira classe.
6. **A comanda** — ou a decisão de que o número curto do iFood basta.
7. **Resolução** formalizada (distinguir resolvido de demovido).
8. **Medição de sinal** para Memória Operacional (item 5 da dívida de 05/07).
9. **O gerente** como usuário nomeado nos artefatos.

---

## 19. Conflitos ainda abertos

| # | Conflito | Fontes em choque |
|---|---|---|
| C1 | Ambiente pode ou não carregar orientação de ação? | César (quer "dicas práticas" nos secundários) × `Modelo` §3 e `Mapa_Ambientes` §11 (proíbem bloco de ação em Ambiente) |
| C2 | Quem é "Operação Viva": o núcleo cognitivo ou a projeção de viagens? | `Mapa_Mestre` §2.1 × `src/platform/projections/operacao-viva.ts` |
| C3 | Qual motor é a fonte da verdade da atenção? | `decisao.js` × `shadow.ts` — ligar os dois sem decidir recria o defeito corrigido em `37ca1c9` |
| C4 | "Quentes" é hot roll/tempura ou os pratos da cozinha? | César × `DISPLAY.cozinha_quentes = "Quentes"` no motor — **colisão de nome não resolvida** |
| C5 | Caixa e Conferência não têm dado; podem aparecer? | César (quer ver) × `Mapa_Ambientes` §7 (mostrar sem dado = inventar operação) |
| C6 | "Duas sacolas" é heurística (47-61%) ou regra real? | motor × `Logica_Embalagens` §11 |
| C7 | CRM, Evolução, Treinamento, RH, Gestão são módulos do DeliveryOS? | Unidade 6 × `Mapa_Mestre` (não existem) |
| C8 | Notificação fora da tela é permitida? | César (jornadas 15/16) × Manifesto §4 |

**Fontes não examinadas / inacessíveis:** (1) `docs/design/canonical/deliveryos-visual-v2/*.zip` —
o Sprint Visual V2, declarado cânone soberano, não foi aberto; (2) worktree
`deliveryos-copiloto-v33-implementation` — a "implementação validada do Copiloto" citada como nível
2 da hierarquia visual, fora deste repositório.

---

## 20. Perguntas que somente César pode responder

Dez, nenhuma respondida em documento ou nesta conversa. Cada uma destrava uma decisão concreta.

| # | Pergunta | Destrava |
|---|---|---|
| Q1 | Quando dois ou três problemas aparecem ao mesmo tempo, você quer uma dica de ação em **cada um**, ou uma dica só no mais grave e apenas o nome dos outros? | resolve C1 — define se Ambiente ganha bloco de ação |
| Q2 | "Quentes" para você é hot roll e tempura, ou os pratos da cozinha? E "Cozinha" é o quê? | resolve C4 — sem isso, a tela mostra a área errada |
| Q3 | O que faz um pedido virar "duas sacolas" na prática: quente com frio junto, volume, ou quantidade de itens? | resolve C6 — substitui heurística de 47-61% por regra |
| Q4 | Quando o pedido chega na bancada, de onde vem o número que vocês usam para achá-lo? Dá para exportar de algum lugar? | destrava a jornada da boqueta (sem isso, nenhuma atenção é acionável) |
| Q5 | Existe algum sinal digital de que a **caixa** está atolada, ou isso só se vê no olho? | resolve C5 — define se Caixa entra como ambiente ou como "sem medição" |
| Q6 | Uma área "amarela" (acompanhar) e uma "vermelha" (agir agora): a diferença para você é quantos pedidos esperando, ou quantos minutos? | destrava os limiares dos 6 ambientes |
| Q7 | Quando você está fora da loja e algo piora, como você quer ser avisado — e a partir de que gravidade? | resolve C8 e as jornadas 15/16, que nunca foram desenhadas |
| Q8 | "Esta segunda foi melhor que a passada": melhor em quê — menos atraso, menos erro, mais pedidos, ou outra coisa? | define o que a Memória Operacional precisa guardar |
| Q9 | As telas que fizemos (Operação Viva, Conference Brain, Copiloto) servem para **você** no dia a dia, ou são para quem constrói o sistema conferir se está funcionando? | resolve o destino das 4 telas: produto ou auditoria |
| Q10 | Se em duas semanas só uma coisa pudesse funcionar de verdade na sua loja, qual seria? | define a sequência de recuperação |

---

## 21. Opções de recuperação

Quatro. Nenhuma escolhida.

### Opção A — Destravar as perguntas (sem tocar em código)
- **Recupera:** o fluxo de decisão de produto que parou em julho.
- **Preserva:** absolutamente tudo.
- **Muda:** `BLOCKERS.md` passa a registrar bloqueio **humano**; `NEXT_RESUME.md` passa a apontar
  para a memória de produto; as 24 perguntas viram uma pauta.
- **Reaproveitamento:** 100%. **Backend/Figma/Frontend/Copiloto/Op. Viva:** zero impacto.
- **Risco:** baixo. **Complexidade:** baixa. **Dependências:** só a agenda do César.
- **Permanece sem solução:** o produto continua sem Calmo/Ambiente/Foco.

### Opção B — Recuperar a experiência (o motor volta a ser a home)
- **Recupera:** Calmo, Ambiente, Foco, ranking do Copiloto, vocabulário de praça/item.
- **Preserva:** toda a plataforma, contratos, Brain, Android, Design System, testes.
- **Muda:** nasce uma superfície única (tela de operação) alimentada por `decisao.js`; as 4 telas
  atuais viram **área de auditoria**, fora da home; o Copiloto sai do menu e volta para dentro do Foco.
- **Reaproveitamento:** ~85%. **Backend:** precisa de um adaptador de leitura do motor (não conectar
  os dois motores — escolher um dono do Foco, C3). **Figma:** nova página de experiência; 01.x
  intacto. **Jornadas:** resolve 1, 2, 4, 8, 12, 14.
- **Risco:** médio (C3 é real). **Complexidade:** média. **Sequência:** depende de A.
- **Permanece sem solução:** jornadas 15-18 (notificação, comparação, resultado).

### Opção C — Recuperar o produto inteiro
- **Recupera:** B + 6 ambientes + Atenções Leves + Resolução + medição para Memória Operacional.
- **Preserva:** toda a infraestrutura; Brain vira consumidor de memória.
- **Muda:** exige as 24 respostas, o mapa praça→ambiente validado, e provavelmente uma fonte nova
  (KDS/impressora) para comanda e pronto-por-praça.
- **Reaproveitamento:** ~75%. **Jornadas:** resolve 1-14 e 17-18.
- **Risco:** alto — depende de fonte externa (iFood contínuo ainda em negociação) e de dado que hoje
  não existe. **Complexidade:** alta. **Sequência:** A → B → C.
- **Permanece sem solução:** jornada 15/16 se não houver canal de notificação.

### Opção D — Reposicionar sem recuperar
- **Recupera:** nada. **Preserva:** tudo.
- **Muda:** apenas a moldura — as 4 telas são declaradas "console de auditoria", a capa do Figma é
  substituída, a navegação encolhe para os domínios reais, e o produto é assumido como ainda não
  iniciado.
- **Reaproveitamento:** 100%. **Risco:** baixo. **Complexidade:** baixa.
- **Permanece sem solução:** tudo o que é produto. É honestidade sem avanço.

**Recomendação técnica (não decisão):** **A imediatamente, depois B.** A é gratuita, remove a causa-raiz
(bloqueio humano invisível) e não consome nenhuma decisão de produto. B tem o melhor retorno por
risco: recupera o coração do produto usando código que já existe, já foi medido contra 30 dias reais
e já está no repositório — sem tocar em nada do que foi provado nas seis unidades. C só depois das
respostas, porque metade dela depende de dado que hoje não existe.

---

## 22. Sequência recomendada antes de implementar

1. **César responde Q1–Q10** desta auditoria (30-40 min, sem tela).
2. **Sessão lado a lado:** abrir `npm run ui:product` (porta 5290) e o protótipo original
   (`prototipo`, porta 5178) na mesma tela. Perguntar apenas: *"qual destes dois é o DeliveryOS?"*
3. **Com a resposta**, César responde as 24 perguntas antigas dos três documentos (podem ser áudios).
4. **Só então** escolher entre A, B, C ou D.
5. **Antes de qualquer código:** decidir C2 (quem é "Operação Viva") e C3 (quem é dono do Foco).
   Essas duas decisões precedem qualquer linha.

---

## 23. Ações proibidas até aprovação

- Não iniciar Unidade 7.
- Não conectar `decisao.js` ao pipeline novo — C3 está aberto e ligar sem decidir recria o defeito de `37ca1c9`.
- Não renomear "Operação Viva" nem nada.
- Não implementar Mapa de Ambientes — proibido pela **regra absoluta** do próprio documento §"Regra absoluta".
- Não implementar Atenções Leves — bloqueado pelas 8 perguntas.
- Não implementar Memória Operacional nem Resolução — a proibição de 05/07 continua válida e correta.
- Não propagar `order_id` (D29 continua de pé).
- Não criar rota B5.
- Não redesenhar Figma nem descartar as telas da Unidade 6.
- Não alterar `Estado_Atual_DeliveryOS.md` — é a memória do César.
- Não tratar nenhuma conclusão desta auditoria como autorização para construir.

---

## Legenda de classificação de evidência usada neste relatório

- **fato documental** — citação direta de documento versionado, com caminho.
- **fato do código** — resultado de leitura ou busca no código, com arquivo e linha.
- **fato visual** — observado em execução real (protótipo porta 5178, frontend porta 5290, Figma).
- **declaração atual de César** — trazida nesta conversa, com autoridade superior a inferência.
- **inferência** — conclusão minha a partir de duas ou mais evidências; marcada no texto.
- **hipótese** — leitura plausível sem prova suficiente.
- **recomendação** — proposta, nunca decisão.

*Missão analítica. Nenhum código, Figma, frontend, arquitetura ou memória executável foi modificado.
Único arquivo criado: este relatório.*
