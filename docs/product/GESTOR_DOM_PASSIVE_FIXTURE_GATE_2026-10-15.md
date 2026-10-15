# Gestor de Pedidos — prova isolada de observação passiva do DOM

Data: 15/10/2026. Superfície: **Chromium local com HTML inventado**. Nenhum acesso ao Gestor real, login, conta, API, impressão, loja, banco, token ou pessoa.

## Questão testada
Pode um observador de interface detectar mudanças visíveis de estado sem enviar comandos nem requisitar dados externos, preservando indisponibilidade e uma forma limitada de privacidade?

**Mecanismo:** `src/ingest/gestorDomFixtureObserver.js`, que só expõe `__DELIVERYOS_GESTOR_DOM_FIXTURE__.start()` quando carregado explicitamente. Não se instala como extensão e não inicia por conta própria. Usa `MutationObserver` e consultas locais `querySelector`, nunca `fetch`, `XHR`, rede, `chrome.storage` ou gravação. A fonte e o modo são fixos: `gestor_dom_fixture`/`demonstracao`. Não produz `EnvelopeOperacional` nem recomendações na Home.

## O que realmente passou
`npm run test:platform:gestor-dom-fixture` compila o runner TypeScript para evitar a transformação inadequada de `page.evaluate` pelo `tsx` no Windows. O teste Chromium executa dez verificações:
1. Estado sintético inicial corretamente lido como demonstração.
2. Texto livre de cliente presente na página não vaza no snapshot.
3. Mudança visível de estado detectada automaticamente.
4. Mesmo estado novamente escrito não gera segundo evento.
5. Estado fora de um vocabulário fechado torna o resultado indisponível.
6. Lista vazia sem prova explícita não vira contagem zero.
7. Região removida torna a fonte indisponível.
8. TTL vencido esvazia observações e marca `DADOS_ANTIGOS`.
9. `stop()` deixa de observar a árvore.
10. Nenhum request de rede disparado.

O contrato de demonstração é intencionalmente rígido: apenas token sintético `PED-<3-8 dígitos>` e cinco estados de teste (`Aceito`, `Em preparo`, `Pronto`, `Despachado`, `Cancelado`); quaisquer outros valores falham fechados. Esses seletores e nomes **NÃO são afirmações sobre o DOM real do iFood**.

## Fronteira de verdade e autorização
- `PASS_FIXTURE` **não** significa `GESTOR_READABLE`, `LIVE`, `INTEGRATED`, `RELEASE_READY` ou `LEGAL_ALLOWED`.
- O código não vê abas, janelas, dados de clientes, sessão humana, termos ou painel real.
- Nenhuma chave nativa entre Gestor e Teknisa foi observada, por isso é proibido deduzir equivalência de pedidos.
- O sistema não ganha autoridade para agir no Gestor, enviar chats, alterar pedidos nem pausar loja.
- A automação direta de rede, extração de cookies/tokens e APIs oficiais ou privadas do iFood permanecem fora de escopo.

## Única próxima prova que justifica ampliar
Validar as condições de uso e o acesso já autorizado; confirmar com operador em **uma única tela de Expedição/Quadros**, apenas campos visíveis permitidos (estrutura de elementos, rótulos de estado, fonte/unidade, presença de identificador estável), sem coletar conteúdo pessoal. Se a fonte não expõe estrutura/estado estável, testar UI Automation do aplicativo Windows; se tampouco sustentar sinais, marcar cobertura desconhecida e manter leitor Teknisa + exportações como fontes separadas.

Só depois desse gate deverá existir adaptador real, com seletores obtidos da evidência, proveniência, freshness, consentimento/privacidade, variação da UI, teste real supervisionado e vínculo ao contrato operacional já existente. Não duplicar motor ou importar framework de automação completo.
