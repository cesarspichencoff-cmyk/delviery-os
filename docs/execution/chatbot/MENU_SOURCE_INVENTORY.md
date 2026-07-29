# Inventário de fontes de cardápio

Data da verificação: 29/07/2026.

Este inventário registra proveniência e lacunas. Ele não escolhe uma fonte
canônica por recência, não altera originais e não une salão, iFood, delivery
próprio ou unidades.

| ID | Fonte | Local/formato | Canal e unidade | Autoridade | Conteúdo observado | Lacunas e conflitos |
|---|---|---|---|---|---|---|
| `menu-source-internal-list-v1` | Lista fonte TATÁ | `data/cardapio_fonte.txt`, texto, 23.594 bytes | não codificados | fonte interna histórica | 217 linhas de nomes e descrições | canal, unidade, preço, disponibilidade e alergênicos ausentes |
| `menu-source-operational-seed-v1` | Seed de conhecimento | `data/cardapio_knowledge_seed.json`, JSON, 305.679 bytes | transversal, não comercial | derivada da lista por regras do projeto | 199 itens, categorias e sinais operacionais | ingredientes derivados não são ficha técnica; 24 descrições ausentes e 8 revisões manuais registradas |
| `menu-source-seed-audit-v1` | Auditoria da seed | `docs/Auditoria_Cardapio_Conhecimento.md`, Markdown | transversal | auditoria interna | qualidade, duplicidades e lacunas | não confirma composição comercial |
| `menu-source-operational-architecture-v1` | Arquitetura de conhecimento | `docs/Arquitetura_Conhecimento_Cardapio.md`, Markdown | operação | arquitetura interna | modelo de praça e produção | não é cardápio de atendimento |
| `menu-source-public-links-v1` | Catálogo público operacional | `src/conversation-crm/native/catalogs/TATA_OPERATIONAL_PUBLIC_INFO_V1.json`, JSON | Itaim; links separados por canal | confirmado por César em 26/07/2026 | link curto/institucional, salão e delivery próprio | iFood é declarado disponível, mas sem URL no catálogo |
| `menu-source-deliveryos-page-v1` | Página existente do DeliveryOS | `app-v1/app.js`, JavaScript | fonte atual e simulada | superfície consumidora | carrega a seed operacional | não é fonte autônoma nem catálogo comercial |
| `menu-source-project-docx-v1` | Projeto Cardápio e Sugestões (Alimentos e Bebidas) | anexo externo fora do repositório, DOCX, 34.031 bytes, 13 páginas | principalmente salão; unidade e vigência não codificadas | fonte oficial interna fornecida por César; revisão operacional pendente | descrições, categorias, bebidas e cerca de 70 sugestões de harmonização | sem preços, disponibilidade, unidade, validade ou garantia de alergênicos; nomes e sugestões apresentam divergências |
| `menu-source-live-menu-v1` | Live Menu Tagme | URL pública `https://livemenu.app/menu/6407492af6880700523699bf?cross_session=done` | salão, Tatá Sushi Itaim Bibi | página pública acessível | sequência Tatá, cursos, combinados e preços visíveis na consulta | página exibiu aviso parcial de falha de carregamento; conteúdo não foi importado |
| `menu-source-short-link-v1` | Link recomendado ao cliente | URL pública `https://abre.ai/ni3n` | salão, Itaim | link do catálogo confirmado | redirecionou ao Live Menu acima | depende de redirecionador externo |
| `menu-source-own-delivery-v1` | Neemo / DeliveryApp | URL pública `https://loja.neemo.com.br/tatasushi` | delivery próprio, unidade da Rua João Cachoeira | página pública acessível | categorias comerciais separadas e estado de funcionamento | itens, preços e disponibilidade não foram importados |
| `menu-source-ifood-v1` | iFood Tatá Sushi | URL pública localizada para Tatá Sushi Vila Nova Conceição | iFood, Vila Nova Conceição | resultado público localizado | identidade da loja e URL pública | o iFood impediu leitura direta nesta verificação; nenhum item ou preço foi confirmado |

## Integridade das fontes internas

| Fonte | SHA-256 |
|---|---|
| `data/cardapio_fonte.txt` | `c9322334c073c9439ba799739a7c6e9e53d3a6a87067c6a3ed4eb86585d36bc4` |
| `data/cardapio_knowledge_seed.json` | `0f84415708e7364a6a6f2f537e6884bcdf415ff4139eb8855ee5227ed785f4df` |
| `docs/Auditoria_Cardapio_Conhecimento.md` | `ffd8cb4d5fb34a3e292892bb814fdc80939609430fb15d02ae880bd486feb630` |
| `docs/Arquitetura_Conhecimento_Cardapio.md` | `883c20247b483c57a15c00122a77f5c42f9215b3551eb1c94e1a89e67392e3ed` |
| catálogo público | `db75aafeb4ff863b811a74da0b6a74794b03e80de7877d81ad1f11111ce1d982` |
| anexo DOCX externo | `f8b01ba855e689176fdc684b065deb7bace86751dc6e1b310d3478273dbbec4d` |

## Divergências que exigem revisão humana

- “Glúten-Free Gourmets” menciona tempurá; a classificação não pode ser usada
  como garantia de segurança.
- “Veggie Power” menciona guioza sem recheio confirmado.
- Há itens citados em sugestões que não aparecem com a mesma identidade na
  lista principal, incluindo variantes “Vegan”, “By Luizinho” e baterás.
- Grafias e identidades divergem em exemplos como `Shimeji/Shitake`,
  `Yellowtail/Yelowtail` e nomes de saquês.
- Uma bebida aparece tratada como saquê em uma sugestão sem confirmação
  estrutural.
- Preço, composição e disponibilidade públicos não podem ser transportados
  entre salão, iFood e delivery próprio.

## Política de uso nesta mudança

O catálogo inicial usa apenas fixtures sintéticas e registros de fonte
revisáveis. Nenhuma descrição, ingrediente, preço ou harmonização do anexo é
promovido automaticamente a `confirmed`. A implementação definitiva da
curadoria depende de revisão humana e de dados por canal/unidade.
