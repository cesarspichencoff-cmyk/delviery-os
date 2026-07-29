# Pipeline de importação de clientes

Fluxo implementado:

```text
arquivo → detecção CSV/XLSX → adapter versionado → normalização
→ deduplicação → prévia → aprovação humana → aplicação → relatório
```

Fontes reconhecidas: `neemo`, `get_in`, `tagme`, `ifood_history` e `generic`.
CSV aceita vírgula, ponto e vírgula e tabulação; XLSX usa a dependência já
travada no projeto.

Cada lote usa `source + adapter_version + file_hash` como chave idempotente.
Linhas ambíguas ficam pendentes de revisão. Um upload nunca importa
automaticamente. O rollback exige aprovação humana, registra os efeitos do
lote e declara preservação dos dados anteriores.

Arquivos reais não foram importados. Testes usam temporários sintéticos que são
removidos ao final.
