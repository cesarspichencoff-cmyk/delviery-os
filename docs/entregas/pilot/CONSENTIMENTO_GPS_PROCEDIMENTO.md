# Procedimento do aceite do termo de localização (GPS)

> Descreve **o que o código faz hoje**, conferido em `src/entregas/consent/term.ts`,
> `src/entregas/consent/acknowledgement.ts`, `src/entregas/pilot/device-api.ts`,
> `src/entregas/ui/rider-mobile/consent-screen.js` e `capture-rule.js`. Nenhum código foi alterado.
> O termo **ainda não está publicável**: a minuta (`termo-localizacao-minuta.json`) tem
> `approved: false`. Enquanto isso, a tela mostra "o termo de localização ainda não foi liberado
> pelo responsável" e o GPS não liga. O termo sintético de laboratório ("SEM VALOR LEGAL") só
> serve para a bancada e **não pode ser mostrado a motoboy de verdade**.

## 1. Como o motoboy lê e aceita

Ordem da tela (`consent-screen.js`; runbook `PILOT_DEVICE_RUNBOOK_ANDROID.md` §2):

1. resumo curto do que a localização faz;
2. `LER TERMO COMPLETO`, com o texto inteiro;
3. caixa "Li e compreendi como a localização será usada durante as viagens". Ela **começa
   desmarcada**, e só o dedo do motoboy marca;
4. `CONCORDAR E CONTINUAR` fica apagado até a caixa ser marcada. `NÃO CONCORDAR / VOLTAR` tem o
   mesmo peso visual;
5. `BAIXAR OU RECEBER UMA CÓPIA`.

**Só depois** o Android pede a permissão de localização. Recusar não impede a viagem: a saída
confirma normalmente, o GPS não liga e o indicador mostra "TERMO NÃO ACEITO".

## 2. Como o aceite é provado

Quem monta o registro é o **servidor**, nunca a página (`handleTermAcknowledgeFromSession`):

| Trava | Efeito |
|---|---|
| a sessão precisa ser de `motoboy_interno` | operador, gerente ou outra sessão recebe **403** ("Só o próprio motoboy registra o aceite do termo.") |
| o motoboy do registro é o da sessão | a página não escolhe de quem é o aceite |
| o hash é o do termo vigente, calculado no servidor | aceite de texto antigo recebe **409** ("O termo mudou…") |
| o termo precisa ser publicável | antes da aprovação, **409** `term_not_publishable` |
| campos proibidos | coordenada, CPF, telefone, nome, foto e afins recusados com **400** |

Cada registro guarda: `acknowledgement_id`, `rider_id` (ID opaco, nunca nome), `unit_id`,
`term_version`, `term_material_version`, `term_hash` (SHA-256 do texto e da política
apresentados), `status` (`accepted`/`declined`), `accepted_at`, `recorded_at` (hora do
servidor), `device_id` (pseudônimo, nunca IMEI), `app_version`, `language` e `origin`.

- **A identidade é determinística.** `acknowledgement_id` = SHA-256 de
  `rider | unidade | versão material | hash | aparelho`. Ele **não inclui o status**: a
  primeira resposta daquele motoboy, naquele aparelho, para aquele texto é a que vale. Repetir é
  sucesso sem gravar de novo (`stored: false`).
- **O armazenamento é append-only** (`AcknowledgementStore`, arquivo `term-acks.jsonl` do
  piloto). Não existe update nem delete. Se uma linha for reescrita depois, ela é ignorada.
- **O aceite vale por motoboy e por aparelho.** Num celular compartilhado, o termo aparece de
  novo para o segundo motoboy. Aceite feito em outro celular não liga a captura neste.
- **Mudança material pede novo aceite.** Retenção, papéis, controlador ou unidade mudam o hash.
  O indicador mostra "TERMO NOVO PARA ACEITAR", e o GPS fica desligado até o novo aceite.
- **Recibo** (`receipt`): número do recibo, unidade, versão, impressão do texto (hash), data,
  situação (aceito/recusado), aparelho e versão do app. Sem jargão e sem coordenada.

Para conferir um aceite: procurar a linha em `term-acks.jsonl` pelo `acknowledgement_id` do
recibo e comparar o `term_hash` com o hash que `/api/policies` mostra para o termo vigente.

## 3. O que o gerente faz

1. **Antes:** confirmar que o termo publicado é o aprovado pelo César. A tela do motoboy não pode
   mostrar `[[PENDENTE]]` nem "SEM VALOR LEGAL".
2. **Entregar o aparelho ao motoboy, não aceitar por ele.** O sistema recusa aceite feito por
   outra sessão (403), e o gerente também não deve tentar.
3. **Explicar em linguagem simples** (`GUIA_LIDERES_V1.md`): quando liga, quando desliga, quem
   vê, como parar.
4. **Se o motoboy recusar:** respeitar. A viagem segue sem GPS. Não insistir pelo app; é
   conversa de gente.
5. **Se o motoboy pedir para sair ou retirar o aceite:** seguir o §4 e registrar o pedido.
6. **Nunca** fotografar a tela do termo com dados do motoboy, nem anotar telefone ou documento
   em planilha de teste.

## 4. Como retirar o aceite: o que existe e o que falta

| Caminho | Existe? | Efeito |
|---|---|---|
| desligar a permissão de localização do app nas configurações do Android | **sim** | a regra fica `sem_permissao` e o `CaptureGate` do Kotlin recusa. A captura para (cenário "permissão revogada", `FIELD-GATE-ANDROID.md` §4) |
| pedir ao responsável que **revogue o aparelho** (`npm run admin:entregas:device -- revoke …`) | **sim** | o servidor passa a recusar o aparelho (`dispositivo_revogado`). O histórico fica preservado |
| botão "retirar meu aceite" no aplicativo | **não** | — |
| registro da retirada no `term-acks.jsonl` | **não** | o arquivo só conhece `accepted`/`declined`, e a primeira resposta vence |
| refazer uma recusa (motoboy que recusou e mudou de ideia) | **não pelo app** | só com versão material nova do termo, ou com procedimento a definir |
| apagar os dados já coletados quando ele pede | **não** | `platform.event_log` é append-only (`TERMO_GPS_RECOMENDACOES.md` §2) |

**Enquanto a lacuna existir:** o pedido de retirada fica registrado fora do sistema pelo canal
do termo (ainda `[[PENDENTE]]`), sem dado pessoal além do `rider_id`. O gerente desliga a captura
pelos dois caminhos que existem: a permissão no celular e, se for o caso, a revogação do
aparelho. Fechar a lacuna (botão, novo `status`, eliminação) é decisão do César depois da
revisão jurídica. Se a base legal for consentimento, a lei exige que a retirada seja possível
(LGPD, art. 8º, §5º).
