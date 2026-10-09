# Evidências — Entregas, "a rua, lida agora" (2026-10-09)

Capturas do Product System servidas pelo **servidor real** (`tools/product_system_server.ts`) em
Chromium 141.0.7390.37 (`/opt/pw-browsers/chromium`), `reducedMotion: reduce`, escala 1, com as fontes
canônicas (Spectral, Hanken Grotesk, IBM Plex Mono) carregadas do Google Fonts — medido: respostas 200 e
`document.fonts.check` verdadeiro para as três. **Todo fato
nas telas é `simulated`** — banco PostgreSQL 16 local e descartável; nada aqui aconteceu na rua, e as
telas dizem isso (selos SIMULADO / PARCIAL / SOMENTE DEMONSTRAÇÃO). Imagens reduzidas a 256 cores para
caber no repositório; as `-inteira-50` estão a 50 % da largura.

| arquivo | estado | como foi produzida |
|---|---|---|
| `antes-desktop-dobra.png` · `antes-celular-dobra.png` · `antes-desktop-inteira-50.png` | **antes** — HEAD `2782b31` | servidor com `DELIVERYOS_DATABASE_URL` num banco semeado com 7 aparelhos e 5 viagens (`simulated`); `#/entregas`; 1440×900 e 390×844 |
| `depois-desktop-dobra.png` · `depois-desktop-inteira-50.png` | **depois**, todas as unidades | `tests/product/run-entregas-servidor-pg-tests.ts --evidencias` (S5): banco isolado criado, migrado, semeado com o cenário de `tests/product/entregas-fixture.ts`, apagado no fim |
| `depois-celular-dobra-itaim.png` | **depois**, `#/entregas?unidade=ITAIM` | idem, 390×844 |
| `depois-sem-banco-desktop-dobra.png` · `depois-sem-banco-celular-dobra.png` | **depois**, servidor sem banco | `tests/product/run-entregas-browser-tests.ts --evidencias` (N1b): estado técnico com linha interrompida, demonstração aberta depois dele |
| `depois-leitura-envelhecida-celular-dobra.png` | **depois**, a mesma leitura 6 min mais tarde | idem (N4): relógio do Playwright avançado 6 min; linha de sinal pontilhada e "Esta leitura nao e a mais recente" |
| `depois-moldura-desktop-dobra.png` · `depois-moldura-celular-dobra-itaim.png` | **3ª iteração** (`5dfdb4a`): a moldura segue a leitura — faixa "DEMONSTRACAO + LEITURA DO SERVIDOR", "UNIDADE DA LEITURA", selo SIMULADO; sem o seletor da demonstração | `run-entregas-servidor-pg-tests.ts --evidencias` (S5, que agora também ASSERTA a moldura), 1440×900 e 390×844 |
| `a11y-home-barra-celular-antes-depois.png` | **acessibilidade** (`5862d9d`): a barra inferior do celular na Home, base `2782b31` à esquerda (2,13–2,55:1) e depois à direita | servidor real sem banco, 390×844, faixa inferior recortada e ampliada 2× |

As `depois-*` sem `moldura` são da 2ª iteração e mostram, de propósito, a moldura que ainda dizia
"SOMENTE DEMONSTRACAO" sobre a leitura (L60); ficam como registro do antes da 3ª.

O cenário do "antes" e o do "depois" não são byte a byte o mesmo banco (o do antes não tinha os
aparelhos `dev-h`/viagens `T-301`, `T-302`, `T-104`); o que se compara é a **tela**, não os números.

Nenhum teste grava nesta pasta: as suítes escrevem capturas só em diretório pedido por `--evidencias`
(no CI, `$RUNNER_TEMP`). Substituir estas imagens é ato explícito, com commit próprio.
