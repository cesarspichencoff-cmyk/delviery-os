# Reader V3 — camada 2: procedimento supervisionado único (15/11/2026)

**Estado: EM PREPARAÇÃO. Não está pronto para pedir autorização**, porque o código do watcher V3 e o
do consumidor sombra incremental ainda não foram escritos. Este documento fixa o que a autorização vai
cobrir, para que o pedido seja um só.

## 1. Por que precisa ser dentro do serviço

O Reader roda como `NT SERVICE\TataComandaReader` (conta virtual), com segurança integrada e sem senha
no script. Essa identidade só existe dentro do serviço. Ler as tabelas filhas com ela é a única
leitura legítima; criar outro login ou ACL na Teknisa foi recusado (decisão C).

## 2. O que muda e o que não muda

| Muda (com rollback) | Não muda nunca |
|---|---|
| `bin\tata_reader_continuous_watch_candidate_v2.ps1` (sha256 `92B33E82…`) ganha um irmão V3, primeiro em **sombra** | escrita da Teknisa, impressão, fiscal, ACL, credenciais, firewall, NetBird |
| `shadow\live_shadow_consumer_loop_v1.cjs` vira incremental | conta e definição do serviço, supervisor, Gestor, TATÁ Caixa |
| eventos V3 em pasta própria (`state\reader-events-v3`), sem sobrescrever os V2 | eventos, decisões e checkpoint V2 existentes |

## 3. Requisitos do watcher V3 (derivados de medição)

1. **Consulta sargável e incremental.** Sem `CONVERT(...) LIKE` sobre a coluna. Origem por igualdade
   numa lista explícita (`DLV_IFO`, `DLV_NMO`, as duas medidas em 14/11). Marca d'água por abertura,
   com margem, e reconsulta só dos pedidos abertos recentes. Meta: tirar as releituras (hoje 5,89
   milhões de duplicatas suprimidas).
2. **Filhos na mesma revisão.** Usa a receita existente de seis conjuntos
   (`tools/comandas_reader_one_order_children_CAPTURE_OFFLINE_ONLY.sql`) e o reconciliador
   `native_reader_n2_child_tables_review_v1.cjs` (56 testes). Isolamento igual ao do V2: `READ
   COMMITTED` e `LOCK_TIMEOUT 2000`; **sem NOLOCK nem SERIALIZABLE**.
3. **Integridade sem releitura.** Ler duas vezes igual não prova nada. A testemunha independente é o
   **Gestor**: itens, opções e observações por `externalCode` = `CDARVPROD` (22 de 22 em 14/11). Uma
   revisão só vira "completa para o que o iFood enviou" quando bate com o pedido do Gestor; sem par,
   fica "não confirmada", nunca "completa".
4. **Observação por item em base 0**, com o `CDPRODUTO` conferido (defeito corrigido na camada 1 em
   15/11).
5. **Turno pela política semanal**, no produtor, no lugar do arquivo manual parado desde 14/10.

## 4. Critérios objetivos da sombra (antes de qualquer troca)

Sombra de no mínimo um almoço e um jantar completos, lado a lado com o V2:

- **CPU:** consumidor sombra abaixo de 5% de um núcleo (hoje cerca de 70%); watcher V3 abaixo do V2.
- **SQL:** nenhuma espera de lock acima de 2 s causada pelo V3; zero erro de consulta.
- **Cobertura:**
  - todo pedido do V2 aparece no V3;
  - contra o Gestor, na janela que ele guarda, 100% dos pares com itens iguais;
  - complemento e observação do iFood presentes como filho ou declarados "não gravados pela Teknisa".
- **Latência:** primeira revisão V3 no máximo igual à do V2, que hoje tem mediana de 1,8 min depois do
  PLACED.
- **Impressão e atendimento:** nenhuma janela aberta e nenhum incidente.

## 5. Execução e rollback (quando o código existir)

Fora do serviço (antes de 10:30 ou depois de 23:30), com o caixa ocioso medido por `caixa-em-uso.ps1`
e o medidor de janelas ligado.

1. Hash e cópia de `bin\` e `shadow\`.
2. V3 em sombra sob o supervisor, gravando só em `reader-events-v3`.
3. Rollback: desligar o V3, restaurar os arquivos pela cópia (conferência de hash) e verificar a saúde
   do serviço. Os eventos V2 nunca foram tocados.

A troca do V2 pelo V3 é um **segundo ato**, só depois dos critérios da seção 4 e do aceite do César.

## 6. Próximo passo

Escrever o watcher V3 e o consumidor incremental a partir da leitura do código instalado (só leitura)
e testá-los em laboratório: SQL Server de bancada com o esquema da receita e dados inventados. Depois
disso, pedir **uma** autorização para os passos 1 a 3 da seção 5.
