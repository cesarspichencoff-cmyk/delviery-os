# Laboratório de direções visuais — Entregas

| Campo | Valor |
|---|---|
| Pasta | `prototipos/entregas-direcoes/` |
| Referência | `deliveryos-fable/app-v1` (somente leitura) |
| Protótipo oficial | `entregas-v01` **não** alterado |

## Caminhos

| Opção | Caminho |
|---|---|
| Comparador | `prototipos/entregas-direcoes/index.html` |
| A | `prototipos/entregas-direcoes/opcao-a/index.html` |
| B | `prototipos/entregas-direcoes/opcao-b/index.html` |
| C | `prototipos/entregas-direcoes/opcao-c/index.html` |
| Tokens | `prototipos/entregas-direcoes/shared/tokens.css` |

## Opção A — Transplante direto DeliveryOS

**Princípio:** Reutilizar a estrutura mental e formal de Ambiente (presenças com cor de significado) e Foco (eco · cartão soberano · contexto · pílula), com conteúdo de Entregas.

| | |
|---|---|
| **Vantagens** | Máxima fidelidade ao V1 aprovado; hierarquia já validada; Foco com profundidade; mobile próximo do app-v1 |
| **Riscos** | Ambiente com painéis pode relembrar “cards” se mal lido; menos “espacial” |
| **Fidelidade DeliveryOS** | **Mais alta** |
| **Originalidade** | Média (adaptação, não invenção) |
| **Implementação** | Mais fácil — padrões já existem no CSS do V1 |

## Opção B — Expedição editorial

**Princípio:** Tipografia dominante, lista de viagens como linhas editoriais (sem caixas), Foco assimétrico com evidências em filete.

| | |
|---|---|
| **Vantagens** | Premium, legível em 5s, pouco chrome, fácil escanear estados |
| **Riscos** | Pode parecer lista/relatório se o Foco não carregar peso visual; menos “organismo” |
| **Fidelidade DeliveryOS** | Alta (tom, tipo, pílula, cores) |
| **Originalidade** | **Alta** para expedição |
| **Implementação** | Fácil/média |

## Opção C — Campo topográfico

**Princípio:** Loja como âncora; viagens por posição, escala e pulso; Foco como centro de atenção com satélites.

| | |
|---|---|
| **Vantagens** | Espacial sem fios ondulados; metáfora de campo vivo; bom para “várias viagens” |
| **Riscos** | Pode parecer diagrama se mal calibrado; acessibilidade de posição em telas estreitas |
| **Fidelidade DeliveryOS** | Média-alta (anel/pulso da loja, cores, pílula) |
| **Originalidade** | **Mais original** |
| **Implementação** | Média (layout posicional) |

## Recomendação

| Critério | Escolha |
|---|---|
| Mais fiel ao DeliveryOS | **A** |
| Mais original | **C** |
| Melhor equilíbrio para decisão | **A** como base de produto; **B** se a mesa precisar de leitura em lista densa; **C** se o time quiser ousadia espacial controlada |

## Como executar

Abrir `prototipos/entregas-direcoes/index.html` no navegador e escolher A, B ou C. Em cada opção, usar o seletor de momentos (Ambiente / Foco / Bloqueio / Fechamento / Mobile).
