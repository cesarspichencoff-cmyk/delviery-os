# Fechamento do piloto — Itaim

Este é o roteiro de conclusão do piloto, não uma declaração de prontidão. Prioridade: fechar um percurso comprovado do acesso à comanda e à entrega antes de ampliar recursos. Sem infraestrutura paga nova. A instalação permanece separada da preparação em revisão.

## Critérios de conclusão e dependências

| Ordem | Frente | Estado comprovado | Trabalho possível antes da instalação | Prova necessária para fechar |
|---|---|---|---|---|
| 1 | Pacote e recuperação | Runtime integrado por opt-in; launcher instalado ainda não encaminha a configuração individual | Checagem offline do pacote, dependências e configuração; plano de troca/retorno | Pacote candidato completo e testes negativos; ensaio de troca e retorno no host, preservando dados |
| 2 | Acesso individual e leitura | Testes sintéticos de sessão, revogação, expiração e leitura por worker; conta existente verificada anteriormente | Revisão de origem, configuração privada e regressões; nenhum OTP real | Login humano via proxy, Host/cookies corretos, cadastro válido e comanda conhecida lida no caixa |
| 3 | Origem e tempo | Adaptador de horário e checkpoint testados; eventos pós-correção de horário observados anteriormente | Ensaios de arquivo incompleto, obsoleto, conflitante e revalidação | Conferir fonte/loja/modo, latência e referência da comanda real sem alterar o produtor |
| 4 | Copiloto e investigação | Leitor com busca e detalhes, capturas sintéticas; Home canônica preservada | Definir composição de acesso e retorno; testar espaço, teclado, atualização e movimento reduzido | Percurso integrado no equipamento, com distinção entre dado observado e desconhecido |
| 5 | Catálogo e praças | Leitor conhece código/quantidade; não há mapeamento comprovado no fluxo atual | Preparar contrato de vínculo com evidência, cobertura e revisão; desconhecidos permanecem explícitos | Código da fonte ligado a produto/praça por catálogo validado; nenhum nome ou pressão inferido |
| 6 | Entregas | Console simulado com PostgreSQL; persistência e recuperação possuem ensaios | Regredir associação explícita, duplicidade, isolamento simulado/real e autorização | Pedido conhecido associado à expedição por ação autorizada, viagem persistida e recuperada após reinício |
| 7 | GPS Xiaomi | Aparelho informado, prova física pendente | Preservar testes Android e roteiro de campo | Identidade/termo, localização, perda de rede, segundo plano e bateria no aparelho efetivo |
| 8 | Gestor iFood | Captura e associação operacionais não comprovadas | Revisar contratos existentes e deduplicação; não inventar conector nem dados | Fonte autorizada qualificada, identificadores observados, repetição sem duplicar e associação rastreável |

A conclusão da frente 1 não libera automaticamente as demais. Leitura de comanda não confirma preparo, prontidão, despacho, entrega ou localização. A tela técnica `/copiloto` não substitui a experiência da Home `/`. A ponte com a Home precisa preservar a autenticação individual; um link sozinho não resolve a composição de servidores.

## Sequência de execução

1. Fechar regressões da revisão exata e verificar pacote offline. Registrar falhas como bloqueio, sem parar serviço.
2. Preparar launcher reversível com configuração explícita desligada; não ativar por descoberta de arquivo ou variável herdada. Preservar o launcher anterior e sua configuração privada.
3. Quando houver acesso ao host, conferir identidade do processo, arquivos, ACLs, provedor/origem e fonte. Executar checagens antes de interromper qualquer processo.
4. Instalar somente a versão revisada na janela autorizada; conferir saúde de Entregas e leitura individual separadamente. Falha de login ou fonte não pode parecer fila vazia nem entrega pronta.
5. Fazer aceite humano: entrar, localizar comanda, investigar item/origem, atualizar, perder fonte, revogar/sair e recuperar. Registrar somente metadados necessários, sem conteúdo privado.
6. Completar associação e recuperação de Entregas. Só depois avançar GPS físico e Gestor iFood, mantendo seus critérios próprios.

## Recuperação

Não reinicializar checkpoint, apagar filas, restaurar banco por cima do ativo nem encerrar processo sem identidade comprovada. Voltar ao binário/launcher anterior é diferente de restaurar dados. O ensaio anterior de PostgreSQL não prova backup recorrente ou recuperação fora do host; ambos continuam pendentes. Autostart e parada graciosa também exigem ensaio no Windows.

## Evidências de referência

- `PILOTO_LEITOR_ENTREGAS_IFOOD_2026-10-27.md`: composição e aceitação.
- `LEITOR_ISOLADO_2026-10-28.md`: worker limitado e autorização após leitura.
- `../design/COPILOTO_LEITOR_VISUAL_2026-10-28.md`: implementação e capturas sintéticas.
- `MOOCA_POSTGRES_RECUPERACAO_2026-10-27.md`: limites do ensaio de recuperação.
- `PROJECT_STATE.json` na raiz: revisões e resultados, sem confundir CI anterior com revisão atual.

Acesso remoto indisponível por quota, com orientação de não repetir/reconectar. Preparação e testes locais continuam; login real, instalação e provas físicas aguardam acesso legítimo disponível. Sem prazo ou porcentagem de conclusão inventados.

## Entrega de preparação — 29/10/2026

Criado `tools/windows-local-lab/operator-package-preflight.cjs`, verificador offline somente leitura. Ele não instala, para processo ou ativa configuração. O resultado sempre inclui `activationAllowed:false`, verificações com códigos estáveis e bloqueios operacionais separados.

Uso no pacote candidato, com Node disponível:

```text
node tools/windows-local-lab/operator-package-preflight.cjs --app-root CAMINHO_ABSOLUTO_DO_PACOTE
node tools/windows-local-lab/operator-package-preflight.cjs --app-root CAMINHO_ABSOLUTO_DO_PACOTE --config CAMINHO_ABSOLUTO_PRIVADO --public-url ORIGEM_HTTPS_EXATA
```

O primeiro comando verifica preparação com leitura desligada. O segundo acrescenta validação estática da configuração: unidade, origem, horário, escopo, expiração e caminhos privados fora de todo o pacote. Não lê o cadastro de pessoas nem o diretório da fonte. Código de saída 0 significa apenas que as verificações offline passaram; 1 sinaliza falha. Nenhum deles autoriza instalação ou publicação.

Verifica o grafo local de módulos CommonJS compilados, worker/motor, dependência dinâmica conhecida, assets do leitor, paleta e Motion. Compila sintaxe sem executar código. Dependências externas têm entrada resolvida e lida, mas não execução nem auditoria transitiva completa; `npm ci` e os testes de processo continuam necessários. O digest identifica somente os arquivos conferidos, não todo o pacote nem a configuração privada.

Dez famílias de testes sintéticos cobrem pacote copiado, desligado/ausente, candidato ativo apenas estrutural, 15 configurações inválidas, arquivos e dependências removidos, sintaxe, saída sem segredos, ausência de acesso à fonte/rede/escrita, digest e CLI. Foi reproduzido e corrigido o falso positivo de `require.resolve` com caminho em cache após remoção de dependência. As provas rodam também na CI de produto; Windows/ACL/launcher reais continuam pendentes.

Para executar a regressão: `npm run build` e `node tests/tata-reader/run-operator-package-preflight-tests.cjs`.
