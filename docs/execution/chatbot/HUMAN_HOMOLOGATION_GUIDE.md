# Guia de homologação humana

## Iniciar

Na raiz do projeto, execute:

```powershell
npm run conversation-native:start
```

Abra no navegador:

`http://127.0.0.1:4179`

O painel funciona somente no computador local, usa dados sintéticos e mantém
todos os drivers reais desligados.

## Os quatro modos

1. **Atendimento Livre:** converse como cliente. O histórico é multiturno e
   `Nova conversa` separa o contexto anterior.
2. **50 conversas:** dê nota geral, avalie seis critérios, escolha tags e
   escreva um comentário opcional.
3. **Comparação cega A/B:** escolha A, B, empate ou ambas ruins sem saber qual
   é a versão humanizada. A identidade só aparece depois do voto.
4. **Explorar banco:** navegue por 32 áreas e envie um exemplo ao Atendimento
   Livre. A resposta não é preenchida automaticamente.

`Resultados` mostra cobertura, médias, comparações e pontos que ainda precisam
de análise. O painel não aprova o chatbot automaticamente.

## Continuar depois

O progresso é salvo localmente e sobrevive à atualização da página, ao
fechamento do navegador e ao reinício do servidor.

Por padrão, os arquivos ficam em:

`%LOCALAPPDATA%\DeliveryOS\human-homologation`

É possível escolher outra pasta antes de iniciar:

```powershell
$env:DELIVERYOS_HOMOLOGATION_ROOT = Join-Path $env:LOCALAPPDATA "DeliveryOS\homologacao-privada"
npm run conversation-native:start
```

Essa pasta deve permanecer privada e fora do Git.

## Avaliar e revisar

- Antes do voto, o painel não mostra intenção, estratégia, oráculo ou versão
  A/B.
- Depois do voto, `Ver decisão do DeliveryOS` libera a explicação técnica.
- Um novo voto para o mesmo caso cria uma revisão append-only; o anterior não
  é apagado.
- O resumo conta somente a revisão mais recente.

Não inclua nome, telefone, e-mail, endereço pessoal, pedido real, token, cookie
ou credencial nos comentários. Conteúdo com esses sinais é recusado antes da
gravação.

## Exportar

Em `Resultados`, use `Exportar avaliação`. O painel cria um pacote irmão do
repositório em `deliveryos-review-packets`, com resumo, votos, comparações,
comentários sanitizados, hashes, branch e HEAD.

Para escolher outro destino:

```powershell
$env:DELIVERYOS_HOMOLOGATION_EXPORT_ROOT = Join-Path $env:LOCALAPPDATA "DeliveryOS\pacotes-de-homologacao"
npm run conversation-native:start
```

A exportação só é concluída após uma nova varredura de privacidade.

## Limpar dados sintéticos

Em `Resultados`, abra `Controles da sessão sintética`.

- `Reiniciar sessão` mantém o histórico append-only.
- `Apagar somente feedback de teste` remove apenas votos sintéticos locais e
  exige confirmação.

Os artefatos baseline, humanizados, corpus e métricas nunca são alterados.

## Reportar um problema

Registre o caso, o modo usado e o que pareceu inadequado no próprio painel.
Não corrija a resposta durante a homologação. Os feedbacks consolidados serão a
entrada da Mudança 004.

## O que não está conectado

Não há WhatsApp, iFood, Get In, Neemo, provider generativo, API externa, canal
real, envio de mensagem, merge, push ou deploy.
