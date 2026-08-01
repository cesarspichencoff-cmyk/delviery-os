# Visão de movimento por módulo

> **Isto é visão, não implementação.** Nada abaixo marcado como "futuro" existe no código.
> O que está implementado hoje está em `MOTION_COMPONENT_MAPPING.md`.

## Implementados

### Entregas
**Hoje:** `reveal` nos cartões de viagem; `state_handoff` no selo de conexão.
**Nunca:** movimento na lista de paradas, nas ocorrências e no bloco do aparelho. Uma ocorrência
que bloqueia disponibilidade não pode chegar deslizando — ela precisa já estar lá quando o olho
chega.

### Operação Viva
**Hoje:** `pulse_line` na integridade do sinal, **só quando saudável**; `reveal` escalonado nos
cartões de dimensão.
**Visão:** a linha pulsante ganharia amplitude proporcional ao fluxo real de eventos, virando
meteorologia — a tríade "ambiente é clima" do CLAUDE.md §5. Depende de um fluxo de eventos que
hoje não existe em tempo real.

### Conference Brain
**Hoje:** `reveal` nas linhas de fonte e nos cartões de conclusão.
**Visão:** quando um ciclo novo chega, a linha da fonte faria `state_handoff` da saúde anterior
para a nova, com o rótulo trocando instantaneamente. Depende de leitura contínua, que exigiria
polling — e polling numa superfície de leitura é decisão de produto, não de motion.

### Copiloto Shadow
**Hoje:** `reveal` nos cartões; `expiration_fade` previsto para a saída de atividade.
**Visão:** a transição `proposed → expired` aconteceria **enquanto a pessoa olha**, com o cartão
esmaecendo para 0.45 sem sair da tela. Isso exige relógio vivo na superfície; hoje o relógio é
congelado na fixture, de propósito, para a demonstração ser a mesma toda vez.

## Futuros — visão apenas

| Módulo | O que o movimento comunicaria | Por que ainda não |
|---|---|---|
| CRM e Conversa | a chegada de uma fala nova na linha do tempo do cliente | não há fonte de conversa ligada |
| Caixa | a divergência aparecendo no fechamento, não o total subindo | não há fonte financeira |
| Suprimentos | a curva de consumo cruzando o limiar de ruptura | não há fonte de consumo |
| Evolução | antes e depois de uma mudança deliberada, no mesmo eixo | não há registro de mudança |
| Treinamento | nenhum. Conteúdo de aprendizado não precisa de animação | — |
| Seleção e RH | nenhum. Movimento sobre dado de pessoa vira dramatização | decisão de produto, não técnica |
| Gestão | a mesma linguagem da Operação Viva, em outra escala | depende de todos os anteriores |

## A regra que vale para todos

Antes de qualquer módulo novo ganhar movimento, ele responde: **o movimento comunica uma mudança
de estado que a pessoa precisa perceber?** Se a resposta for "fica mais bonito", ele não entra.
Em Seleção e RH a resposta é *não* por princípio — o sistema mostra o que aconteceu, e a pessoa
decide; animar isso seria dramatizar a vida de alguém.
