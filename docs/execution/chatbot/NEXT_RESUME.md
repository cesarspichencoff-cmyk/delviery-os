# Retomada única — Mudanças 007+008

- Branch: `feature/customer-menu-intelligence-v1`.
- Base: `0ef86d8086326d9e9f9e059e134cb3d2cc6af605`; upstream ausente.
- Escopo concluído: CRM orientado a eventos, resolução conservadora de identidade, consentimento, importação versionada com prévia/aprovação/rollback compensatório, catálogo multicanal/multiunidade, segurança de alergênicos, recomendação limitada e ferramentas aprovadas para Pattern Engine e Writer.
- Dados: somente clientes, pedidos, unidades e cardápios sintéticos entram no runtime demonstrativo. Fontes reais foram apenas inventariadas; o DOCX original e os arquivos de origem permanecem fora do Git.
- Cardápio: salão, delivery próprio e iFood nunca são unidos silenciosamente. Preço, disponibilidade, ingrediente, alergênico e harmonização exigem origem e estado de revisão.
- Identidade: somente correspondência exata pode resolver automaticamente; provável, possível e conflito exigem revisão humana.
- Consentimento: desconhecido não equivale a permitido; opt-out e retirada prevalecem.
- Pattern Engine decide; ferramentas transportam contexto; Writer não altera fatos, consentimento, origem, alergênicos, preço ou recomendação.
- Painel local: modo `CRM e Cardápio`, com Clientes, Imports, Menu knowledge, Recomendações, Consentimento e Auditoria.
- Testes: foco 58/58; mutações 15/15; Conversation 658/658; catálogo 200/200; privacidade aprovada; Conference 350/350; Live 243/243; Capacidade 43/43; Copiloto 53/53; Playwright 11/11.
- Fontes públicas: links de salão e delivery próprio verificados; URL pública do iFood localizada, porém o conteúdo não pôde ser inspecionado diretamente.
- Instalador anterior: SHA-256 `9ec05a9223e6b1b3ea76bb88d4c29d5a9280750b60b6a9a600841df4c88756c9`, imutável.
- Próximo passo: César executa somente a homologação local de CRM e Cardápio.
- Não fazer: cliente real, importação real, WhatsApp real, migração de produção, preço inferido, alergênico presumido, hospedagem, push, merge, deploy ou instalação no restaurante sem nova autorização.
