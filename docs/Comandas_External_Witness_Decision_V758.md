# Comandas — testemunha externa e recuperação de integridade V7.58

**Estado: DRAFT / somente laboratório / NÃO instalar.**

## Decisão nesta etapa

A referência de integridade do diário de tentativas **não pode morar apenas na
CAIXA**. A assinatura do último estado V7.57 evita algumas adulterações,
mas não demonstra que o verificador recebeu a versão mais recente nem que
a chave confiável está sob autoridade independente.

A V7.58 implementa uma **interface de verificação**, sem integração remota:

- Um diário local sintético V7.55 guarda tentativas por via em `os.tmpdir()`.
- Uma segunda estrutura, chamada **testemunha**, mantém uma sequência encadeada
  de checkpoints assinados Ed25519. Cada checkpoint amarra instância do diário,
  revisão e SHA-256 da revisão do diário.
- O verificador recebe **por argumento separado** o histórico da testemunha
  e um contexto de confiança já aprovado com: impressão digital da chave
  pública, identidade das instâncias, revisão final exigida, hash da última
  testemunha e hash exigido da última versão do diário.
- Cada assinatura, elo, ordem, identidade e referência externa exigida é
  conferida. A última versão da testemunha só é aceita se o diário local
  corresponder exatamente, e se não houver trava pendente.
- Falha de leitura, divergência de história, rollback, reescrita, assinatura,
  destino ou revisão produz **HOLD**. O verificador nunca devolve autorização
  para imprimir, reimprimir, fazer rollback ou limpar travas.

Implementação: `tools/comandas_external_witness_v758_offline.js`.
Teste adversarial: `tools/verificar_external_witness_v758_offline.js`.
Teste da cadeia real de componentes fonte-pinados: 
`tools/verificar_cadeia_positiva_v722_offline.js`.

## Cenários adversariais obrigatórios

1. Cadeia assinada válida e três vias reconciliadas no laboratório.
2. Remoção, inversão, lacuna ou alteração de registros da testemunha.
3. Assinatura alterada, chave diferente, identidade/autoridade trocada.
4. Reconstrução das hashes internas sem a assinatura original.
5. Última revisão local apagada, arquivo corrompido, revisão adicional sem
   checkpoint, trava remanescente após queda.
6. Referência final previamente confiável substituída ou antiga.
7. Hipótese de **atacante controlando também a própria fonte de confiança**:
   a criptografia pode validar uma história reemitida por esse atacante.
   Isso precisa constar como LIMITAÇÃO do sistema, não como sucesso real.
8. Nenhum acesso à impressora, a serviços do restaurante, ao banco ou à rede.

Os diretórios distintos do runner NÃO demonstram independência real de
administração ou host. Chave privada de teste só existe na memória do CI,
não é copiada para repositório, arquivos de prova ou computador operacional.

## Alternativas para custódia real — escolha ainda NÃO autorizada

**Preferência provisória: reutilizar infraestrutura já disponível** como
transportador de provas, mas sem chamar armazenamento comum de WORM/imutável.

| Opção | Ganho potencial | Condição / limitação |
|---|---|---|
| GitHub já conectado, em repositório privado de provas | Plataforma externa à CAIXA, rastreabilidade de commits | Histórico pode ser reescrito por operadores privilegiados; commit, tag e Actions artifact não demonstram custódia independente nem imutabilidade. Rulesets para repositórios privados dependem do plano (ver documentação oficial); custo/entitlement atuais UNKNOWN |
| Google Drive / armazenamento existente em **conta administrativa distinta** | Possível controle externo à máquina e reaproveitamento de conta existente | Permissões, capacidade, retenção, acesso e independência entre contas não foram provados; revisões de arquivos por si só NÃO são antirollback forte |
| Serviço de retenção imutável com bloqueio administrativo | Separação mais robusta quando garantida contratualmente | Preço, retenção legal, capacidade e governança exigem pesquisa e eventual autorização; NÃO provisionar por padrão |

Referências externas de produto (não constituem prova da conta):

- [GitHub — About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub — About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

A documentação do GitHub explicita que rulesets estão disponíveis para
repositórios públicos no GitHub Free, mas para repositórios privados nos
planos GitHub Pro/Team/Enterprise; também existe capacidade de exceção/
administração de regras. **Não assumir que a opção privada com retenção/
proteção suficiente é gratuita nesta conta**, nem habilitar repositório
público para guardar evidências operacionais.

## Condições mínimas para uma testemunha operacional

- Identidade e custódia da chave de assinatura e do **pin de revisão mais
  recente** comprovadamente independentes da máquina, sem usar o mesmo
  segredo/credencial que poderia reescrever as provas.
- Escrita condicionada à versão anterior (CAS), confirmação de persistência
  e leitura inequívoca; não presumir atomicidade em pasta compartilhada.
- Sem detalhes do pedido, nomes, endereço ou observações persistidos fora da
  máquina: apenas instância, revisão, timestamp/cadência, hashes e metadados
  estritamente necessários.
- Se a testemunha ficar offline, divergente, atrasada ou impossível de
  autenticar: **não imprimir / não reimprimir / preservar tudo / escalar
  reconciliação**. A política de disponibilidade depende da operação humana.
- Retenção, rotação de chaves, perda de acesso, contingência, restauração,
  privilégios separados, relógio, risco de dupla administração e prova de
  custos definidos antes de qualquer ativação.
- Corrida entre o commit do diário e o commit testemunhado deixa estado
  ambíguo e precisa ser auditada; isso é diferente de exatamente uma impressão.
- Verificar em hardware e ambiente real a durabilidade após perda de energia
  no Windows e o mapeamento das **três impressões** no Itaim.
- Concluir o portão de efeito externo com consentimento específico de César
  ANTES de novas impressões/instalação. A autorização antiga de uma amostra
  V7.51 está consumida; ela não habilita esta etapa.

## Limite da prova e continuação

`TEST_PASS` nesta fase demonstra apenas *algoritmo de verificação* sob
contexto sintético fornecido externamente pela função de teste.
`WORLD_PROVEN` para testemunha externa, recuperação em hardware, papel,
não-duplicação na impressora e ausência de efeitos na Teknisa continua
**UNKNOWN**.

**NO MERGE / NO DEPLOY / NO INSTALL / NO PRINT / NO SPOOLER WRITE /
NO TEKNISA CHANGE / NO SEQUENCE WRITE / NO GITHUB PROTECTION CHANGES.**
