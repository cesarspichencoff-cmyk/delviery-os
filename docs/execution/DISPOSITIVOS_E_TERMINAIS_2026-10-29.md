# Celulares Android e terminais simultâneos

Pedido de César em 29/10/2026: ampliar além do Xiaomi e manter tablet e caixa Mooca conectados. Unidade operacional continua Itaim; o caixa Mooca é terminal/host, não autorização de operação para outra unidade.

## Funções

| Dispositivo | Função | Localização |
|---|---|---|
| Celular pessoal ou corporativo do motoboy | Viagem, confirmação e fila offline | Somente durante viagem autorizada e com ciência/permissão |
| Tablet da operação | Painel de expedição e acompanhamento | Não deve iniciar captura de sua própria posição |
| Caixa Mooca Windows | Painel e host já previsto | Não captura GPS do caixa |

Cada terminal deve autenticar seu responsável com permissões próprias. A sessão do tablet não troca o ator do caixa ou do celular. O painel web do piloto já conserva token no armazenamento local do navegador; isso não equivale a garantia de sessão eterna nem à sessão do NetBird. Revogação de credencial deve continuar funcionando. Não copiar senha pessoal para conta compartilhada de operação.

## O que o código suporta hoje

- Aplicativo Android: minSdk 26 (Android 8), compile/target 34. Marca não é critério de seleção.
- Captura usa FusedLocationProviderClient de Google Play services. Aparelhos sem Google Play services não têm rota alternativa nativa implementada. Não declarar suporte universal.
- Painel web é separado do APK do motoboy; tablet e Windows não precisam do APK para acompanhar entregas.
- Nesta revisão removida a orientação retrato fixa da Activity e explicitado redimensionamento. Isso permite rotação; layout físico no tablet ainda não foi validado.
- Testes de conversão/identidade do ponto Android ampliados de API 33 para APIs 26, 28, 29, 30, 31, 32, 33, 34, no Robolectric. Não são testes de fabricante, GPS físico nem foreground service.
- Regressão adicionada: três identidades (tablet, caixa, motoboy) em paralelo por três rodadas, seguidas de consulta anônima que não pode herdar ator.

## Matriz a homologar

- Fabricantes: Samsung, Motorola, Xiaomi/Redmi/Poco, Realme/Oppo e outros conforme aparelho recebido. Não criar lista de marcas bloqueadas.
- Android Go e aparelhos com pouca memória: testar morte/reabertura do processo e persistência da fila.
- Sem serviços Google: implementar provedor Android nativo alternativo (LocationManager), submetido aos mesmos controles de sessão, precisão, permissões, privacidade e fila. Ainda pendente.
- Android abaixo de 8: fora do APK atual; não reduzir minSdk sem auditar dependências e segurança. Acompanhamento web depende de navegador compatível, sem promessa de GPS contínuo.
- Android 15 e posteriores: ampliar SDK/testes separadamente. Instalar ou compilar com target 34 não prova homologação nas versões novas.
- Tablet: retrato/paisagem, toque, teclado quando houver, atualização após suspensão e sessão persistida ao reabrir.
- Caixa/tablet/celular: operação simultânea, mesma revisão de pedidos, atualização após reconexão, comandos duplicados recusados e credencial revogada sem herança de sessão.

## Ordem de liberação

1. Fechar P1 de ciclo START/STOP documentado em GPS_REVISAO_2026-10-29.md.
2. Testar callbacks e persistência por geração, compilar e obter CI Android verde.
3. Implementar diagnóstico de capacidade e provedor alternativo sem Google; não confundir localização aproximada com falha total.
4. Testar aparelhos representativos e tablet real. Registrar modelo, Android, serviços disponíveis, permissão, economia de bateria e prova de interrupção após encerramento.
5. Instalar nos aparelhos autorizados e autenticar cada terminal. Nenhuma instalação ou login físico foi realizado nesta revisão; o acesso remoto anterior continua indisponível por cota.

## Referências oficiais consultadas

- https://developers.google.com/android/guides/setup
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- https://developer.android.com/training/permissions/requesting

A captura em foreground service depende das permissões e do contexto de início permitido pelo Android; manter a tela apagada não é prova de autorização para iniciar o serviço a partir de qualquer estado.
