# Copiloto do piloto — revisão de integração visual

Data: 2026-10-28. Base inspecionada: `d487c00dc8a8ddb89218113c43b3f8acbb76b6c1`.

> Revisão inicial preservada abaixo. A implementação e as capturas posteriores estão em `COPILOTO_LEITOR_VISUAL_2026-10-28.md`; elas não fecham a integração operacional da Home.

## Veredito

**O fechamento visual e operacional do Copiloto do piloto não está comprovado. Não declarar 10/10.**

Esta é uma inspeção de código e contratos, não uma auditoria visual renderizada concluída. O navegador de captura retornou `net::ERR_CONNECTION_REFUSED` ao acessar o servidor local de demonstração em `127.0.0.1:5290`. Não há screenshot atual nesta revisão. Capturas históricas não foram usadas como prova da versão atual. Nenhuma alteração ou instalação no Caixa Mooca foi realizada nesta revisão.

## Superfícies que não devem ser confundidas

| Superfície | Evidência atual | Limite da conclusão |
|---|---|---|
| Leitor `/copiloto/pedidos/` | Acesso individual, registros por comanda, quantidade e código de produto, origem, hora e estados de leitura | Interface básica de leitura; não implementa a experiência completa de investigação |
| `src/product/ui/surfaces/copiloto.js` | Propostas em sombra, evidências, limitações, histórico e cobertura das seis células | A própria implementação declara motor de pressão não conectado; não equivale a diagnóstico operacional de praça |
| Home e referências canônicas | Direção visual e temporal próprias, incluindo organismo, Foco e Ambiente | Sua existência não prova integração com o leitor autenticado nem disponibilidade no piloto instalado |

## Achados verificáveis

1. **Integração visual pendente:** o leitor importa apenas seu `app.css` e `app.js`; não utiliza o shell e os tokens do produto. A hierarquia visual continua regida por `VISUAL_REFERENCE_HIERARCHY.md`, incluindo a sucessão estática M1 e a gramática Motion M1.
2. **Espaço ainda não validado:** o leitor limita `main` a 920 px e usa uma grade de cartões com mínimo de 320 px. Isso é evidência da estrutura, não medição de desperdício. Não houve captura atual para avaliar densidade, cortes, rolagem ou leitura no monitor do caixa.
3. **Investigação de itens ausente no leitor:** o renderizador mostra `quantidade × produto código`. Não oferece aprofundamento por item, nome de catálogo validado ou vínculo de praça. Não deduzir praça pelo código ou inventar nomes de produtos.
4. **Praças não representam pressão real:** `coberturaCelulasV33` exige o modo `somente_leitura_sem_motor_operacional`. Caixa, Sushi, Quentes, Cozinha, Conferência e Entregas são cobertura de fontes nesta superfície.
5. **Motion não integrado ao leitor:** seu CSS não contém animações ou transições. A gramática M1 exige movimento associado a mudança real de estado, evidência estática, falha técnica discreta e preservação da informação com movimento reduzido. Adicionar animação decorativa não fecha essa lacuna.
6. **Atualização merece ensaio de leitura:** `load()` limpa os registros antes de buscar dados e revalida em 30 segundos. A limpeza protege contra dados antigos; falta verificar, em uso, estabilidade da leitura e navegação durante a atualização. Qualquer melhoria deve preservar expiração, revogação e descarte de dados inválidos.

## Critérios para fechar a experiência

| Prioridade | Trabalho | Prova necessária |
|---|---|---|
| 1 | Definir e integrar a entrada do leitor na experiência canônica, preservando autenticação e somente leitura | Percurso real de login até comanda, sem segunda interface visual desconectada |
| 2 | Aprofundar comanda → item → origem; praça somente quando houver mapeamento comprovado | Exemplo rastreável e estados explícitos para catálogo ou praça desconhecidos |
| 3 | Aplicar a hierarquia espacial canônica ao recorte do piloto | Capturas atuais em desktop e celular; zero sobreposição ou rolagem horizontal; contexto e estado da fonte legíveis |
| 4 | Integrar Motion onde houver mudança sustentada por dados | Ensaio de transições, interrupção e movimento reduzido; nenhum fluxo ou pressão fictícios |
| 5 | Validar leitura sob atualização e falhas | Sessão expirada, fonte antiga, conflito, perda de conexão e retomada sem exibir informação inválida |

Viewport inicial de verificação proposto: 1366×768 e 1440×900 para desktop, 390×844 para celular. São alvos de ensaio, não dimensões confirmadas dos aparelhos de César. Confirmar também no monitor efetivo do caixa antes de concluir ergonomia operacional.

## Próximo passo

Obter uma captura da Home canônica e do leitor na mesma revisão executável, com dados de ensaio identificados; comparar com a referência estática ativa. Em seguida, implementar a integração visual no limite dos dados disponíveis. Não transformar a tela de cobertura em diagnóstico de pressão enquanto faltarem eventos observados por praça.

## Fontes locais

- `src/entregas/ui/copiloto/pedidos/index.html`
- `src/entregas/ui/copiloto/pedidos/app.css`
- `src/entregas/ui/copiloto/pedidos/app.js`
- `src/product/ui/surfaces/copiloto.js`
- `src/product/ui/surfaces/home.js`
- `docs/design/VISUAL_REFERENCE_HIERARCHY.md`
- `docs/design/M1_MOTION_GRAMMAR.md`

Nenhum teste de produto foi reexecutado: a mudança desta revisão é documental. Testes técnicos anteriores não certificam o visual nem o funcionamento no caixa.
