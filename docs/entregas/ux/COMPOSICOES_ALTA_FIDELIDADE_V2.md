# Composições de alta fidelidade — ENTREGAS V2

| Campo | Valor |
|---|---|
| Status | **AGUARDA APROVAÇÃO DO CÉSAR** |
| Data | 2026-07-20 |
| Artefato interativo | [`composicoes-v2/INDEX.html`](composicoes-v2/INDEX.html) |
| Linhagem | [`LINHAGEM_VISUAL_CANONICA.md`](LINHAGEM_VISUAL_CANONICA.md) |
| Implementação | **NÃO iniciada** |

Abrir o `INDEX.html` no navegador (com rede para Google Fonts) para revisar as sete composições com tipografia canônica e side-by-side da referência Sprint.

---

## 1. Console — operação normal

| Campo | Conteúdo |
|---|---|
| Superfície | Desktop |
| Ref. Sprint | Estado “Em fluxo” / Calmo — silêncio soberano |
| Atenção dominante | Operação estável em movimento |
| Ação soberana | Nenhuma forçada; “Montar nova viagem” é fantasma |
| Hierarquia | Título Spectral · lista de viagens recuada · contexto no rodapé do painel |
| Tipografia | Spectral / Hanken / Plex |
| Tecnologia percebida | Mapa em quietude; atualização sem alarme |
| Comportamento | Não puxa atenção se nada travar |
| Parentesco DELIVERYOS | Mesma serenidade do Calmo; sem cards Ambiente % |
| Identidade ENTREGAS | Viagens em rota como respiração do módulo |

## 2. Console — montagem viva de viagem

| Campo | Conteúdo |
|---|---|
| Superfície | Desktop |
| Ref. Sprint | Foco + “Uma ação agora” |
| Atenção dominante | Viagem em formação |
| Ação soberana | **Iniciar viagem com Carlos** (verde + glow) |
| Hierarquia | Ordem de paradas · pool de prontos · “por que esta ordem” |
| Tecnologia | Sugestão de ordem sem selo IA |
| Comportamento | Mapa mostra rota prevista antes da saída |
| Parentesco | CTA único soberano; contexto lateral/recuado |
| Identidade ENTREGAS | Movimento **antes** de sair |

## 3. Console — viagem em rota com pendência

| Campo | Conteúdo |
|---|---|
| Superfície | Desktop |
| Ref. Sprint | Ambiente “Atenção” + Foco com causa |
| Atenção dominante | Parada 2 sem confirmação |
| Ação soberana | Abrir pendência da parada 2 |
| Verde / âmbar | Rota sólida vs parada em tensão |
| Comportamento | Painel assume o foco sozinho |
| Proibido | Vermelho de alarme SaaS para pendência operacional |

## 4. Mobile — parada atual

| Campo | Conteúdo |
|---|---|
| Superfície | Mobile (frame 390) |
| Ref. Sprint | Mobile-first · uma atenção · uma ação |
| Atenção dominante | Endereço da parada agora |
| Ação soberana | Confirmar entrega |
| Secundário | Abrir no mapa do celular (não é a identidade) |
| Identidade ENTREGAS | O pedido na porta |

## 5. Mobile — offline e sincronização

| Campo | Conteúdo |
|---|---|
| Superfície | Mobile |
| Ref. Sprint | Confiança = solidez; incompleto = tracejado |
| Atenção dominante | Trabalho local + fila de sync |
| Ação soberana | Confirmar entrega (local) |
| Secundário | Tentar sincronizar agora |
| Comportamento | Guarda confirmações; não bloqueia a rua |
| Proibido | Full-screen error genérico |

## 6. Expedição iFood

| Campo | Conteúdo |
|---|---|
| Superfície | Desktop expedição |
| Ref. Sprint | Foco editorial + CTA; técnico escondido |
| Atenção dominante | Código / verificação do handoff |
| Ação soberana | Confirmar saída do pedido |
| Domínio preservado | Courier iFood **não** é usuário; `external_courier_ref` só rastro |
| Identidade | Superfície de **casa**, não app do entregador externo |

## 7. Linguagem cartográfica ENTREGAS

| Campo | Conteúdo |
|---|---|
| Superfície | Spec visual do mapa |
| Ref. Sprint | Creme · verde · solidez · ausência de SaaS |
| Elementos | Tiles quentes desaturados · rota narrativa · pins de estado |
| Estados pin | Casa · feito · agora · espera · futuro |
| Rota | Cheia = percorrida/sólida · tracejada âmbar = tensão/à frente |
| Stack | MapLibre + OSM (demo); **skin** é a identidade |
| Proibido | Pins default do provedor como rosto final |

---

## Matriz resumida de parentesco

| Elemento | Sprint V2 | V3.3 Copiloto | ENTREGAS (proposta) |
|---|---|---|---|
| Superfície creme | sim | sim | sim |
| Spectral / Hanken / Plex | sim | sim | sim |
| Uma ação soberana verde | sim | sim | sim |
| Silêncio quando calmo | sim | sim | sim |
| Cards Ambiente com % | anti-padrão | evitar | **não usar** |
| Objeto de foco | consciência / pedido | foco cognitivo | **viagem / parada / rota** |
| Motion assinatura | mudança de estado | Calmo→Foco | **progresso de movimento** |
| Mapa como rosto | não | não | **sim (comp 7)** |

---

## Como revisar

1. Abrir `docs/entregas/ux/composicoes-v2/INDEX.html` no browser.  
2. Percorrer 1→7; em cada uma, ler o painel “Referência canônica”.  
3. Confrontar com `LINHAGEM_VISUAL_CANONICA.md`.  
4. Aprovar, pedir ajuste de composição, ou rejeitar direção — **sem** pedir código ainda.

## Após aprovação

Só então: redesign **somente** da camada UI, preservando domínio/commands/regras/ApplicationService/contratos/persistência/testes/fluxos.
