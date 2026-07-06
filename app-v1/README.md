# Interface V1 (interna, descartável)

Primeira superfície mobile da V1 — prova a tese visual mínima do
`docs/Contrato_Estado_Cognitivo_V1.md`: Calmo existe, Ambiente existe, Foco aparece quando vale
gastar atenção, com ação dominante segura ou **foco puro com dignidade**. Se precisar ser
reconstruída depois da validação, isso é sucesso, não fracasso.

## Como rodar

```bash
node tools/gerar_janela_v1.js   # 1) prepara a janela real 01/07 (uma vez; sai em data/generated/, fora do Git)
node tools/servir_v1.js        # 2) serve em http://localhost:5179/  (no celular: IP da máquina na mesma rede)
```

Abrir no navegador do celular ou desktop. Os controles no rodapé são do **replay de demonstração**
(janela histórica real) — não fazem parte do produto operacional.

## Regras que esta superfície obedece (e que qualquer sucessora deve obedecer)

- Cérebro real, sem cópia: carrega `src/perfil-delivery/motor.js` + `decisao.js` por `<script>`.
- `DECISAO.decidir(R, INFO, { fonteReal: true, active: sess.active })` — **sempre com `active`**.
- `rec === null` → foco puro (`buildFoco()`), sem bloco de ação e sem pedir desculpa.
- Só composição real (janela 01/07: 238 pedidos, 744 itens, 100% casados com o seed).
- Observação do cliente aparece **completa** (vinda de `INFO`, fonte primária), com aviso
  "conferir na comanda" — nunca truncamento silencioso (defeito E2 do contrato, neutralizado na
  superfície sem tocar o motor).
- Markup `<b>` dos textos do motor é removido (E4) — tudo renderiza como texto puro.
- Sem dashboard, sem lista, sem KPI, sem segundo foco, sem ação em Ambiente.

## Limitações declaradas

- Replay de janela histórica — não é operação ao vivo (não existe fonte contínua do iFood ainda).
- IDs exibidos são fatias de UUID (E5): o ID curto se repete nesta janela de 24h+, então o motor usa
  o identificador não-ambíguo. Exibição amigável de ID é decisão futura de superfície.
- O protótipo antigo (`prototipos/parados-agora/`) contém lógica anterior à correção Motor × Decisão
  e **não** deve ser usado como demo da V1.
