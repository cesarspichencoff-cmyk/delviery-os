# TATÁ Comandas — G1 legado: diagnóstico de regressão, requisito superado

> **REORIENTAÇÃO CANÔNICA — 26/10/2026.** Esta auditoria foi escrita antes da recuperação do requisito humano V8.43 (20/10): César confirmou que os horários já constam na comanda e rejeitou aprovação diária e nova tabela de turnos. V8.48 desconfirmou a hipótese de pares de impressoras 00009/00003 e 00006/00004 como alternativas selecionadas por LUNCH/DINNER. Portanto, os testes abaixo são diagnóstico de um contrato legado, NÃO requisito do produto, nem prova de roteamento correto. Sua inclusão adicional em CI foi revertida; a proteção corrente de identidade, origens, destinos duais ambíguos e impressão sem autorização continua preservada. **Não construir um novo autorizador de turno para resolver o Comandas.**

**Data:** 2026-10-26. **Estado:** OFFLINE_TEST_PASS / REVIEW_ONLY / DRAFT / HOLD.

## Diagnóstico verificável
O leitor instalado exige `valid_from_local`, mas o escritor legado `set_production_service_state_v1.ps1` não o produz. O estado operacional observado em 26/10 continuava em 14/10 (LUNCH); 200/200 decisões shadow amostradas tinham bloqueio de validade e data. Não alterar apenas a data para esconder a incompatibilidade.

O teste versionado `tools/verificar_production_service_matrix_v1.js` também estava incorreto: a fixture `validState` não tinha `valid_from_local`, porém esperava `ready === true`. Em worktree isolado no Foxxy, o teste falhou exatamente nessa afirmação antes da correção.

## Delta aplicado nesta branch
- Fixture de turno válido agora declara explicitamente o início da janela.
- Oito negativos: falta de início (escritor legado), antes do início, fim exclusivo, pedido de outro dia, origem ausente, inferência de relógio, outra loja e janela invertida.
- Limite inicial inclusivo é afirmado positivamente.
- Teste passa a rodar no workflow Linux e Windows da candidata em `npm run verificar:production-service-matrix`.
- Nenhum arquivo, configuração, serviço, dado, impressora, spooler, fiscal ou SQL do caixa foi alterado.

## Evidência local isolada
- Matrix: PASS (463 produtos, 106 rotas alternativas de turno; contrato 2 positivos/8 negativos).
- Revisão humana V7.0: 47/47; janelas V7.4: 16/16.
- Escritor preview V8.12: 20/20.
- Par supervisor V8.15: 23/23.
- Política de custódia V8.32: 47/47.
- Ponte Academia V6.3: 13/13.
- Identidade de pedido V7.27: 12/12.
- Cadeia V7.22: tentativa REJEITADA pela proteção de ambiente, que requer Linux isolado ou Windows descartável de CI. Não contar como teste aprovado neste host.
- A publicação nesta branch não equivale a um novo sucesso da CI hospedada nem a instalação.

## Pendências materiais
G1 não fecha até existir um escritor independente, autorizado e auditável com `valid_from_local`/fim exclusivos, sem o principal leitor poder falsificar a aprovação; reconciliação de histórico/ACL ainda pendente. G2 permanece UNKNOWN para 14 códigos da amostra sem identidade comprovada. G3 exige replays completos de montagens humanas e negativos. G4 exige CI hospedada na revisão exata e primeira passagem real isolada. G5–G7 exigem provas independentes e, mais adiante, autorização humana específica para efeitos físicos.

**Proteção:** PR #107 permanece DRAFT/HOLD; não mesclar, instalar, reiniciar serviços, alterar turno/SQL/ACL, imprimir ou emitir fiscal sem autorização específica.