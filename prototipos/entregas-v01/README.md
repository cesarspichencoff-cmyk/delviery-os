# Entregas V0.1 — Protótipo visual interativo

Protótipo **estático** (HTML/CSS/JS). Sem build, sem dependências, sem dados reais.

## Executar

```bash
# a partir desta pasta, ou abra index.html no navegador
cd prototipos/entregas-v01
# opcional: servidor estático simples
npx --yes serve -p 5190 .
# ou
python -m http.server 5190
```

Abra `http://localhost:5190` (ou o arquivo `index.html` direto).

## Superfícies

| Toggle | Conteúdo |
|---|---|
| **Mesa de Expedição** | Desktop — filas + trajetória da viagem + detalhe |
| **Próximo Passo** | Mobile — ação dominante do entregador |

Seletor **Demo (não é produto)** no topo: 17 cenários.

## Arquivos

- `index.html` — shell
- `styles.css` — família visual (verde profundo, creme, verde vivo, âmbar, técnico)
- `app.js` — cenários e interações simuladas
- `README.md` — este arquivo

## Não faz

- Ranking, fleet map hero, GPS real, iFood live, alteração de `app-v1`
