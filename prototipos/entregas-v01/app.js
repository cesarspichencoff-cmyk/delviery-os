/**
 * Entregas V0.1 — protótipo visual interativo
 * Missão 2B · contratos 2A preservados · sem dados reais
 */
(function () {
  "use strict";

  const STAGES = [
    "PREPARAÇÃO",
    "CONFERÊNCIA",
    "HANDOFF",
    "SAÍDA",
    "PARADAS",
    "TENTATIVAS",
    "EXCEÇÕES",
    "RETORNO",
    "RECONCILIAÇÃO",
    "FECHAMENTO"
  ];

  const EXCEPTIONS = [
    { code: "E01", label: "Cliente não atendeu" },
    { code: "E02", label: "Endereço incorreto" },
    { code: "E03", label: "Dificuldade de acesso" },
    { code: "E04", label: "Cliente pediu espera" },
    { code: "E05", label: "Entrega recusada" },
    { code: "E06", label: "Avaria" },
    { code: "E07", label: "Volume divergente" },
    { code: "E08", label: "Segurança" },
    { code: "E09", label: "Retorno necessário" },
    { code: "E10", label: "Outro" }
  ];

  /** stageIndex 0–9; stageState: done | now | pending | blocked | provisional */
  function stagesFrom(idx, special) {
    return STAGES.map((name, i) => {
      let st = "pending";
      if (i < idx) st = "done";
      else if (i === idx) st = special || "now";
      return { name, st };
    });
  }

  const SCENARIOS = {
    prep3: {
      id: "prep3",
      name: "1 · Preparação com três entregas",
      conn: "online",
      queues: { block: 1, ready: 2, route: 1, action: 1, return: 0, close: 1, sync: 0 },
      insight: "Em poucos segundos: o que está bloqueado, o que está pronto, o que está em rota e o que ainda não fechou.",
      boardExtra: [
        { id: "V-1038", statusLabel: "Em rota", badge: "badge-live", lineClass: "", rider: "Ana", n: 2, note: "1 de 2 paradas" },
        { id: "V-1040", statusLabel: "Bloqueada · volumes", badge: "badge-amber", lineClass: "blocked", rider: "Marcos", n: 2, note: "não pode sair" },
        { id: "V-1035", statusLabel: "Fechamento pendente", badge: "badge-amber", lineClass: "pending-close", rider: "Bruno", n: 3, note: "retorno provisório" }
      ],
      trip: {
        id: "V-1042",
        rider: "Aguardando entregador disponível",
        status: "preparing",
        statusLabel: "Em preparação",
        lineClass: "",
        badge: "badge-muted",
        stages: stagesFrom(0),
        volumes: { expected: 5, checked: 5, handed: 0, received: 0, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-81", label: "Itaim · 2 vol", state: "pending", ref: "R. Joaquim Floriano, 100 — ap 42" },
          { id: "D-82", label: "Itaim · 1 vol", state: "pending", ref: "Al. Santos, 2200 — portaria" },
          { id: "D-83", label: "Jardins · 2 vol", state: "pending", ref: "R. Augusta, 1500 — loja" }
        ],
        timeline: [
          { t: "19:02", text: "Viagem criada", kind: "fact" },
          { t: "19:03", text: "Três entregas adicionadas · ordem definida", kind: "fact" },
          { t: "19:04", text: "Volumes esperados: 5 · conferência em andamento", kind: "provisional" }
        ],
        desktopActions: ["atribuir", "volumes", "ordenar"],
        mobile: {
          kicker: "Preparação na loja",
          title: "Aguardando liberação",
          ref: "Expedição monta a viagem V-1042.",
          vol: "Esperados: 5 volumes · 3 paradas",
          cta: null,
          secondary: []
        }
      }
    },
    volDiv: {
      id: "volDiv",
      name: "2 · Divergência de volume",
      conn: "online",
      queues: { block: 1, ready: 0, route: 0, action: 1, return: 0, close: 0, sync: 0 },
      insight: "São esperados 3 volumes, mas apenas 2 foram conferidos. A viagem não pode sair até corrigir.",
      insightClass: "warn",
      trip: {
        id: "V-1043",
        rider: "Marcos (disponível)",
        status: "assigned",
        statusLabel: "Bloqueada · volumes",
        lineClass: "blocked",
        badge: "badge-amber",
        stages: stagesFrom(1, "blocked"),
        volumes: { expected: 3, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        divergence: true,
        blocked: true,
        stops: [
          { id: "D-90", label: "Mooca · 2 vol", state: "pending", ref: "R. da Mooca, 400" },
          { id: "D-91", label: "Mooca · 1 vol", state: "pending", ref: "R. Borges, 88" }
        ],
        timeline: [
          { t: "19:10", text: "Entregador atribuído (disponível, não só na loja)", kind: "fact" },
          { t: "19:12", text: "Divergência de volumes · saída bloqueada", kind: "amber" }
        ],
        desktopActions: ["volumes", "override"],
        mobile: {
          kicker: "Antes de sair",
          title: "Volumes não batem",
          ref: "A loja precisa conferir de novo antes de liberar a saída.",
          vol: "Esperados: 3 · Conferidos: 2",
          cta: { id: "wait", label: "Aguardar liberação" },
          secondary: [{ id: "exception", label: "Registrar observação" }]
        }
      }
    },
    awaitRider: {
      id: "awaitRider",
      name: "3 · Aguardando entregador",
      conn: "online",
      queues: { block: 0, ready: 1, route: 0, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Viagem montada e conferida. Só quem está disponível — não apenas na loja — pode sair.",
      trip: {
        id: "V-1044",
        rider: "—",
        status: "preparing",
        statusLabel: "Aguardando entregador",
        lineClass: "",
        badge: "badge-muted",
        stages: stagesFrom(0),
        volumes: { expected: 4, checked: 4, handed: 0, received: 0, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-92", label: "Lapa · 2 vol", state: "pending", ref: "R. Clélia, 1200" },
          { id: "D-93", label: "Lapa · 2 vol", state: "pending", ref: "R. Titia, 50" }
        ],
        timeline: [
          { t: "19:15", text: "Ordem definida · volumes conferidos", kind: "fact" },
          { t: "19:16", text: "Aguardando entregador disponível", kind: "provisional" }
        ],
        desktopActions: ["atribuir"],
        mobile: {
          kicker: "Fila da loja",
          title: "Sem viagem atribuída",
          ref: "Quando houver viagem, a próxima ação aparece aqui.",
          vol: "—",
          cta: null,
          secondary: []
        }
      }
    },
    handoff: {
      id: "handoff",
      name: "4 · Handoff confirmado",
      conn: "online",
      queues: { block: 0, ready: 1, route: 0, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Handoff loja → entregador confirmado dos dois lados. Saída liberada.",
      trip: {
        id: "V-1045",
        rider: "Ana",
        status: "ready_to_depart",
        statusLabel: "Pronta para sair",
        lineClass: "",
        badge: "badge-live",
        stages: stagesFrom(3),
        volumes: { expected: 3, checked: 3, handed: 3, received: 3, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-94", label: "Pinheiros · 2 vol", state: "pending", ref: "R. dos Pinheiros, 800" },
          { id: "D-95", label: "Pinheiros · 1 vol", state: "pending", ref: "R. Teodoro, 300" }
        ],
        timeline: [
          { t: "19:18", text: "Volumes entregues no handoff: 3", kind: "fact" },
          { t: "19:18", text: "Recebidos pelo entregador: 3 · aceite confirmado", kind: "fact" }
        ],
        desktopActions: ["saida", "mapa"],
        mobile: {
          kicker: "Handoff ok",
          title: "Pode sair",
          ref: "2 paradas · ordem definida",
          vol: "Esperados: 3 · Com você: 3",
          cta: { id: "depart", label: "Iniciar viagem · registrar saída" },
          secondary: [{ id: "map", label: "Mapa de apoio (opcional)" }]
        }
      }
    },
    inRoute: {
      id: "inRoute",
      name: "5 · Viagem em rota",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Em rota. Saída não é entrega — cada parada pede confirmação.",
      trip: {
        id: "V-1046",
        rider: "Ana",
        status: "in_route",
        statusLabel: "Em rota",
        lineClass: "",
        badge: "badge-live",
        stages: stagesFrom(4),
        volumes: { expected: 3, checked: 3, handed: 3, received: 3, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-94", label: "Parada 1", state: "pending", ref: "R. dos Pinheiros, 800 — ap 12" },
          { id: "D-95", label: "Parada 2", state: "pending", ref: "R. Teodoro, 300" }
        ],
        timeline: [
          { t: "19:20", text: "Saída registrada", kind: "fact" },
          { t: "19:20", text: "Localização da viagem: sessão ativa (não vigilância permanente)", kind: "provisional" }
        ],
        desktopActions: ["mapa"],
        mobile: {
          kicker: "Próxima parada · 1 de 2",
          title: "Entregar",
          ref: "R. dos Pinheiros, 800 — ap 12",
          vol: "2 volumes nesta parada",
          cta: { id: "arrive", label: "Confirmar chegada" },
          secondary: [
            { id: "deliver", label: "Confirmar entrega" },
            { id: "exception", label: "Registrar exceção" }
          ]
        }
      }
    },
    delivered: {
      id: "delivered",
      name: "6 · Entrega confirmada",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Primeira parada confirmada de fato — não por silêncio do cliente.",
      trip: {
        id: "V-1046",
        rider: "Ana",
        status: "partially_completed",
        statusLabel: "Parcialmente concluída",
        lineClass: "",
        badge: "badge-live",
        stages: stagesFrom(4),
        volumes: { expected: 3, checked: 3, handed: 3, received: 3, delivered: 2, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-94", label: "Parada 1", state: "done", ref: "Confirmada · 2 volumes" },
          { id: "D-95", label: "Parada 2", state: "pending", ref: "R. Teodoro, 300" }
        ],
        timeline: [
          { t: "19:28", text: "Chegada na parada 1", kind: "fact" },
          { t: "19:29", text: "Entrega confirmada · 2 volumes ao cliente", kind: "fact" }
        ],
        desktopActions: [],
        mobile: {
          kicker: "Próxima parada · 2 de 2",
          title: "Entregar",
          ref: "R. Teodoro, 300 — portaria",
          vol: "1 volume nesta parada",
          cta: { id: "deliver", label: "Confirmar entrega" },
          secondary: [
            { id: "arrive", label: "Confirmar chegada" },
            { id: "exception", label: "Registrar exceção" }
          ]
        }
      }
    },
    noAnswer: {
      id: "noAnswer",
      name: "7 · Cliente não atende",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 1, return: 0, close: 0, sync: 0 },
      insight: "O cliente não respondeu. A entrega continua aberta — tentativa não encerra.",
      insightClass: "warn",
      trip: {
        id: "V-1047",
        rider: "Bruno",
        status: "in_route",
        statusLabel: "Em rota · tentativa",
        lineClass: "blocked",
        badge: "badge-amber",
        stages: stagesFrom(5, "blocked"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        attempts: [{ at: "19:35", result: "failed", code: "E01", next: "retry ou seguir rota" }],
        stops: [
          { id: "D-100", label: "Parada 1", state: "exception", ref: "R. Harmonia, 55 — tentativa 1" }
        ],
        timeline: [
          { t: "19:35", text: "Tentativa 1 · E01 Cliente não atendeu", kind: "amber" },
          { t: "19:35", text: "Entrega permanece aberta", kind: "provisional" }
        ],
        desktopActions: [],
        mobile: {
          kicker: "Tentativa registrada",
          title: "Cliente não respondeu",
          ref: "A entrega continua aberta. O que fazer agora?",
          vol: "2 volumes ainda com você",
          cta: { id: "retry", label: "Nova tentativa depois" },
          secondary: [
            { id: "continue", label: "Seguir a rota" },
            { id: "return", label: "Retornar à loja" }
          ]
        }
      }
    },
    badAddr: {
      id: "badAddr",
      name: "8 · Endereço incorreto",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 1, return: 0, close: 0, sync: 0 },
      insight: "Endereço não confere. Localização indisponível ou errada não inventa destino.",
      insightClass: "warn",
      trip: {
        id: "V-1048",
        rider: "Bruno",
        status: "in_route",
        statusLabel: "Em rota · exceção",
        lineClass: "blocked",
        badge: "badge-amber",
        stages: stagesFrom(6, "blocked"),
        volumes: { expected: 1, checked: 1, handed: 1, received: 1, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        attempts: [{ at: "19:40", result: "failed", code: "E02", next: "aguardar loja" }],
        stops: [{ id: "D-101", label: "Parada 1", state: "exception", ref: "Ref. incompleta · E02" }],
        timeline: [
          { t: "19:40", text: "Tentativa · E02 Endereço incorreto ou incompleto", kind: "amber" },
          { t: "19:40", text: "Localização indisponível. A viagem pode continuar sob orientação.", kind: "provisional" }
        ],
        desktopActions: ["orientar"],
        mobile: {
          kicker: "Precisa de orientação",
          title: "Endereço não confere",
          ref: "Aguarde a loja ou retorne com o volume.",
          vol: "1 volume",
          cta: { id: "wait_le", label: "Solicitar orientação" },
          secondary: [
            { id: "return", label: "Retornar à loja" },
            { id: "exception", label: "Outra exceção" }
          ]
        }
      }
    },
    damage: {
      id: "damage",
      name: "9 · Avaria",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 1, return: 0, close: 0, sync: 0 },
      insight: "Embalagem danificada. Aceite com ressalva ou retorno — sem relatório longo na rua.",
      insightClass: "warn",
      trip: {
        id: "V-1049",
        rider: "Carla",
        status: "in_route",
        statusLabel: "Em rota · avaria",
        lineClass: "blocked",
        badge: "badge-amber",
        stages: stagesFrom(6, "blocked"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        attempts: [{ at: "19:44", result: "deferred", code: "E06", next: "aceite ou retorno" }],
        stops: [{ id: "D-102", label: "Parada 1", state: "exception", ref: "Al. Lorena, 200 · E06" }],
        timeline: [{ t: "19:44", text: "Exceção E06 · avaria registrada", kind: "amber" }],
        desktopActions: [],
        mobile: {
          kicker: "Avaria",
          title: "Embalagem danificada",
          ref: "Cliente aceitou com ressalva ou recusou?",
          vol: "2 volumes",
          cta: { id: "deliver", label: "Cliente aceitou · confirmar" },
          secondary: [
            { id: "return", label: "Cliente recusou · retornar" },
            { id: "exception", label: "Outra exceção" }
          ]
        }
      }
    },
    refused: {
      id: "refused",
      name: "10 · Entrega recusada",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 1, return: 1, close: 0, sync: 0 },
      insight: "Cliente recusou. O pedido não fica no local — volumes voltam com retorno à loja.",
      insightClass: "warn",
      trip: {
        id: "V-1054",
        rider: "Bruno",
        status: "in_route",
        statusLabel: "Recusa · retorno necessário",
        lineClass: "blocked",
        badge: "badge-amber",
        stages: stagesFrom(6, "blocked"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        attempts: [{ at: "19:48", result: "failed", code: "E05", next: "retorno" }],
        stops: [{ id: "D-150", label: "Parada 1", state: "exception", ref: "Recusada · E05" }],
        timeline: [
          { t: "19:48", text: "Tentativa · E05 Entrega recusada", kind: "amber" },
          { t: "19:48", text: "Volumes devem retornar à loja", kind: "amber" }
        ],
        desktopActions: [],
        mobile: {
          kicker: "Recusa",
          title: "Cliente recusou receber",
          ref: "Não deixe o pedido. Inicie o retorno com os volumes.",
          vol: "2 volumes a devolver",
          cta: { id: "return", label: "Registrar retorno à loja" },
          secondary: [{ id: "exception", label: "Ajustar motivo" }]
        }
      }
    },
    partial: {
      id: "partial",
      name: "11 · Viagem parcialmente concluída",
      conn: "online",
      queues: { block: 0, ready: 0, route: 1, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Duas paradas confirmadas, uma ainda aberta. Progresso real na linha da viagem.",
      trip: {
        id: "V-1050",
        rider: "Ana",
        status: "partially_completed",
        statusLabel: "Parcialmente concluída",
        lineClass: "",
        badge: "badge-live",
        stages: stagesFrom(4),
        volumes: { expected: 5, checked: 5, handed: 5, received: 5, delivered: 4, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-110", label: "1", state: "done", ref: "Entregue" },
          { id: "D-111", label: "2", state: "done", ref: "Entregue" },
          { id: "D-112", label: "3", state: "pending", ref: "R. Haddock, 500" }
        ],
        timeline: [{ t: "19:50", text: "2 de 3 paradas com entrega confirmada", kind: "fact" }],
        desktopActions: [],
        mobile: {
          kicker: "Parada 3 de 3",
          title: "Entregar",
          ref: "R. Haddock, 500 — sala 3",
          vol: "1 volume",
          cta: { id: "deliver", label: "Confirmar entrega" },
          secondary: [{ id: "exception", label: "Registrar exceção" }]
        }
      }
    },
    offline: {
      id: "offline",
      name: "12 · Offline",
      conn: "offline",
      queues: { block: 0, ready: 0, route: 1, action: 0, return: 0, close: 0, sync: 1 },
      insight: "Salvo no aparelho. Será enviado quando a conexão voltar. Isso não é falha do entregador.",
      insightClass: "tech",
      trip: {
        id: "V-1051",
        rider: "Diego",
        status: "in_route",
        statusLabel: "Em rota · offline",
        lineClass: "tech-state",
        badge: "badge-tech",
        stages: stagesFrom(4, "provisional"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 1, returned: 0 },
        divergence: false,
        blocked: false,
        pendingSync: 2,
        stops: [
          { id: "D-120", label: "1", state: "done", ref: "Confirmada no aparelho" },
          { id: "D-121", label: "2", state: "pending", ref: "R. Cardeal, 90" }
        ],
        timeline: [
          { t: "19:55", text: "Entrega D-120 · evento salvo no aparelho", kind: "provisional" },
          { t: "19:55", text: "2 eventos aguardando sincronização", kind: "provisional" }
        ],
        desktopActions: [],
        mobile: {
          kicker: "Sem conexão",
          title: "Continuar a rota",
          ref: "R. Cardeal, 90",
          vol: "1 volume restante",
          syncMsg: "Salvo no aparelho. Será enviado quando a conexão voltar.",
          cta: { id: "deliver", label: "Confirmar entrega" },
          secondary: [{ id: "exception", label: "Registrar exceção" }]
        }
      }
    },
    pendingSync: {
      id: "pendingSync",
      name: "13 · Evento aguardando sincronização",
      conn: "unstable",
      queues: { block: 0, ready: 0, route: 1, action: 0, return: 0, close: 0, sync: 1 },
      insight: "Conexão instável. Há eventos no aparelho ainda não confirmados no sistema da loja.",
      insightClass: "tech",
      trip: {
        id: "V-1051b",
        rider: "Diego",
        status: "in_route",
        statusLabel: "Aguardando sync",
        lineClass: "tech-state",
        badge: "badge-tech",
        stages: stagesFrom(4, "provisional"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        divergence: false,
        blocked: false,
        pendingSync: 3,
        stops: [
          { id: "D-120", label: "1", state: "done", ref: "Ok no aparelho" },
          { id: "D-121", label: "2", state: "done", ref: "Ok no aparelho" }
        ],
        timeline: [
          { t: "20:00", text: "3 eventos aguardando sincronização", kind: "provisional" }
        ],
        desktopActions: [],
        mobile: {
          kicker: "Conexão instável",
          title: "Paradas feitas no aparelho",
          ref: "A loja ainda não recebeu tudo.",
          vol: "—",
          syncMsg: "3 eventos aguardando sincronização",
          cta: { id: "return", label: "Registrar retorno" },
          secondary: []
        }
      }
    },
    syncing: {
      id: "syncing",
      name: "14 · Sincronizando",
      conn: "syncing",
      queues: { block: 0, ready: 0, route: 1, action: 0, return: 0, close: 0, sync: 1 },
      insight: "Enviando o que estava no aparelho — sem perda silenciosa.",
      insightClass: "tech",
      trip: {
        id: "V-1051",
        rider: "Diego",
        status: "in_route",
        statusLabel: "Sincronizando",
        lineClass: "tech-state",
        badge: "badge-tech",
        stages: stagesFrom(4, "provisional"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        divergence: false,
        blocked: false,
        pendingSync: 1,
        stops: [
          { id: "D-120", label: "1", state: "done", ref: "Ok" },
          { id: "D-121", label: "2", state: "done", ref: "Ok · enviando" }
        ],
        timeline: [{ t: "20:01", text: "Sincronização em andamento", kind: "provisional" }],
        desktopActions: [],
        mobile: {
          kicker: "Enviando",
          title: "Sincronizando",
          ref: "Paradas concluídas no aparelho.",
          vol: "—",
          syncMsg: "Sincronizando 1 evento…",
          cta: { id: "return", label: "Registrar retorno" },
          secondary: []
        }
      }
    },
    conflict: {
      id: "conflict",
      name: "15 · Conflito de sincronização",
      conn: "online",
      queues: { block: 0, ready: 0, route: 0, action: 1, return: 0, close: 1, sync: 1 },
      insight: "Duas versões do mesmo evento. Resolução humana na mesa — sem auto-merge sensível.",
      insightClass: "tech",
      trip: {
        id: "V-1052",
        rider: "Elena",
        status: "under_review",
        statusLabel: "Conflito · revisão",
        lineClass: "tech-state",
        badge: "badge-tech",
        stages: stagesFrom(9, "blocked"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        divergence: false,
        blocked: true,
        conflict: true,
        stops: [{ id: "D-130", label: "1", state: "done", ref: "Conflito no horário de confirmação" }],
        timeline: [
          { t: "20:05", text: "Conflito de sincronização em D-130", kind: "provisional" },
          { t: "—", text: "Hipótese: relógio do aparelho dessincronizado", kind: "provisional" }
        ],
        desktopActions: ["resolver"],
        mobile: {
          kicker: "Aguarde a loja",
          title: "Há um conflito",
          ref: "Sua ação foi salva. A expedição vai conferir.",
          vol: "—",
          syncMsg: "Conflito · resolução na mesa de expedição",
          syncClass: "amber",
          cta: { id: "wait_le", label: "Entendi" },
          secondary: []
        }
      }
    },
    returning: {
      id: "returning",
      name: "16 · Retorno à loja",
      conn: "online",
      queues: { block: 0, ready: 0, route: 0, action: 0, return: 1, close: 0, sync: 0 },
      insight: "Retorno com volumes. Ainda não está disponível para nova viagem até o handoff de volta.",
      trip: {
        id: "V-1053",
        rider: "Ana",
        status: "returning",
        statusLabel: "Retornando",
        lineClass: "",
        badge: "badge-live",
        stages: stagesFrom(7),
        volumes: { expected: 4, checked: 4, handed: 4, received: 4, delivered: 3, returned: 1 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-140", label: "1", state: "done", ref: "Ok" },
          { id: "D-141", label: "2", state: "done", ref: "Ok" },
          { id: "D-142", label: "3", state: "exception", ref: "Recusada · volume volta" }
        ],
        timeline: [
          { t: "20:10", text: "Retorno solicitado · motivo E05", kind: "fact" },
          { t: "20:10", text: "1 volume a devolver no handoff da loja", kind: "provisional" }
        ],
        desktopActions: ["receber"],
        mobile: {
          kicker: "Retorno",
          title: "Voltar à loja",
          ref: "Entregar 1 volume na expedição (handoff de volta).",
          vol: "Entregues 3 · retorno 1",
          cta: { id: "arrive_store", label: "Cheguei na loja" },
          secondary: []
        }
      }
    },
    closePending: {
      id: "closePending",
      name: "17 · Fechamento pendente",
      conn: "online",
      queues: { block: 0, ready: 0, route: 0, action: 1, return: 0, close: 1, sync: 0 },
      insight: "Retorno informado, mas falta confirmar na loja e reconciliar volumes. Não está encerrada.",
      insightClass: "warn",
      trip: {
        id: "V-1053",
        rider: "Ana",
        status: "returning",
        statusLabel: "Fechamento pendente",
        lineClass: "pending-close",
        badge: "badge-amber",
        stages: stagesFrom(8, "blocked"),
        volumes: { expected: 4, checked: 4, handed: 4, received: 4, delivered: 3, returned: 1 },
        divergence: false,
        blocked: false,
        returnProvisional: true,
        closeState: "pending",
        stops: [
          { id: "D-140", label: "1", state: "done", ref: "Ok" },
          { id: "D-141", label: "2", state: "done", ref: "Ok" },
          { id: "D-142", label: "3", state: "exception", ref: "Retorno" }
        ],
        timeline: [
          { t: "20:18", text: "Chegada na loja informada", kind: "provisional" },
          { t: "—", text: "Pendente: handoff de volta + reconciliação de volumes", kind: "amber" }
        ],
        desktopActions: ["fechar", "receber"],
        mobile: {
          kicker: "Na loja",
          title: "Aguardando conferência",
          ref: "Retorno ainda não confirmado. Viagem não está fechada.",
          vol: "Devolver 1 volume na mesa",
          cta: { id: "wait_le", label: "Aguardar conferência" },
          secondary: []
        }
      }
    },
    closed: {
      id: "closed",
      name: "18 · Viagem encerrada",
      conn: "online",
      queues: { block: 0, ready: 0, route: 0, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Viagem encerrada e conferida. Só agora o entregador pode ficar disponível de novo.",
      trip: {
        id: "V-1053",
        rider: "Ana · disponível",
        status: "completed",
        statusLabel: "Encerrada e conferida",
        lineClass: "closed",
        badge: "badge-solid",
        stages: stagesFrom(10).map((s, i) => ({ ...s, st: i < 10 ? "done" : "done" })),
        volumes: { expected: 4, checked: 4, handed: 4, received: 4, delivered: 3, returned: 1 },
        divergence: false,
        blocked: false,
        closeState: "closed",
        stops: [
          { id: "D-140", label: "1", state: "done", ref: "Confirmada" },
          { id: "D-141", label: "2", state: "done", ref: "Confirmada" },
          { id: "D-142", label: "3", state: "done", ref: "Retornada · reconciliada" }
        ],
        timeline: [
          { t: "20:22", text: "Handoff de volta · volume recebido na loja", kind: "fact" },
          { t: "20:22", text: "Volumes reconciliados · viagem encerrada e conferida", kind: "fact" }
        ],
        desktopActions: [],
        mobile: {
          kicker: "Concluído",
          title: "Viagem encerrada e conferida",
          ref: "Você está disponível para nova viagem quando a loja atribuir.",
          vol: "3 entregues · 1 devolvido",
          syncMsg: "Tudo sincronizado",
          syncClass: "ok",
          cta: null,
          secondary: []
        }
      }
    },
    openIncident: {
      id: "openIncident",
      name: "19 · Ocorrência ainda aberta",
      conn: "online",
      queues: { block: 0, ready: 0, route: 0, action: 1, return: 0, close: 0, sync: 0 },
      insight: "Viagem pode estar encerrada no transporte, mas a ocorrência segue em tratamento na loja.",
      insightClass: "warn",
      trip: {
        id: "V-1055",
        rider: "Carla · disponível",
        status: "completed",
        statusLabel: "Encerrada · ocorrência aberta",
        lineClass: "closed",
        badge: "badge-amber",
        stages: stagesFrom(9, "blocked"),
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        divergence: false,
        blocked: false,
        closeState: "closed_open_incident",
        openIncident: "E06 · cliente aceitou com ressalva · LE em análise",
        stops: [
          { id: "D-160", label: "1", state: "done", ref: "Entregue com ressalva" }
        ],
        timeline: [
          { t: "20:25", text: "Viagem encerrada e volumes ok", kind: "fact" },
          { t: "20:25", text: "Ocorrência E06 ainda aberta · não esconder", kind: "amber" }
        ],
        desktopActions: ["ocorrencia"],
        mobile: {
          kicker: "Viagem ok",
          title: "Ocorrência com a loja",
          ref: "Sua parte na rota terminou. A loja segue com a ocorrência.",
          vol: "2 entregues",
          cta: null,
          secondary: []
        }
      }
    },
    reissue: {
      id: "reissue",
      name: "20 · Reenvio vinculado",
      conn: "online",
      queues: { block: 0, ready: 1, route: 0, action: 0, return: 0, close: 0, sync: 0 },
      insight: "Nova entrega com novo ID, ligada à original. Financeiro não passa por Entregas.",
      trip: {
        id: "V-1060",
        rider: "—",
        status: "preparing",
        statusLabel: "Reenvio · montagem",
        lineClass: "",
        badge: "badge-muted",
        stages: stagesFrom(0),
        volumes: { expected: 1, checked: 1, handed: 0, received: 0, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        reissueOf: "D-142",
        stops: [
          {
            id: "D-142b",
            label: "Reenvio",
            state: "pending",
            ref: "Novo delivery_id D-142b · origem D-142 · mesma ref operacional"
          }
        ],
        timeline: [
          { t: "20:30", text: "Decisão de reenvio registrada (fora do Caixa)", kind: "fact" },
          { t: "20:30", text: "D-142b vinculada a D-142", kind: "fact" }
        ],
        desktopActions: ["atribuir"],
        mobile: {
          kicker: "Reenvio",
          title: "Aguardando atribuição",
          ref: "Quando atribuída, a próxima ação aparece aqui.",
          vol: "1 volume",
          cta: null,
          secondary: []
        }
      }
    }
  };

  // fix closed stages - all done
  SCENARIOS.closed.trip.stages = STAGES.map((name) => ({ name, st: "done" }));

  const state = {
    view: "desktop",
    scenarioId: "prep3",
    mapOpen: false,
    volumeStep: 0
  };

  const el = (id) => document.getElementById(id);

  function toast(msg) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.add("is-show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("is-show"), 3000);
  }

  function connLabel(c) {
    if (c === "offline") return { text: "Offline", cls: "offline" };
    if (c === "syncing") return { text: "Sincronizando", cls: "syncing" };
    if (c === "unstable") return { text: "Instável", cls: "unstable" };
    return { text: "Conectado", cls: "" };
  }

  function stopClass(s) {
    if (s.state === "done") return "done confirmed";
    if (s.state === "exception") return "exception";
    return "pending";
  }

  function renderQueues(q) {
    const items = [
      { label: "Não pode sair", n: q.block, cls: q.block ? "needs-action" : "" },
      { label: "Pronta / fila loja", n: q.ready, cls: "" },
      { label: "Em rota", n: q.route, cls: "" },
      { label: "Exige ação", n: q.action, cls: q.action ? "needs-action" : "" },
      { label: "Em retorno", n: q.return, cls: "" },
      { label: "Fechamento pendente", n: q.close, cls: q.close ? "needs-action" : "" },
      { label: "Sync / técnico", n: q.sync, cls: q.sync ? "tech" : "" }
    ];
    el("queues").innerHTML =
      "<h2>Filas da mesa</h2>" +
      items
        .map(
          (i) =>
            `<div class="queue-chip ${i.cls}" role="status">
              <strong>${i.label}</strong><span>${i.n}</span>
            </div>`
        )
        .join("");
  }

  function renderStageRail(stages) {
    if (!stages) return "";
    return (
      `<div class="stage-rail" aria-label="Linha da viagem">` +
      stages
        .map((s) => {
          const cls =
            s.st === "done"
              ? "done"
              : s.st === "now"
                ? "now"
                : s.st === "blocked"
                  ? "blocked"
                  : s.st === "provisional"
                    ? "provisional"
                    : "pending";
          return `<span class="stage-pill ${cls}">${s.name}</span>`;
        })
        .join(`<span class="stage-arrow" aria-hidden="true">→</span>`) +
      `</div>`
    );
  }

  function renderStops(stops) {
    return stops
      .map((s, i) => {
        const node = `<span class="stop-node ${stopClass(s)}"><span class="dot" aria-hidden="true"></span>${s.label}</span>`;
        const conn = i < stops.length - 1 ? `<span class="stop-connector" aria-hidden="true"></span>` : "";
        return node + conn;
      })
      .join("");
  }

  function volSummary(v, divergence) {
    let t = `Esperados: ${v.expected}`;
    t += ` · Conferidos: ${v.checked}`;
    if (v.handed) t += ` · Handoff: ${v.handed}`;
    if (v.received) t += ` · Rider: ${v.received}`;
    if (v.delivered) t += ` · Cliente: ${v.delivered}`;
    if (v.returned) t += ` · Retorno: ${v.returned}`;
    if (divergence) t += " · divergência";
    return t;
  }

  function kindClass(k) {
    if (k === "amber") return "amber";
    if (k === "provisional") return "provisional";
    if (k === "fact") return "fact";
    return k || "";
  }

  function renderTripCard(trip, selected) {
    return `
      <article class="trip-line ${trip.lineClass || ""} ${selected ? "is-selected" : ""}" tabindex="0" data-focus-trip="1">
        <div class="trip-head">
          <span class="id">${trip.id}</span>
          <span class="badge ${trip.badge}">${trip.statusLabel}</span>
          <span class="rider">${trip.rider}</span>
          ${trip.reissueOf ? `<span class="badge badge-muted">reenvio de ${trip.reissueOf}</span>` : ""}
          ${trip.conflict ? `<span class="badge badge-tech">conflito</span>` : ""}
          ${trip.returnProvisional ? `<span class="badge badge-amber">retorno provisório</span>` : ""}
          ${trip.closeState === "closed_open_incident" ? `<span class="badge badge-amber">ocorrência aberta</span>` : ""}
          ${trip.blocked && trip.divergence ? `<span class="badge badge-amber">saída bloqueada</span>` : ""}
        </div>
        ${selected ? renderStageRail(trip.stages) : ""}
        <div class="stops-rail" aria-label="Paradas">${renderStops(trip.stops)}</div>
        <div class="trip-meta">
          <span><strong>${trip.stops.length}</strong> entregas</span>
          <span>${volSummary(trip.volumes, trip.divergence)}</span>
          ${trip.pendingSync ? `<span><strong>${trip.pendingSync}</strong> aguardando envio</span>` : ""}
          ${trip.openIncident ? `<span>${trip.openIncident}</span>` : ""}
        </div>
      </article>`;
  }

  function renderBoardExtra(list) {
    if (!list || !list.length) return "";
    return list
      .map(
        (t) => `
      <article class="trip-line ${t.lineClass} trip-line-secondary" aria-label="Outra viagem">
        <div class="trip-head">
          <span class="id">${t.id}</span>
          <span class="badge ${t.badge}">${t.statusLabel}</span>
          <span class="rider">${t.rider}</span>
        </div>
        <div class="trip-meta"><span>${t.n} entregas</span><span>${t.note}</span></div>
      </article>`
      )
      .join("");
  }

  function renderDesktop(sc) {
    const trip = sc.trip;
    renderQueues(sc.queues);
    el("desktop-insight").className = "insight " + (sc.insightClass || "");
    el("desktop-insight").textContent = sc.insight;

    el("trip-list").innerHTML =
      renderBoardExtra(sc.boardExtra) + renderTripCard(trip, true);

    const tl = trip.timeline
      .map((x) => `<li class="${kindClass(x.kind)}"><strong>${x.t}</strong> — ${x.text}</li>`)
      .join("");

    const attempts = (trip.attempts || [])
      .map(
        (a) =>
          `<li class="amber"><strong>${a.at}</strong> — Tentativa · ${a.code} · ${a.result} · próxima: ${a.next}</li>`
      )
      .join("");

    const mapActs = {
      atribuir: ["atribuir", "Atribuir entregador disponível", "btn-primary"],
      volumes: ["volumes", "Conferir / corrigir volumes", trip.divergence ? "btn-amber" : "btn-secondary"],
      ordenar: ["ordenar", "Ordenar paradas", "btn-secondary"],
      saida: ["depart", "Registrar saída", "btn-primary"],
      mapa: ["map", "Mapa de apoio", "btn-ghost"],
      override: ["override", "Override LE (audit)", "btn-amber"],
      orientar: ["orientar", "Enviar orientação", "btn-primary"],
      resolver: ["resolver", "Resolver conflito", "btn-primary"],
      fechar: ["fechar", "Confirmar fechamento real", "btn-primary"],
      receber: ["receber", "Receber handoff de volta", "btn-primary"],
      ocorrencia: ["ocorrencia", "Tratar ocorrência aberta", "btn-amber"]
    };
    const actions = (trip.desktopActions || [])
      .map((a) => {
        const m = mapActs[a];
        return m ? `<button type="button" class="btn ${m[2]}" data-act="${m[0]}">${m[1]}</button>` : "";
      })
      .join("");

    let closeHint = "";
    if (trip.closeState === "pending" || trip.returnProvisional) {
      closeHint =
        `<div class="insight warn">Fechamento pendente — há pendência operacional visível. Não usar “concluir” escondendo gaps.</div>`;
    } else if (trip.closeState === "closed_open_incident") {
      closeHint = `<div class="insight warn">Encerrada no transporte · ocorrência ainda aberta.</div>`;
    } else if (trip.status === "completed" && !trip.openIncident) {
      closeHint = `<div class="insight">Fechada — tudo confirmado e reconciliado.</div>`;
    }

    el("trip-detail").className = "panel detail is-open";
    el("trip-detail").innerHTML = `
      <h3>Detalhe · ${trip.id}</h3>
      <p class="lede">Linha de confiança: fato confirmado, provisório, offline e conflito não se misturam.</p>
      ${closeHint}
      ${renderStageRail(trip.stages)}
      <h4 class="subh">Linha temporal</h4>
      <ul class="timeline">${tl}${attempts}</ul>
      <div class="actions-row">${actions || "<span class='trip-meta'>Sem ação de mesa neste momento.</span>"}</div>
      <div class="map-drawer ${state.mapOpen ? "is-open" : ""}" id="map-drawer">
        Mapa é apoio contextual — não vigilância. Alternativa textual: ordem das paradas acima.
        <div class="map-fake" role="img" aria-label="Mapa esquemático de apoio, parada atual"></div>
        <p class="map-note">Localização desatualizada? A viagem continua pela lista.</p>
      </div>
    `;
  }

  function renderMobile(sc) {
    const trip = sc.trip;
    const m = trip.mobile;
    const c = connLabel(sc.conn);
    el("phone-conn").className = "conn " + c.cls;
    el("phone-conn").innerHTML = `<span class="pip" aria-hidden="true"></span>${c.text}`;

    let foundNow = false;
    const pips = trip.stops
      .map((s) => {
        if (s.state === "done") return '<i class="done"></i>';
        if (s.state === "exception") return '<i class="ex"></i>';
        if (!foundNow) {
          foundNow = true;
          return '<i class="now"></i>';
        }
        return "<i></i>";
      })
      .join("");

    let sync = "";
    if (m.syncMsg) {
      sync = `<div class="sync-banner ${m.syncClass || ""}">${m.syncMsg}</div>`;
    } else if (sc.conn === "offline") {
      sync = `<div class="sync-banner">Sem conexão. As ações ficam no aparelho.</div>`;
    }

    const cta = m.cta
      ? `<button type="button" class="cta-main" data-act="${m.cta.id}">${m.cta.label}</button>`
      : "";
    const secs = (m.secondary || [])
      .map((s) => {
        const danger = s.id === "exception" || s.id === "return" ? " danger-soft" : "";
        return `<button type="button" class="cta-sec${danger}" data-act="${s.id}">${s.label}</button>`;
      })
      .join("");

    el("phone-body").innerHTML = `
      <div class="phone-trip">Viagem <strong>${trip.id}</strong> · ${trip.statusLabel}</div>
      ${sync}
      <div class="next-card">
        <div class="kicker">${m.kicker}</div>
        <div class="progress-mini" aria-hidden="true">${pips}</div>
        <h2>${m.title}</h2>
        <div class="ref">${m.ref}</div>
        <div class="vol"><strong>Volumes.</strong> ${m.vol}</div>
        <div class="cta-stack">${cta}${secs}</div>
      </div>
    `;
  }

  function render() {
    const sc = SCENARIOS[state.scenarioId];
    el("mesa").classList.toggle("is-active", state.view === "desktop");
    el("mobile-wrap").classList.toggle("is-active", state.view === "mobile");
    el("btn-desktop").setAttribute("aria-pressed", state.view === "desktop" ? "true" : "false");
    el("btn-mobile").setAttribute("aria-pressed", state.view === "mobile" ? "true" : "false");
    el("demo-count").textContent = "20 cenários · dados fictícios · sem GPS real";
    renderDesktop(sc);
    renderMobile(sc);
  }

  function openModal(title, bodyHtml, primaryLabel, onPrimary) {
    el("modal-title").textContent = title;
    el("modal-body").innerHTML = bodyHtml;
    el("modal-primary").textContent = primaryLabel || "Confirmar";
    el("modal-backdrop").classList.add("is-open");
    el("modal-primary").onclick = onPrimary;
  }

  function closeModal() {
    el("modal-backdrop").classList.remove("is-open");
  }

  function openExceptions() {
    const grid = EXCEPTIONS.map(
      (e) => `<button type="button" data-ex="${e.code}">${e.label}</button>`
    ).join("");
    let selected = null;
    openModal(
      "Registrar tentativa / exceção",
      `<p>Motivo rápido. A entrega continua aberta até confirmação ou retorno.</p>
       <div class="exception-grid" id="ex-grid">${grid}</div>
       <textarea id="ex-note" placeholder="Nota opcional (curta)" aria-label="Nota opcional"></textarea>`,
      "Registrar",
      () => {
        if (!selected) {
          toast("Escolha um motivo.");
          return;
        }
        closeModal();
        const map = { E01: "noAnswer", E02: "badAddr", E05: "refused", E06: "damage" };
        if (map[selected]) {
          state.scenarioId = map[selected];
          el("scenario-select").value = map[selected];
          render();
        }
        toast("O cliente não respondeu. A entrega continua aberta.".replace(
          "não respondeu",
          selected === "E05" ? "recusou" : selected === "E06" ? "recebeu com avaria" : "não respondeu"
        ));
      }
    );
    el("ex-grid").onclick = (ev) => {
      const b = ev.target.closest("button[data-ex]");
      if (!b) return;
      selected = b.getAttribute("data-ex");
      el("ex-grid").querySelectorAll("button").forEach((x) => x.classList.remove("is-on"));
      b.classList.add("is-on");
    };
  }

  function openVolumes() {
    const sc = SCENARIOS[state.scenarioId];
    const v = sc.trip.volumes;
    state.volumeStep = 0;
    const steps = [
      {
        title: "1 · Identificar divergência",
        body: `<p>Esperados: <strong>${v.expected}</strong> · Conferidos: <strong>${v.checked}</strong></p>
               <p class="insight warn">A saída permanece bloqueada enquanto os números não baterem.</p>`
      },
      {
        title: "2 · Revisar e corrigir",
        body: `<div class="volume-row"><span>Conferidos na loja</span>
                 <input type="number" id="vol-checked" min="0" max="20" value="${v.checked}" /></div>
               <div class="volume-row"><span>Recebidos pelo entregador</span>
                 <input type="number" id="vol-received" min="0" max="20" value="${v.received || 0}" /></div>`
      },
      {
        title: "3 · Reconfirmar e liberar",
        body: `<p>Confirme que handoff e aceite batem com o esperado (${v.expected}).</p>`
      }
    ];

    function showStep() {
      const s = steps[state.volumeStep];
      openModal(s.title, s.body, state.volumeStep < 2 ? "Continuar" : "Salvar e liberar se ok", () => {
        if (state.volumeStep === 1) {
          const c = Number(el("vol-checked").value);
          const r = Number(el("vol-received").value);
          if (c !== v.expected || r !== v.expected) {
            toast("Ainda há divergência. Corrija antes de liberar a saída.");
            state.scenarioId = "volDiv";
            el("scenario-select").value = "volDiv";
            closeModal();
            render();
            return;
          }
        }
        if (state.volumeStep < 2) {
          state.volumeStep++;
          showStep();
          return;
        }
        closeModal();
        toast("Volumes reconfirmados. Saída liberada.");
        state.scenarioId = "handoff";
        el("scenario-select").value = "handoff";
        render();
      });
    }
    showStep();
  }

  function setScenario(id) {
    state.scenarioId = id;
    el("scenario-select").value = id;
    state.mapOpen = false;
    render();
  }

  function handleAction(act) {
    if (act === "exception") return openExceptions();
    if (act === "volumes") return openVolumes();
    if (act === "map") {
      state.mapOpen = !state.mapOpen;
      if (state.view === "desktop") render();
      else toast("Localização indisponível ou opcional. Use a ordem das paradas e a referência.");
      return;
    }
    if (act === "depart") {
      const t = SCENARIOS[state.scenarioId].trip;
      if (t.blocked || t.divergence) {
        toast("Saída bloqueada: volumes não conferem.");
        return;
      }
      toast("Saída registrada. Sessão de localização da viagem ativa — não é vigilância permanente.");
      setScenario("inRoute");
      return;
    }
    if (act === "arrive") {
      toast("Chegada registrada nesta parada.");
      return;
    }
    if (act === "deliver") {
      toast("Entrega confirmada.");
      if (state.scenarioId === "inRoute") setScenario("delivered");
      else if (state.scenarioId === "delivered" || state.scenarioId === "partial") setScenario("returning");
      else if (state.scenarioId === "offline") toast("Confirmada no aparelho. Será enviada quando a conexão voltar.");
      else if (state.scenarioId === "damage") toast("Entrega com ressalva de avaria.");
      else render();
      return;
    }
    if (act === "return") {
      toast("Retorno à loja com volumes — handoff de volta na chegada.");
      setScenario(state.scenarioId === "refused" ? "returning" : "returning");
      return;
    }
    if (act === "arrive_store") {
      toast("Chegada na loja. Falta handoff de volta e reconciliação.");
      setScenario("closePending");
      return;
    }
    if (act === "receber") {
      toast("Handoff de volta: volumes recebidos pela operação.");
      return;
    }
    if (act === "fechar") {
      toast("Viagem encerrada e conferida.");
      setScenario("closed");
      return;
    }
    if (act === "atribuir") {
      toast("Atribuído a quem está disponível — não apenas na loja.");
      setScenario("volDiv");
      return;
    }
    if (act === "override") {
      toast("Override LE com auditoria. Prefira corrigir volumes.");
      return;
    }
    if (act === "resolver") {
      toast("Conflito resolvido na mesa.");
      setScenario("closed");
      return;
    }
    if (act === "orientar") {
      toast("Orientação enviada ao entregador.");
      return;
    }
    if (act === "ocorrencia") {
      toast("Ocorrência permanece aberta no tratamento da loja.");
      return;
    }
    if (act === "retry") {
      toast("Nova tentativa fica na rota. A entrega continua aberta.");
      return;
    }
    if (act === "continue") {
      toast("Seguindo a rota. Entrega permanece aberta.");
      return;
    }
    if (act === "wait" || act === "wait_le") {
      toast("Aguardando a loja.");
      return;
    }
    if (act === "ordenar") {
      toast("Ordem das paradas atualizada.");
    }
  }

  function init() {
    const sel = el("scenario-select");
    sel.innerHTML = Object.values(SCENARIOS)
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");
    sel.value = state.scenarioId;
    el("btn-desktop").onclick = () => {
      state.view = "desktop";
      render();
    };
    el("btn-mobile").onclick = () => {
      state.view = "mobile";
      render();
    };
    sel.onchange = (e) => setScenario(e.target.value);
    document.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act) handleAction(act.getAttribute("data-act"));
    });
    el("modal-cancel").onclick = closeModal;
    el("modal-backdrop").addEventListener("click", (e) => {
      if (e.target === el("modal-backdrop")) closeModal();
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
