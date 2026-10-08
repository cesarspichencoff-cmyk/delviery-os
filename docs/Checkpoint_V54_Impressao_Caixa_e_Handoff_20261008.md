# Checkpoint verificável — qualidade térmica da CAIXA V5.4

Data: 08/10/2026. Estado: **COMPARATIVO OFFLINE APROVADO EM TESTE; SEGUNDA IMPRESSÃO NÃO EXECUTADA**.

## Fonte atual e antirretrabalho

Repositório `cesarspichencoff-cmyk/delviery-os`; branch `feat/thermal-v54-caixa-photo-visual-qa-20261008`; base direta `feat/thermal-quality-v51-epson-official-fontqa-20261008` (PR #20); revisão V5.4 no **PR #21**. Não criar novo PR concorrente nem reimplementar o renderer.

VÉRTICE revalidado em `cesarspichencoff-cmyk/vertice-runtime.`, branch `vertice-active`, entrada `VERTICE_ENTRY.md`.

## Verdade operacional e autorização

- César confirmou expressamente que **todos os testes de papel são exclusivamente na impressora CAIXA do TATÁ Itaim**. A identidade física do computador nomeado CAIXA_MOOCA foi confirmada pelo responsável.
- Primeiro teste V5.3: trabalho RAW **233**, 424 bytes, SHA-256 `8f6b02ea56f2daf6261fa6a5ce45d533ea68fa3e83d4344ad4fd860254dc1249`. Windows PrintService evento 307 e fotografia fornecida pelo responsável. Proven: folha visível com todos os produtos, quantidades, acentos e número 999 completos. Não confundir com prova de densidade física ideal.
- Foto da folha real V5.3: letras altas e relativamente estreitas, traços finos percebidos na iluminação/perspectiva da imagem, Font B compacta. Origem real dos traços cinzas é indeterminada; não aumentar densidade nem trocar papel/driver por dedução.
- Proposta V5.4: **apenas comparação** da fonte A altura 2x atual vs. largura+altura 2x em nomes curtos, observações em negrito vs. normal, termos longos em Font B, sequência `998`; sem pedidos reais.
- Comando offline: `npm run verificar:comparativo-caixa-v54`; testes **10/10 PASS**; `node tools/gerar_comparativo_legibilidade_caixa_v54.js` gera somente arquivos locais .escpos/.txt/.svg e manifesto.
- Comparativo V5.4 esperado: **608 bytes**, SHA-256 `99c888ba3d731003cd5f8c10b94332c5317c55f26c991ef521537b8bebe25c71`; linha mais larga registrada em **432/576 dots** na geometria nominal.
- César autorizou a segunda folha ao responder **“Sim”**. Entretanto a ferramenta de transferência/ação foi **bloqueada pelas configurações de segurança do serviço**, impedindo o envio. Não é falta de autorização humana. Não contornar a restrição com outro canal, codificação ou comando alternativo.
- O histórico atual do Windows da fila CAIXA não contém evidência de impressão de **608 bytes**. Um trabalho posterior de **1660 bytes** não prova a folha V5.4, cuja identidade é outra. **SEGUNDA IMPRESSÃO: NÃO EXECUTADA/SEM PROVA**.
- Na verificação somente leitura mais recente, `CAIXA` estava **Normal**, com **zero jobs pendentes**, porta USB `ESDPRT001`. Nenhuma alteração foi feita nas filas.

## Limites que não podem ser promovidos a resultado

`DIGITAL_TEST_PASS` é diferente de `RAW_PRINT_SUBMITTED`, `PAPER_VISIBLE`, `PHYSICAL_OPTICAL_ACCEPTED` e `ALL_SECTORS_PROVEN`. Somente o primeiro está demonstrado para a amostra V5.4. O primeiro teste V5.3 comprovou papel visível, mas não foi 10/10.

Amostras da outra impressora ou de outra unidade jamais substituem a CAIXA. Não há autorização para mudar densidade, cortar papel por comando, alterar drivers, instalar serviço ou ativar impressão automática.

## Próxima ação de maior valor

Aguardar uma forma de execução autorizada pelo ambiente para **uma única impressão da amostra V5.4 exclusivamente na CAIXA**, respeitando a política vigente; caso contrário, manter a amostra offline. Não repetir a primeira folha ou remeter o arquivo por um canal improvisado. Após papel V5.4 visível, comparar fisicamente proporção, espessura, legibilidade das observações e fontes em ambiente escuro e aprovar ou rejeitar cada mudança. A aprovação final da V5.4 não pode ser fabricada antes dessa foto.

## Rastreabilidade e transferência à outra conversa

Consultar PRs **#16, #17, #18, #19, #20, #21** nesta ordem lógica; o trabalho mais recente está no PR #21. Na outra branch, fazer comparação de HEAD/merge-base/diff, incorporar somente o delta ausente e preservar testes. Não tocar em produção ao aplicar estes rascunhos.

**Fronteira:** lógica e qualidade digital com regressões aprovadas; prova física comparativa e qualidade em todos os setores ainda pendentes.

## Continuação V5.5 — estudo conservador de proporção sem impressão

Nova auditoria estática de 199 itens HISTÓRICOS (não representa cardápio vivo), quantidade 1 e 12: **115/107** nomes cabem em Font A largura+altura 2x; com reserva NOMINAL de 48 dots à direita, ficam **98/92** nomes. Outros **78/86** continuam Font A altura 2x sem duplicar largura, e **6/6** exigem Font B compacta. Nenhum dos 199 nomes foi truncado; nenhuma alteração de fonte operacional foi aplicada. A largura real da Epson TM-T20X não foi fisicamente medida por essa análise.

Código e provas: `tools/auditar_cobertura_tipografica_v55.js`, `tools/verificar_cobertura_tipografica_v55.js`, `docs/evidence/thermal_typography_coverage_v55_20261008.json` e `.md`. Estudo V5.5 permanece OFFLINE: não autoriza papel, densidade, driver, impressão de pedido ou mudança produtiva. O bloqueio de segurança no envio da amostra V5.4 permanece; não o contornar.`n