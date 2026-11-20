# Copiloto Itaim · rodada de 20/11/2026 (jantar cheio)

Base: `7da95e02` mais os dois patches do pacote, com SHA-256 conferidos (`d8b384de…` e `a9a19aa8…`). Essa
base é idêntica, byte a byte (sem CR), aos 9 arquivos que o caixa serve na porta 5297 (pasta de execução
de 20/11, 06:58). Branch de trabalho: `copiloto-itaim-operacao`, local.

## O que mudou para quem está no turno

- **Agora responde três perguntas, nesta ordem, acima do mapa.**
  - **Onde agir agora.** Cada ação diz o que aconteceu, a evidência, quem age, até quando e o que a
    encerra. As ações seguem esta ordem:
    1. pedidos já vencidos, por maior atraso e depois por mais unidades;
    2. entregador esperando na loja;
    3. aceite pendente;
    4. prazo nos próximos 5 min;
    5. pronto parado;
    6. montagem;
    7. dados a conferir.

    A ação diz ainda o que ela destrava. Exemplo: "041 só depende de Enrolados" e "007 também espera
    Cozinha (1 × Guioza)".
  - **Quem precisa agir.** Só quem tem trabalho nesta leitura: praças, Caixa, Conferência e Expedição.
  - **O que pode apertar nos próximos 15 min.** Mostra três coisas:
    - os itens que vencem, por praça;
    - o plano V77 da faixa, em itens dos dois canais e **sem desvio calculado**, porque o plano soma
      salão e delivery;
    - o ritmo do iFood.
- **Enrolados, Duplas e Combinados viram toques próprios no mapa.** A praça mostra primeiro os itens em
  pedidos atrasados, por exemplo "5 × Uramaki de Salmão em 2 pedidos atrasados · pior 12 min", e depois o
  que vence em 15 min. O produto lista quantidade e cliente ("2 para Ana", sem supor gênero), a
  observação na própria linha, a sequência Teknisa, o número do iFood e o link da comanda. Sushi Quentes
  e Cozinha seguem o mesmo formato.
- **Expedição** (Entregas): prontos aguardando saída, com entregador na loja primeiro e minutos desde o
  pronto (`READY_TO_PICKUP`, sem dado do entregador).
- **Sacolas** (Conferência): a identidade completa, o conteúdo de cada sacola e o motivo, com os prontos
  primeiro.
- **Fonte parada** suspende as ações e diz desde quando. Os dados incompletos aparecem como lista (sem
  sequência, sem nome, praça ou observação a conferir); a falta nunca vira zero.

## As nove consultas no menu de sete

| Consulta (id na URL) | Grupo no menu |
|---|---|
| Mapa e foco (`mapa`) | **Agora** |
| — nova (`pracas`) | **Praças** |
| Mais atrasados (`atrasos`), Produção por pedido (`producao`), Combinações por praça (`composicao`) | **Pedidos** (abas) |
| Duas ou mais sacolas (`sacolas`), Fila e conferência (`fila`) | **Conferência** (abas) |
| Previsão do turno (`previsao`) | **Previsão** |
| Entregas na rua (`rua`), agora com a Expedição no topo | **Entregas** |
| Fontes e diagnóstico (`fontes`) | **Fontes** |

Os links antigos continuam abrindo dentro do grupo certo.

## Defeitos achados e corrigidos

1. **A leitura do Gestor podia ficar "velha" em pleno turno.** O instante da requisição é anterior à
   leitura dos arquivos. Uma gravação do Gestor no meio dela deixava a idade negativa (medido: −4 ms), e
   a regra apagava praças e produtos por 10 s. O teste G23 falhava na própria revisão servida.

   Correção: até 2 min "no futuro" conta como idade zero; além disso continua sendo relógio errado.
2. **Títulos e links quase invisíveis no tema escuro.** O título da ação estava em 2,2:1. Agora o
   mínimo medido é 9,3:1.
3. **A falha de atualização não dizia a hora dos últimos dados válidos.** Agora diz.

## Prova

| Requisito | Teste | Estado |
|---|---|---|
| Enrolados: 5 Uramakis em 2 pedidos atrasados, Ana (2, sem cebolinha) antes de Rui (3) | turno: "tocar em Enrolados…" | simulação OK |
| Lia (007, #4108) vence às 19:09, fora dos atrasados; 007 da Ana não se mistura | turno: "Sushi Quentes e Cozinha…" | simulação OK |
| Ação com as seis perguntas, desempate explicado, "destrava" | turno: "Agora responde…", "ordem das ações…" | simulação OK |
| Dois problemas e a resolução de um | turno: "dois problemas…" | simulação OK |
| Fonte parada e reconexão; dado incompleto dito | turno: "fonte parada…", "dados incompletos…" | simulação OK |
| Expedição e sacolas | turno: "expedição…", "sacolas…" | simulação OK |
| Cada garantia nova tem teste | `tools/mutantes-copiloto-turno.cjs` | 8/8 mortos |
| Gravação durante a leitura não apaga as praças | Gestor G23 e G25; mutantes do Gestor | 31/31 e 9/9 |
| Sem regressão | Home e sinais 51/51 · visual 27/27 · governança | verde |
| 320/390/1280 px, contraste, alvos de 44 px | prévia no navegador | 0 px de rolagem horizontal · mínimo 9,3:1 · nenhum alvo < 44 px |

Para repetir:

```bash
node tests/copiloto-turno/run-turno-tests.mjs
```

```bash
node tools/mutantes-copiloto-turno.cjs .
```

Para gerar a prévia com o caso fictício:

```bash
node tests/copiloto-turno/gerar-vitrine.mjs <saida.html>
```

## O que ainda depende do turno (não provado)

- Uso no jantar real: se a primeira ação levou à praça certa e se a observação foi conferida.
- Safari físico; movimento reduzido no aparelho (a prévia não emula `prefers-reduced-motion`).
- Pedido alterado com a ficha aberta: a ficha mostra o estado atual, mas ainda não destaca o que mudou.
- Oscilação no limite de 5 min: os limiares são fixos, sem histerese.
- Capacidade por praça: sem evento de produção, o Copiloto não afirma atraso de praça.
- Aceite da equipe.
