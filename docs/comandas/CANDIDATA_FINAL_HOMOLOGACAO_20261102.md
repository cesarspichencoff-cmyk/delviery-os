# TATÁ Comandas — candidata final de homologação (02/11/2026)

**PR #135, branch `audit/comandas-native-chain-20261102`. DRAFT, sem merge.**

**AVISO DE SEGURANÇA, 04/11/2026 — PILOTO EM HOST SUSPENSO, SEM AUTORIZAÇÃO.** O item 1 abaixo ("piloto em sombra numa pasta nova do caixa") é **plano histórico**, não receita executável nem autorização vigente. Auditoria do blob Git `8e75fea85437d063c2f6ee2df09ee33962d42ce6` de `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs` encontrou: (a) tentativa de ler estado em caminho **absoluto operacional** `C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json` quando presente (linhas 535–553); (b) capacidade de gravar JSON por `writeAtomicJson` se houver `outPath` (linhas 138–145, 594); (c) saída JSON integral em `stdout` (linhas 555–595), potencialmente com observações de pedidos e PII. O manifesto `CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json` **já declara `file_write` para esse consumidor**, portanto dizer "34 arquivos sem qualquer efeito de arquivo" seria falso.

**GATE ADICIONAL OBRIGATÓRIO ANTES DE PILOTO:** separar a execução de consumo de dados reais da execução sintética; proibir leitura de `ProgramData`/estado do Reader por candidato ou teste; proibir qualquer gravação fora de destino novo, isolado e expressamente aprovado; sanitizar `stdout` e logs antes de expor evento de cliente; assegurar que não haja SQL adicional, serviço, spooler, sequência ou impressão; exigir revisão de integridade do manifesto após qualquer mudança e **autorização operacional nova e específica** antes de usar a máquina. Não foram feitas alterações no consumidor nem no host nesta auditoria. **SOMENTE CI/offline com dados fictícios permanece permitido.** O item 1 e qualquer etapa posterior continuam `HOLD`, independentemente de CI verde.

 A unidade de homologação é o
manifesto `docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json`: **26 arquivos de código + 8 de
dados**, identidade byte a byte (blob git), todos `-text`, sem processo filho, rede, SQL, spooler ou impressão.

## O que está comprovado (software isolado)

| Requisito do contrato | Prova | Portão |
|---|---|---|
| Revisão real 9627 → 3 vias (COZINHA, DELIVERY SUSHI 1, CONFERÊNCIA) | consumidor V7.14 e motor pinados; replay com o catálogo real da Academia | cadeia 25/25; replay privado |
| Revisão real 9092 (23:02) fecha | jantar pela hora nativa; combinado por equivalência de catálogo; kits pela regra do César (`pr135#issuecomment-6582963189`) | cadeia, testes 11–13 |
| Kits 2p + 2/3/4 temakis | 2 = regra do motor; 3 = Kit p/2 + Kit Simples; 4 = Kit p/2 + Kit p/1; 5, combo ×2, outro item, outro combinado = HOLD | cadeia, teste 13 (recusas unitárias) |
| Cada item só na via do seu setor; conferência com todos os produtos | soma por produto = quantidade nativa | cadeia, teste 20 |
| Observações literais, no setor e na conferência, nunca na outra via | DSOBS* e TXPRODCOMVEN; repetida sai uma vez; observação geral retida (V7.6/V7.7) | cadeia, teste 19 |
| iFood + Teknisa originais e número TATÁ como maior elemento | `iFood #… \| TEKNISA … \| hh:mm`; número 3×3 (9,0 mm) | papel virtual 12/12 |
| Desenho do Figma V4.4/V4.3 | renderizador V4.8: divisores de 72 mm entre caixas, `Op.` na coluna direita, praça 1×2 negrito, observação em negrito na produção | papel virtual; `VIAS_VS_FIGMA_MEDICAO_20261102.md` |
| Número 001 por dia, sem reinício almoço/jantar, pela chave forte | laboratório SQLite descartável, 8 processos em disputa, SIGKILL antes/depois do COMMIT, cancelado nunca reciclado | laboratório nativo 18/18 |
| Atestação do número | atestador separado (outro processo, outra chave Ed25519, razão só leitura) assina; a cadeia exige chave confiável, relógio e razão do dia reconferido | atestação 10/10 |
| Comanda nativa e NF intactas | a candidata não tem caminho de impressão; nada toca fila, spooler, fiscal ou serviço | candidata 5/5 |

## O que NÃO está comprovado

- Leitura viva no caixa Itaim (o 9627 e o 9092 são revisões arquivadas).
- Qualquer número TATÁ real: o conjunto de atestadores de produção (`data/tata_sequence_attesters_v1.json`) está
  **vazio**, e não existe escritor do razão diário de produção instalado. O escritor de laboratório recusa chaves
  reais por desenho; `COMMIT_DISABLED_NO_INDEPENDENT_AUTHORIZATION_GATE` do escritor V1 continua no lugar.
- Papel: acentos CP1252, avanço vertical, divisores e o número 3×3 só uma folha Epson confirma.
- A via COZINHA com caixa própria não tem quadro mestre equivalente (`UNKNOWN`).

## Únicas ações que dependem de autorização no Itaim

Cada uma é separada; nenhuma autoriza a seguinte.

1. **Piloto em sombra** numa pasta nova do caixa Itaim (`CAIXA_MOOCA`): copiar só os 34 arquivos do manifesto,
   conferir os blobs, ler eventos já capturados pelo watcher, devolver métricas sanitizadas. Sem serviço, fila,
   spooler, SQL, fiscal ou ACL. Desfazer = apagar a pasta.
2. **Escritor do razão diário de produção**: autorizar e revisar o escritor real (mesma transação do laboratório:
   `BEGIN IMMEDIATE`, leitura após gravação, unicidade por dia + chave forte e por dia + número), sob identidade
   própria, num arquivo de razão novo. Só então o número deixa de ser de laboratório.
3. **Provisionar o atestador**: gerar no host uma chave Ed25519 por outra identidade (nunca a do escritor);
   publicar só a chave pública em `data/tata_sequence_attesters_v1.json` com escopo `PRODUCTION_ITAIM` e a
   chave do escritor em `writer_key_ids`, por commit revisado e nova CI.
4. **Folha Epson supervisionada** das três vias de um pedido real, com aceite visual do César: acentos,
   divisores, `Op.`, número TATÁ 3×3, legibilidade, avanço e corte manual.
5. **Corte operacional**: só depois das quatro anteriores, decidir a coexistência com a impressão nativa da
   Teknisa (que hoje continua intacta) para não haver via duplicada.

## Verificação da folha (item 4)

| Ponto | Esperado (medido no papel virtual) |
|---|---|
| Largura | nada além de 72 mm; divisores ocupam os 72 mm |
| Identificação | `iFood #<id>  \|  TEKNISA <id>  \|  hh:mm` legível, iguais nas três vias |
| Praça | nome sozinho, altura dupla, negrito |
| Caixa | `Cn  CAIXA <modelo>` e, na conferência, `Op. ________` encostado à direita |
| Item | quantidade + nome numa linha, altura dupla, negrito |
| Observação | literal, sob o item; negrito na produção |
| Recursos | `Sacola: …  \|  … Kit …` e `Acomp.: …` na conferência |
| Número TATÁ | o maior elemento (9,0 mm), à direita, no fim de cada via |
| Acentos | `SIMULAÇÃO · NÃO PRODUZIR`, `CONFERÊNCIA`, `SALMÃO` sem troca de caractere |
