# Preparação do Android para ensaio — 26/10/2026

Escopo: Itaim, preparação técnica. Há um Xiaomi disponível; modelo e versão permanecem não observados. Isso não bloqueia a compilação de bancada.

## Estado comprovado antes desta alteração

A PR #126 permanece DRAFT/HOLD em `e1398385b0f7947001972736e4cd74030e87d4e4`.

- Android: run 40232235279, 16 suítes JUnit, 110 testes, zero falhas/erros.
- Produto: run 40232235149 aprovado, incluindo despacho PostgreSQL 6/6, cluster 6/6, HTTP, navegador, acessibilidade e governança.
- Essas provas não significam instalação ou execução física.

## Entrega preparada

O fluxo Android passou a exigir relatório JUnit não vazio e sem falhas, compilar o APK debug e o APK de testes instrumentados, verificar ambos com ferramentas do SDK e gerar pacote com SHA-256, identidade e certificado público do assinante.

O empacotador recusa variante errada, pacote de testes divergente, ausência da marca debug, SDK mínimo inesperado, assinantes diferentes, assinatura ambígua, commit incompleto e ausência dos endereços de emulador no DEX. Oito controles sintéticos passaram localmente. As ferramentas reais e os APKs reais dependem do novo CI; não substituir essa prova por fixtures.

O guia de compilação foi reescrito: a instrução antiga de usar debug como piloto de campo foi retirada. O artefato de bancada declara que não é para instalar em celular de motoboy. Nenhuma chave privada ou credencial operacional entra no pacote.

## Auditoria da fronteira de 10/10

| Obrigação | Evidência ou pendência |
|---|---|
| Continuidade e revisão atual | PR/HEAD e runs revalidados |
| Compilar e testar o núcleo Android | 110 JUnit aprovados na revisão anterior; nova revisão precisa de CI |
| Produzir APKs e conferir pacote/assinatura/hash | Automatizado; execução real do novo CI pendente neste checkpoint |
| Diferenciar bancada de campo | Variantes e limites explícitos no guia e no pacote |
| Publicar servidor HTTPS de ensaio | Não executado; os arquivos consultados contêm somente URLs de exemplo |
| APK de campo assinado | Depende das duas URLs verificadas e custódia da assinatura |
| Termo e recibo remoto em sessão de campo | Bloqueador técnico confirmado: SyncWorker envia aceites com cliente do piloto sem credencial; a rota exige sessão e responde 401 sem ela. Os dados legais e a prova remota também permanecem pendentes |
| Xiaomi: permissões, tela bloqueada, rede offline e bateria | Exigem aparelho real; modelo ainda desconhecido |
| Instalação, GPS e aceitação humana | Não executados |

Conclusão: preparação de bancada verificável, com provas adicionais ainda pendentes. Não há base para declarar o produto inteiro 10/10 ou pronto para operação.

## Próxima sequência

1. Conferir o novo CI e o manifesto do pacote gerado.
2. Projetar e testar autenticação específica para o aceite remoto do termo. A delegação atual é exclusiva de eventos; não reutilizar seu token ampliando escopo silenciosamente.
3. Definir/verificar o ambiente HTTPS, a assinatura e os campos operacionais do termo; apresentar um ensaio concreto para revisão.
4. Conferir modelo/Android do Xiaomi quando estiver disponível.
5. Executar o gate de campo sob as autorizações correspondentes, registrando APK, identidade, aceite/recusa, sincronização e parada.

Não foram criados servidor público, banco operacional, chave de assinatura de campo, cadastro de motoboy ou coleta GPS nesta preparação.
