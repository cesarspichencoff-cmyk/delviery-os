# Linhagem visual canônica — ENTREGAS

| Campo | Valor |
|---|---|
| Status | **Direção aprovada · composições em correção obrigatória · redesign NÃO autorizado** |
| Data | 2026-07-20 |
| Composições corrigidas | `docs/entregas/ux/composicoes-v2/CORRECOES_OBRIGATORIAS.html` |
| Nível 1 | Sprint Visual DeliveryOS V2 (ZIP canônico) |
| Nível 2 | DeliveryOS Organismo Operacional V3.3 (referência validada; **não alterado**) |
| Módulo | ENTREGAS — “Os pedidos ganham movimento.” |
| Copiloto | “A operação ganha consciência.” |
| Implementação de redesign | **NÃO iniciada** |

## Matriz objetiva (prova de uso da referência)

| Elemento | Sprint Visual V2 | DELIVERYOS V3.3 | Proposta ENTREGAS | Justificativa |
|---|---|---|---|---|
| Superfície dominante | Fundo creme quente (#F4EFE4 / #E7DECD); leitura editorial | Mesma atmosfera no Copiloto | Mesma superfície; mapa e viagem como foco vivo | Parentesco de marca sem copiar layout Calmo/Ambiente/Foco |
| Atenção soberana | Um foco por estado (ex.: “Pedido pedindo conferência…”) | Card Foco + “Uma ação agora” | Um foco de movimento: viagem em montagem, parada atual, pendência | Mesma gramática; objeto = pedidos em rota |
| Ação soberana | Botão verde único, glow suave | CTA verde “Conferir este pedido…” | Um CTA por contexto (Montar viagem / Confirmar parada / Sincronizar) | Verde Tatá = ação viva; nunca N botões iguais |
| Tipografia | Spectral (editorial) · Hanken Grotesk (UI) · IBM Plex Mono (técnico) | Aplicada no Organismo | Mesma trinca canônica; sem system UI | Personalidade editorial do ecossistema |
| Hierarquia | Label mono + título Spectral grande + corpo recuado | Labels FOCO / AMBIENTE / POR QUE AGORA | Labels VIAGEM / PARADA / PENDÊNCIA / EXPEDIÇÃO | Mesma escala; vocabulário de movimento |
| Uso do verde | Vivo, fluindo, ação | Bordas e CTA | Rota ativa, CTA, status “em rota” | Confiança = solidez cheia em verde |
| Uso do âmbar | Tensão operacional (atenção) | Bordas “Atenção” em filas | Pendência, atraso, handoff em espera | Pressão ≠ falha técnica |
| Neutros / incompleto | Tracejado cinza-quente | Cards “Em validação” | Offline parcial, sync pendente | Solidez interrompida, não erro |
| Falha técnica | Cinza-ardósia | (Contrato Estados Técnicos) | Falha de sync / GPS técnico | Separado do âmbar operacional |
| Composição | Espaço generoso; contexto à margem | Foco central + rail lateral | Desktop: mapa + painel soberano; mobile: parada full-bleed | Não dashboard de cards |
| Grid / escala | Base 4px; respiro generoso | Layout orgânico | 8/16/24/40; gutters amplos | Mobile-first do Sprint |
| Bordas | Cards brancos raio generoso; borda colorida por estado | Raio ~20–24px | Mesmo idioma; mapa com moldura viva | Evita card SaaS flat genérico |
| Profundidade | Glow suave no CTA; sombra mínima | Glow verde no botão | Glow em ação + pulso leve em rota | Tecnologia silenciosa |
| Ícones | Mínimos; ponto de status | Dot colorido | Dot + pin de mapa custom | Sem iconografia material genérica em massa |
| Motion | Transição de consciência (Calmo→Ambiente→Foco) | Estados cognitivos | Assinatura: **deslocamento da rota / parada** | Movimento operacional próprio do ENTREGAS |
| Estados vazios | “Em fluxo” · silêncio visual | “Nada precisa de você agora” | “Nenhuma viagem em montagem” / “Rota tranquila” | Silêncio com intenção |
| Estados de atenção | Âmbar + linguagem humana | “Atenção · Duplas com pedidos…” | “Pendência na parada 3” | Humano, sem jargão |
| Mensagens | Frases completas, editoriais | “Evita item esquecido…” | “Confirme a entrega antes de seguir” | Mesma voz |
| Navegação | Shell mínimo; não compete com foco | Header leve DeliveryOS | Header leve ENTREGAS + contexto da sessão | Shell não é o produto |
| Mapa | (não é o foco do Copiloto) | — | **Superfície de movimento** custom (tiles + rota + pins TATA) | Identidade cartográfica própria |
| Offline / sync | Contrato de estados técnicos | Solidez vs interrompido | Banner de solidez; fila de sync; sem drama | Inteligência perceptível no comportamento |
| Mobile | Mobile-first no Sprint | — | Parada atual como única atenção | Dedo e rua |
| Desktop | Leitura ampla | Console de consciência | Console de movimento (mapa + montagem) | Mesma linhagem, função distinta |
| Inteligência | Pelo comportamento, não selo “IA” | Recomenda e recua | Só o que o domínio prova; **sem** ordem “pelo bairro”, tempo no local ou GPS simulado como fato | Silenciosa; visão futura marcada |
| Anti-SaaS | Remover cards Ambiente com % e anéis | Foco único | Proibido ranking, 3 colunas iguais, KPI wall | Critério global §8 |

## Princípios detalhados (Sprint → Copiloto → ENTREGAS)

### 1. Tipografia

| Campo | Conteúdo |
|---|---|
| Referência Sprint | Pacote Visual V2 — Spectral / Hanken Grotesk / IBM Plex Mono |
| Significado | Editorial + interface + técnico; personalidade humana |
| Aplicação Copiloto | Títulos de estado em Spectral; UI em Hanken; meta em Plex |
| Tradução ENTREGAS | Idem; títulos de viagem/parada em Spectral light/regular |
| Compartilhado | Trinca de fontes + pesos |
| Adaptado | Escala de títulos para mapa e mobile (menor meta, maior parada) |
| Específico | Labels de rota/parada (VIAGEM, PARADA N) |
| Risco | Cair em system-ui “por conveniência” |
| Evidência | Composições 1–7 usam Google Fonts canônicas |

### 2. Escala e grid

| Campo | Conteúdo |
|---|---|
| Referência Sprint | Escala 4px; respiro generoso; mobile-first |
| Significado | Serenidade; nada apertado tipo painel logístico |
| Copiloto | Margens amplas; card foco isolado |
| ENTREGAS | Desktop 12-col lógico (mapa 7 / painel 5); mobile stack único |
| Risco | Densidade de “TMS SaaS” |
| Evidência | Comps 1–3 desktop; 4–5 mobile |

### 3. Composição e hierarquia

| Campo | Conteúdo |
|---|---|
| Referência | Uma atenção dominante; contexto recuado |
| Copiloto | Foco central + “Por que agora” lateral |
| ENTREGAS | **Objeto dominante = fluxo de movimento** (viagem/mapa/parada); filas e histórico recuados |
| Específico | Linha de paradas como narrativa temporal |
| Risco | Voltar a três colunas de cards iguais |

### 4. Ação soberana

| Campo | Conteúdo |
|---|---|
| Referência | “Uma ação agora” + CTA verde full |
| Copiloto | Conferir pedido |
| ENTREGAS | Montar / Iniciar viagem / Confirmar parada / Sincronizar / Confirmar handoff |
| Compartilhado | Um botão soberano; secundários textuais |
| Risco | Toolbar de 6 botões primários |

### 5. Verde / âmbar / neutros

| Campo | Conteúdo |
|---|---|
| Referência | Verde vivo; âmbar tensão; neutro incompleto; ardósia falha |
| Copiloto | Filas e CTA |
| ENTREGAS | Verde=rota/ação; âmbar=pendência; tracejado=offline; ardósia=erro técnico de sync |
| Risco | Usar vermelho de alarme SaaS para pendência operacional |

### 6. Bordas, profundidade, ícones

| Campo | Conteúdo |
|---|---|
| Referência | Card branco, raio generoso, borda de estado, glow no CTA |
| ENTREGAS | Painel de viagem; pins sólidos (cheio=confirmado, outline=pendente) |
| Risco | Material elevation genérica; ícones Lucide em excesso |

### 7. Motion (assinatura ENTREGAS)

| Campo | Conteúdo |
|---|---|
| Referência Sprint | Mudança de consciência entre estados |
| Copiloto | Transição cognitiva Calmo → Ambiente → Foco |
| ENTREGAS | **Movimento operacional**: progresso da rota, parada que “avança”, pulse de sync |
| Específico | Linha de rota que ganha solidez conforme paradas confirmam |
| Risco | Animações decorativas sem significado operacional |

### 8. Estados vazios e de atenção

| Campo | Conteúdo |
|---|---|
| Referência | “Em fluxo” / silêncio; “Atenção” com causa humana |
| ENTREGAS | Vazio = “Nada em movimento agora”; Atenção = “Parada 3 sem confirmação” |
| Risco | Empty state ilustrado genérico |

### 9. Mensagens e navegação

| Campo | Conteúdo |
|---|---|
| Referência | Frases humanas; header mínimo |
| ENTREGAS | “Confirme a entrega em Rua X”; header ENTREGAS + sessão |
| Risco | Toasts técnicos; nav que compete com o mapa |

### 10. Mapa, offline, sync, mobile, desktop

| Campo | Conteúdo |
|---|---|
| Referência mapa | Não copiar Google Maps stock; identidade TATA |
| ENTREGAS mapa | Tiles quentes; rota com solidez; pins de estado — **proposta**; exige prova MapLibre real antes da aprovação final da cartografia |
| Offline | Sync **automática**; motoboy não administra fila; “Enviar agora” só secundário |
| Mobile | Por estado: Abrir rota → Cheguei → Confirmar entrega; problema secundário |
| Desktop | Console com verdade sem GPS; GPS só como visão futura marcada |
| Risco | Mapa stock; GPS fictício; jargão técnico na UI; ação inválida no estado |

## Problemas da referência histórica (app-v1) que **não** serão repetidos

| Problema observado em app-v1 / demos | Por que o Sprint proíbe | Como ENTREGAS evita |
|---|---|---|
| Tabelas e listagens como identidade | Não é leitura editorial | Mapa + foco; lista é contexto |
| Densidade de painel logístico | Quebra respiro e serenidade | Espaço intencional |
| Múltiplas ações equivalentes | Quebra “uma ação soberana” | Um CTA por contexto |
| Tipografia system / genérica | Sem personalidade do Pacote | Spectral/Hanken/Plex |
| Cards KPI / % | Anti-padrão REMOVER (Ambiente com %) | Sem barras de “pressão %” no ENTREGAS |
| Aparência SaaS multi-coluna | “Três colunas ≠ identidade DELIVERYOS” | Composição editorial de movimento |
| Cores iguais = “irmão” | Proibido parentesco por hex | Linhagem + composições |

**app-v1 não entra na comparação lado a lado de qualidade.** Só nesta seção de anti-padrões.

## Comparação visual lado a lado (método)

Para cada composição em `docs/entregas/ux/composicoes-v2/`:

1. **Referência canônica** — captura ou frame do Sprint / Organismo (estado análogo).  
2. **Proposta ENTREGAS** — composição HTML de alta fidelidade.  
3. **Desktop / Mobile** — viewport indicado no frame.  

Arquivo índice: `docs/entregas/ux/composicoes-v2/INDEX.html`  
Especificação textual: `docs/entregas/ux/COMPOSICOES_ALTA_FIDELIDADE_V2.md`

## Critérios de aprovação (César)

- [ ] Parentesco evidente com DELIVERYOS (não só cores)  
- [ ] Identidade própria de movimento (ENTREGAS)  
- [ ] Tipografia canônica  
- [ ] Uma superfície dominante + uma ação soberana  
- [ ] Mapa personalizado (comp 7)  
- [ ] Simplicidade operacional  
- [ ] Ausência de SaaS genérico  
- [ ] Domínio/contratos **intactos** (sem implementação nesta fase)

## Parada obrigatória

Após registro do cânone + linhagem + 7 composições: **PARAR.**  
Não implementar redesign · não alterar domínio · não shell · não push · não deploy.  
Aguardar **aprovação expressa do César**.
