# Design Handoff — Entregas V0.3 (identidade canônica DeliveryOS V3.3)

| Campo | Valor |
|---|---|
| Protótipo | `prototipos/entregas-v01/` |
| Versão | **Entregas V0.3 — identidade V3.3** |
| Branch | `research/tata-evolucao-grok` |
| Base de trabalho | HEAD anterior à reconstrução (inclui lab V0.2 + direções) |

---

## 1. Referência canônica usada

| Item | Valor |
|---|---|
| ZIP | `C:\Users\italo\Downloads\Sprint Visual DeliveryOS V2 (1).zip` |
| SHA-256 ZIP | `2755573BBE624F4CE0DBA992D006E6E5B8E2B6DEA87B7D6A2050E55FD9834101` |
| Arquivo interno | `DeliveryOS Organismo Operacional.dc.html` |
| SHA-256 HTML | `434294036F86FF6976B48FB3EC4B58D5C4CECEFE272FEEA181E9A167E7B19FBC` |
| Tamanho | `104769` bytes |

Única referência visual autorizada. ZIP e HTML originais **não** foram modificados.

Não usados: PDF anterior, camada0, protótipo V0.2 como design-alvo, lab de direções A/B/C como identidade final.

---

## 2. Elementos visuais transplantados do V3.3

| Elemento | Valor / comportamento |
|---|---|
| Fundo organismo | `#08130D` / `#0C1811` / `#0E2016` / `#13291D` |
| Superfícies | `#1B3527`, `#1F3E2E`, `#22402F`, linhas `#274B39` |
| Acento vivo | `#8CC63F`, `#BEE592`, glow verde |
| Tensão | `#E0A25A`, `#C98A46` (âmbar — texto + forma) |
| Técnico | `#9AA7B0` + **tracejado** (nunca só cor) |
| Tinta | `#F2EBD9`, `#BFCBB2`, `#7E9478`, `#A8BCA0` |
| Tipografia display | **Spectral** |
| Tipografia UI | **Hanken Grotesk** |
| Tipografia meta | **IBM Plex Mono** (eyebrows, IDs, estágios, conexão) |
| Pílula de ação | Verde sólido, raio ~12px, min-height 48px |
| Eyebrow / prancha | Mono uppercase letter-spacing ~0.14em |
| Hierarquia Foco | Eyebrow → situação (Spectral) → consequência → evidências tracejadas → ação |
| Motion | `surge` / `surgeFoco` / `dosPulse`; `prefers-reduced-motion` desliga animações |
| Mobile | Mesma família tipográfica e hierarquia; ação dominante abaixo da dobra editorial |
| Progressive disclosure | Só estágio anterior, atual e próximo (LOJA→…→FECHAMENTO) |

---

## 3. Adaptações para Entregas (domínio)

Copiado **somente** linguagem visual/comportamental. **Não** copiado semanticamente:

- Quentes / Sushi / Kenji  
- Previsão de conferência do Copiloto  
- Ação acompanhada / fechamento de turno / voz do Copiloto  

| V3.3 (Copiloto) | Entregas V0.3 |
|---|---|
| Áreas de bancada no organismo | **Viagens** como áreas do organismo |
| Atenção de produção | Atenção de **Trip** (bloqueio, rota, exceção, retorno, fechamento) |
| Foco de pedido/praça | Foco de **viagem** com volumes, paradas, handoff |
| Estados técnicos de fonte | Offline / instável / sync — texto + pip + tracejado |

Domínio preservado integralmente: Trip, Delivery, Handoff, volumes, tentativas, E01–E10, offline, retorno, reenvio, fechamento real, privacidade, ausência de ranking, 20 cenários.

---

## 4. Calmo

- Default de abertura: cenário **18 · Viagem encerrada** (`closed`), `mode: calmo`.
- Fundo void escuro; sussurro “Operação sob controle”.
- Várias viagens como áreas discretas (opacidade baixa, sem protagonismo).
- Bloco editorial de Foco **oculto** em Calmo (CSS + render).
- Nenhuma viagem exige ação dominante.

---

## 5. Ambiente

- Escala/opacidade/densidade mudam (viagens tensas ou vivas mais presentes).
- Exemplos: pronta para sair, em rota, fechamento pendente, dados incompletos, offline.
- Continua na **mesma superfície** do organismo.

---

## 6. Foco

- Uma viagem ganha `area-foco` (borda-esquerda + gradiente radial suave).
- Hierarquia: **VIAGEM id** → situação → consequência → evidências → ação dominante → secundárias.
- Exemplo de bloqueio de volumes: “Saída bloqueada” / “não pode ser liberada…” / “Esperados 3 · Conferidos 2” / “Revisar volumes”.
- Periféricas permanecem legíveis.
- **Não** abre página nova; **não** painel admin separado.

---

## 7. Mobile — Próximo passo

Redesenhado com gramática V3.3:

- Cabeçalho mono + estado técnico de conexão (pip + texto)
- Eyebrow, id da viagem, título Spectral, apoio, estágios essenciais, fatos
- Ação dominante full-width; secundárias discretas
- Informação acima da dobra; toque ≥44–52px
- **Não** mini-dashboard; **não** formulário genérico

---

## 8. Estados técnicos

| Estado | Forma + texto |
|---|---|
| Online | Pip verde + “Conectado” |
| Offline | Pip tracejado cinza + “Offline” (sem culpa) |
| Instável | Pip âmbar + “Instável” |
| Sincronizando | Pip em pulso + “Sincronizando” |
| Dados pendentes na área | Borda esquerda tracejada + sit `tech` |

---

## 9. Cenários

20 cenários preservados no seletor **Demo** (fora do produto).

Default produto: **Calmo**.

---

## 10. Limitações

- Protótipo estático (HTML/CSS/JS); sem backend.
- Estágios LOJA/SAÍDA/RUA/RETORNO/FECHAMENTO são modelo editorial, não GIS.
- Mapa de apoio permanece opcional e honesto (“localização opcional”).
- Lab `prototipos/entregas-direcoes` não é a identidade oficial.
- Não é produção; não há push/deploy nesta missão.

---

## 11. Gates (auto-checagem)

| Gate | Status alvo |
|---|---|
| Sem fios ondulados | Removidos (sem SVG path de trajetória) |
| Sem cards SaaS | Áreas com presença lateral, sem caixa branca |
| Sem menu lateral | Ausente |
| Sem dashboard / frota | Organismo de consciência |
| Foco na mesma superfície | Sim |
| Contexto periférico | Sim |
| Identidade ≠ só cor | Tipo + forma + hierarquia + motion V3.3 |
| Mobile ≠ formulário | Próximo passo editorial |
| Lembra V3.3 | Campo escuro + Spectral/Hanken/Mono + pílula |
