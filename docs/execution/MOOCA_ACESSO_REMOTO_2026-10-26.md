# Ensaio de acesso remoto — Caixa Mooca

Estado: **servidor e proteção aplicados; acesso autenticado pelo proxy pendente de confirmação humana**.

O Caixa Mooca hospeda um ambiente de teste do aplicativo ITAIM, com dados simulados e GPS desligado. Isso não libera operação real, distribuição de APK de campo ou coleta de localização.

## Resultado aplicado

- Piloto em `100.107.78.202:5193`, sem escuta em `0.0.0.0` ou na Ethernet.
- Configuração remota validada pelo contrato do aplicativo: credenciais próprias por ambiente, origem HTTPS explícita e diretório persistente do ensaio.
- PostgreSQL `55436` e plataforma `8080` continuam em `127.0.0.1`.
- Firewall do Windows habilitado nos três perfis com **Ethernet excluída**; os outros parâmetros dos perfis não foram alterados. A Ethernet era a única interface de rede normal além de `wt0`; a preparação recusa outra topologia.
- 258 regras próprias, persistentes e restritas a `wt0`: bloqueio de todos os protocolos IP exceto TCP, bloqueio das demais portas TCP e bloqueio de origens diferentes dos dois proxies observados na porta 5193. A permissão é para o executável Node, IP do NetBird e porta 5193.
- Origens permitidas: proxies `100.107.51.21` e `100.107.100.135`. Mudança desses endereços exige revisar as regras; não há atualização automática que amplie a permissão.
- `BlockInbound=false` somente depois da proteção efetiva. DNS, rotas de cliente e de servidor continuam desabilitados; SSH de servidor e trabalhos remotos continuam recusados.
- Nenhuma abertura de porta no roteador ou mudança do banco do caixa foi realizada.

## Evidência e limites

Em 2026-10-26, aproximadamente 19h59–20h01 de São Paulo:

- Estado efetivo do firewall, exclusão da Ethernet, integridade das regras, proprietário da porta e escutas internas passaram na verificação.
- Desativar temporariamente **somente a regra de permissão** foi detectado pelo verificador. A regra foi restaurada e a verificação passou novamente. Esse controle verifica a detecção de alteração; não é uma captura de pacotes de outro aparelho.
- HTTP no endereço interno do piloto: saúde 200; termo e políticas sem sessão 401; origem não permitida 403 no preflight; origem pública declarada 204; sessão fictícia de teste 200 nas políticas.
- Políticas consultadas confirmaram GPS desligado e termo não publicável.
- URL pública `https://deliveryos-piloto.eu1.netbird.services`: TLS verificado e resposta 401 sem autenticação. **O 401 comprova a barreira de autenticação, não a conexão autenticada do proxy ao aplicativo.** Não usamos nem extraímos a senha ou cookies do navegador de César.
- Plataforma pronta: 200. Testes de governança do repositório: 14 guardas verdes.

O fluxo autenticado ainda precisa ser confirmado atualizando o navegador que exibiu o 502. Caso continue falhando, o próximo diagnóstico é o alvo Peer/porta no serviço e os registros da tentativa; a proteção local não deve ser ampliada para resolver disponibilidade.

## Correções encontradas no ensaio

1. A API COM do firewall recusou `::/0` combinado com os intervalos IPv4. O intervalo IPv6 explícito completo foi aceito em regra desabilitada antes de repetir a aplicação.
2. No NetBird 0.81.4, `up` retorna antes de aplicar flags quando já está conectado. A sequência agora desconecta e reconecta **depois** de efetivar a proteção. Fonte inspecionada: `netbirdio/netbird`, tag `v0.81.4`, `client/cmd/up.go`.
3. A conclusão de `up` pode anteceder o primeiro mapa de peers. A descoberta aguarda sincronização por um prazo limitado; não aceita outro conjunto de origens.

As tentativas recusadas foram revertidas. Nas reversões completas, o NetBird foi desconectado e o piloto devolvido a loopback. Os registros locais das tentativas foram preservados. Os segredos permaneceram no diretório protegido do host.

## Operação e reversão do ensaio

Os scripts versionados em `tools/windows-local-lab/` são copiados para `C:\Users\Tata\DeliveryOS-Ensaio`, ao lado da instalação e dos arquivos privados. Não executá-los no checkout do repositório, nem em outra máquina.

```powershell
# Verificação efetiva, sem alterar regras:
& 'C:\Users\Tata\DeliveryOS-Ensaio\netbird-guard.ps1' -Mode Verify

# Testes HTTP do host; não imprimem credenciais:
& 'C:\Program Files\nodejs\node.exe' 'C:\Users\Tata\DeliveryOS-Ensaio\remote-smoke.cjs'

# Reversão: VPN desconectada, piloto local, regras próprias removidas,
# estado anterior dos perfis e exclusões restaurado:
& 'C:\Users\Tata\DeliveryOS-Ensaio\netbird-guard.ps1' -Mode Rollback
```

Cada aplicação arma tarefa independente de reversão em dez minutos. A confirmação verifica novamente o estado, grava recibo e remove a tarefa. A aplicação atual foi confirmada; não há tarefa de reversão pendente. O rollback manual continua disponível.

Ainda não provados: reinício do Windows, inicialização automática, encerramento gracioso, backup fora do host, persistência operacional integral em PostgreSQL, autenticação do aplicativo Android pelo proxy, assinatura de campo e testes físicos no Xiaomi. O proxy informa gratuidade durante a beta; não há promessa de preço futuro.
