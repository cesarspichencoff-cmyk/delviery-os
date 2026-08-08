# Correção pós-homologação humana 01

Data da prova: 2026-08-08

Branch: `feature/hospitality-intelligence-final-v1`

Base: `76e605890430c7582586e2baef25833c86a6b723`

## Causa

- O turno era classificado como uma decisão única e a pergunta final de harmonização dominava fatos e perguntas anteriores.
- Preferências novas atualizavam o Hospitality Context, mas não participavam materialmente da orientação publicada.
- Textos de auditoria do recomendador eram reutilizados como fala ao cliente.
- Expressões de primeira visita não entravam na Journey real de descoberta do cardápio.
- A recomendação expunha nomes, mas não explicava diferenças comprovadas nem incertezas úteis.

## Correção mínima

- Análise determinística do turno em ato social, objetivo, fatos, preferências, perguntas e referências.
- Replanejamento por preferência com preservação do contexto anterior e incerteza explícita.
- Razões, trade-offs, perguntas respondíveis e referência não resolvida adicionados ao envelope aprovado; Gemma continua somente Writer.
- Primeira visita roteada para descoberta gradual, inclusive por paráfrases.
- Gate contra linguagem interna e compositor de apoio à decisão limitado aos fatos autorizados.

## Antes e depois

| Caso | Antes rejeitado | Depois na rota real |
|---|---|---|
| Turno composto | “Ainda não há uma harmonização aprovada para a opção selecionada.” | Absorveu iFood, salmão, preferência por leve, aversão a cream cheese e duas pessoas; apresentou duas opções e preços, declarou as incertezas de leveza, composição, referência e harmonização e fez uma pergunta útil. |
| Preferência por leve | Repetiu os mesmos candidatos e linguagem de “fonte pública”/“critérios confirmados”. | Declarou que leveza não é comprovada, distinguiu os itens com fritura conhecida e ofereceu afunilar por preparo. |
| Evitar cream cheese | Não alterou materialmente a resposta anterior. | Preservou salmão e leveza, incorporou a aversão, não presumiu ausência e ofereceu buscar composição mais detalhada. |
| Primeira visita | A evidência humana registrou fallback genérico; a reprodução local anterior caiu em saudação sem jornada. | Acolheu sem exigir nomenclatura e iniciou uma escolha gradual entre algo familiar/cozido e peixe cru. |

## Challenger

Os controles cobrem primeira visita indecisa, turno com mais de seis informações,
mudança e negação de preferência, referências ordinal válida e inválida,
perguntas mistas, alergia, iFood, troca para salão e atributos não comprovados.
Nenhum caso pode inventar fato, expor mecanismo ou usar fallback genérico.

## Prova

- Foco pós-homologação: 20/20.
- Conversation: 725/725.
- Catálogo sintético: 200/200; hash `9f470846ae0d0c0a96f821288732738cedc53057edaac8429b4aa19d56613b20`.
- Privacidade: aprovada, zero achado e controle positivo detectado.
- Conference Brain: aprovado; Live: 243/243; Capacidade: 43/43; Copiloto: 53/53; cardápio: 199 itens; fonte histórica: aprovada.
- Playwright: 12/12, incluindo os quatro fluxos pós-homologação pela interface.
- Rota real `http://127.0.0.1:4179`: quatro casos repetidos; diagnóstico oculto; drivers reais desligados; Gemma 4 E4B disponível como Writer e fallback determinístico soberano quando sua saída não passa no gate.

## Genoma

| Falha | Imunidade permanente |
|---|---|
| `compound_turn_collapsed_to_last_subintent` | análise estrutural antes do plano e golden com paráfrase |
| `preference_delta_not_replanning` | resposta e contexto precisam mudar quando o delta é material |
| `internal_truth_language_leak` | gate pós-composição e contrato do Writer |
| `first_visit_hospitality_fallback` | hints de Journey e golden de oito famílias de frase |
| `recommendation_without_decision_support` | razões, trade-offs, incertezas e próxima pergunta no plano aprovado |

## Estado

Nenhuma troca de modelo, integração, custo externo, push, merge ou deploy ocorreu.
Produção e os demais módulos do DeliveryOS permanecem fora do escopo. A próxima
autoridade é a nova avaliação humana de César pelo painel local.
