# Copiloto Delivery V3.3 — Referência canônica congelada

## Identidade

| Campo | Valor |
|---|---|
| Nome da versão | **Copiloto Delivery V3.3** |
| Status | **DESIGN APROVADO E CONGELADO** |
| Arquivo canônico | `DeliveryOS Organismo Operacional.dc.html` |
| Worktree de implementação | `C:\Users\italo\Desktop\Claude\deliveryos-copiloto-v33-implementation` |
| Branch | `feature/copiloto-v33-implementation` |

## Origem imutável

| Campo | Valor |
|---|---|
| Origem absoluta (ZIP) | `C:\Users\italo\Downloads\Sprint Visual DeliveryOS V2 (1).zip` |
| SHA-256 do ZIP | `2755573BBE624F4CE0DBA992D006E6E5B8E2B6DEA87B7D6A2050E55FD9834101` |
| Arquivo interno | `DeliveryOS Organismo Operacional.dc.html` |
| SHA-256 do HTML | `434294036F86FF6976B48FB3EC4B58D5C4CECEFE272FEEA181E9A167E7B19FBC` |
| Tamanho do HTML | `104769` bytes |
| Data do ZIP (mtime) | `2026-07-18 18:10:00` |
| Data da entry no ZIP | `2026-07-18 21:09:58` |

Esta é a **única** referência visual autorizada para a implementação do V3.3.

Não usar: PDF anterior, pacotes `camada0`, outras cópias com nome parecido, protótipo visual V1 (`app-v1` como design), protótipo `parados-agora`, reconstrução manual ou “de memória”.

## Proibição de redesenho

- O HTML congelado neste diretório **não pode ser editado**.
- Qualquer divergência visual na implementação deve ser resolvida **voltando a esta referência**, não inventando uma nova linguagem.
- `app-v1` é a **aplicação técnica atual** (motor + D4A), não o design-alvo.
- Renomear superfícies, trocar hierarquia, virar dashboard/cards/feed, ou “melhorar” o organismo sem reaprovação do design = **regressão**.

## Partes simuladas (honestidade)

No design e nesta fase de preparação, os seguintes elementos são **demonstrativos**:

- Números de previsão e faixas de volume (ex.: 4 a 6 pedidos / 10 a 15 min).
- Textos de status de ação (ex.: “Kenji assumiu os Quentes”).
- Catálogo de cenários de apresentação / QA (não é navegação real do produto).
- Estados de voz e fechamento com dados de demo.
- Limiares e confianças de demonstração — limiares reais pertencem ao motor / pacote de inteligência.

**Proibido:** marcar dados simulados como “ao vivo” sem fonte real conectada e validada.

## Observação sobre “Ambiente”

A palavra literal **“Ambiente”** **não** precisa existir no produto.

Validar o **comportamento**: clima operacional na mesma superfície que o Foco, com atenção dominante e contexto periférico — não a presença textual do termo.

## Princípios que não podem regredir

1. **Produto abre em Calmo** — saúde operacional é o default, não o alerta.
2. **Ambiente e Foco na mesma superfície** — sem navegação por páginas entre modos.
3. **Uma atenção dominante** — um Foco soberano; periférico não compete.
4. **Contexto periférico preservado** — organismo / áreas continuam legíveis sem virar dashboard.
5. **Previsão não é certeza** — copy do tipo “se nada mudar”, “estimativa, não certeza”.
6. **Gravidade e confiança permanecem separadas** — cor/peso ≠ bolinhas de confiança.
7. **Voz não vira chatbot** — intenção operacional curta, não conversa.
8. **Ação acompanhada não vira wizard** — estados de acompanhamento, não passos de formulário.
9. **Fechamento não vira formulário** — perguntas mínimas; “Não sei” / “Pular” são dignos.
10. **Estados técnicos: texto + forma, nunca só cor**.
11. **Cenários de apresentação = catálogo de QA**, não navegação real do gestor.
12. **Progressive disclosure** quando o Foco ficar pesado.

## Riscos proibidos (implementação)

- Transformar o organismo em dashboard.
- Converter áreas em cards de ERP.
- Criar feed de alertas.
- Mostrar oito fases ao mesmo tempo.
- Criar wizard de ação.
- Abrir voz em modal de chat.
- Criar chatbot.
- Colocar previsão sempre expandida.
- Usar o deck de apresentação como produto.
- Marcar dados simulados como ao vivo.
- Perder estados técnicos.
- Criar navegação por páginas para Calmo / Ambiente / Foco.

## Verificação pós-cópia (congelamento)

| Check | Resultado |
|---|---|
| SHA-256 HTML copiado | `434294036F86FF6976B48FB3EC4B58D5C4CECEFE272FEEA181E9A167E7B19FBC` |
| Tamanho | `104769` |
| ZIP original alterado | **NÃO** |
| HTML congelado editável nesta fase | **NÃO** |
