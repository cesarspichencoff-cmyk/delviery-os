/**
 * Entregas V0.3 — identidade canônica DeliveryOS V3.3
 * Domínio Trip/Delivery/Handoff + 20 cenários preservados.
 * Visual: organismo (não fios ondulados, não cards SaaS, não dashboard).
 */
(function () {
  "use strict";

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

  const STAGE_KEYS = ["LOJA", "SAÍDA", "RUA", "RETORNO", "FECHAMENTO"];

  /**
   * Progressive disclosure: só momento anterior confirmado, atual e próximo.
   * Mapeia variante/progresso do domínio Entregas — não timeline corporativa.
   */
  function deriveStages(trip) {
    const v = trip.variant || "prep";
    let idx = 0;
    if (v === "prep") idx = 0;
    else if (v === "ready" || v === "block") idx = 1;
    else if (v === "route" || v === "exception" || v === "offline" || v === "conflict") idx = 2;
    else if (v === "return") idx = 3;
    else if (v === "open" || v === "closed") idx = 4;
    else idx = Math.min(4, Math.floor((trip.progress || 0) * 4));

    if (trip.closed && !trip.openEnd) idx = 4;

    const tense = trip.sitClass === "tensao" || trip.blocked || trip.divergence;
    const tech = trip.sitClass === "tech" || trip.variant === "offline" || trip.variant === "conflict";

    return STAGE_KEYS.map((label, i) => {
      let role = "hidden";
      if (i < idx) role = i === idx - 1 ? "done" : "hidden";
      if (i === idx) role = trip.closed && !trip.openEnd && !trip.openIncident ? "done" : "now";
      if (i === idx + 1 && !(trip.closed && !trip.openEnd)) role = "next";
      // sempre revelar anterior imediato + atual + próximo
      if (i === idx - 1) role = "done";
      if (trip.closed && !trip.openEnd && !trip.openIncident) {
        if (i === 3) role = "done";
        if (i === 4) role = "done";
        if (i < 3) role = "hidden";
      }
      if (trip.openEnd && i === 4) role = "now";
      if (trip.openEnd && i === 3) role = "done";
      if (trip.openEnd && i < 3) role = "hidden";
      return {
        label,
        role,
        tense: role === "now" && tense,
        tech: role === "now" && tech
      };
    }).filter((s) => s.role !== "hidden");
  }

  function stagesHtml(trip, compact) {
    const stages = deriveStages(trip);
    const cls = compact ? "stages phone-stages" : "stages";
    return `<div class="${cls}" aria-label="Momentos essenciais da viagem">${stages
      .map((s) => {
        const extra = [
          s.role === "done" ? "is-done" : "",
          s.role === "now" ? "is-now stage-now" : "",
          s.role === "next" ? "is-next" : "",
          s.tense ? "is-tense" : "",
          s.tech ? "is-tech" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return `<span class="stage ${extra}"><span class="stage-dot" aria-hidden="true"></span>${s.label}</span>`;
      })
      .join("")}</div>`;
  }

  const SCENARIOS = {
    prep3: {
      id: "prep3",
      name: "1 · Preparação com três entregas",
      conn: "online",
      mode: "ambiente",
      sussurro: "Movimento discreto no organismo",
      peripheral: [
        { id: "V-1038", sit: "Em rota", sitClass: "vivo", rider: "Ana", progress: 0.55, stops: 2, done: 1, variant: "route", label: "1 de 2" },
        { id: "V-1040", sit: "Saída bloqueada", sitClass: "tensao", rider: "Marcos", progress: 0.28, stops: 2, done: 0, variant: "block", label: "Volumes" },
        { id: "V-1035", sit: "Fechamento pendente", sitClass: "tensao", rider: "Bruno", progress: 0.92, openEnd: true, stops: 3, done: 3, variant: "open", label: "Retorno" }
      ],
      trip: {
        id: "V-1042",
        rider: "Aguardando entregador disponível",
        sit: "Em preparação",
        sitClass: "",
        progress: 0.12,
        variant: "prep",
        volumes: { expected: 5, checked: 5, handed: 0, received: 0, delivered: 0, returned: 0 },
        divergence: false,
        blocked: false,
        stops: [
          { id: "D-81", state: "pending", label: "Itaim", ref: "R. Joaquim Floriano, 100 — ap 42", vol: 2 },
          { id: "D-82", state: "pending", label: "Itaim", ref: "Al. Santos, 2200 — portaria", vol: 1 },
          { id: "D-83", state: "pending", label: "Jardins", ref: "R. Augusta, 1500", vol: 2 }
        ],
        facts: [
          { k: "fact", t: "Três entregas · ordem definida" },
          { k: "prov", t: "Volumes esperados: 5" }
        ],
        foco: {
          titulo: "Preparar saída",
          apoio: "Três paradas. Falta um entregador disponível.",
          acao: { id: "atribuir", label: "Atribuir entregador" },
          secs: [{ id: "volumes", label: "Ver volumes" }]
        },
        mobile: {
          olho: "Preparação",
          titulo: "Aguardando liberação",
          apoio: "A expedição ainda monta a viagem.",
          dados: "Esperados 5 · 3 paradas",
          cta: null,
          secs: []
        }
      }
    },
    volDiv: {
      id: "volDiv",
      name: "2 · Divergência de volume",
      conn: "online",
      mode: "foco",
      sussurro: "Uma viagem pede atenção",
      peripheral: [
        { id: "V-1038", sit: "Em rota", sitClass: "vivo", rider: "Ana", progress: 0.6, stops: 2, done: 1, variant: "route", label: "1 de 2" }
      ],
      trip: {
        id: "V-1043",
        rider: "Marcos",
        sit: "Saída bloqueada",
        sitClass: "tensao",
        progress: 0.3,
        variant: "block",
        volumes: { expected: 3, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        divergence: true,
        blocked: true,
        stops: [
          { id: "D-90", state: "pending", label: "Mooca", ref: "R. da Mooca, 400", vol: 2 },
          { id: "D-91", state: "pending", label: "Mooca", ref: "R. Borges, 88", vol: 1 }
        ],
        facts: [
          { k: "tensao", t: "Esperados 3 · Conferidos 2" },
          { k: "fact", t: "Entregador atribuído" }
        ],
        foco: {
          titulo: "Saída bloqueada",
          apoio: "A viagem não pode ser liberada até a nova conferência.",
          acao: { id: "volumes", label: "Revisar volumes", atencao: true },
          secs: []
        },
        mobile: {
          olho: "Antes de sair",
          titulo: "Volumes não batem",
          apoio: "A loja precisa conferir novamente antes de liberar a saída.",
          dados: "Esperados 3 · Conferidos 2",
          cta: { id: "wait", label: "Aguardar liberação" },
          secs: [{ id: "exception", label: "Informar um problema" }]
        }
      }
    },
    awaitRider: {
      id: "awaitRider",
      name: "3 · Aguardando entregador",
      conn: "online",
      mode: "ambiente",
      sussurro: "Pendência leve na loja",
      peripheral: [],
      trip: {
        id: "V-1044",
        rider: "—",
        sit: "Pronta para sair",
        sitClass: "",
        progress: 0.22,
        variant: "prep",
        volumes: { expected: 4, checked: 4, handed: 0, received: 0, delivered: 0, returned: 0 },
        stops: [
          { id: "D-92", state: "pending", label: "Lapa", ref: "R. Clélia, 1200", vol: 2 },
          { id: "D-93", state: "pending", label: "Lapa", ref: "R. Titia, 50", vol: 2 }
        ],
        facts: [{ k: "fact", t: "Volumes conferidos · falta quem está disponível" }],
        foco: {
          titulo: "Aguardando entregador",
          apoio: "Só quem está disponível — não apenas na loja.",
          acao: { id: "atribuir", label: "Atribuir entregador" },
          secs: []
        },
        mobile: {
          olho: "Na loja",
          titulo: "Sem viagem atribuída",
          apoio: "Quando houver viagem, a próxima ação aparece aqui.",
          dados: "—",
          cta: null,
          secs: []
        }
      }
    },
    handoff: {
      id: "handoff",
      name: "4 · Handoff confirmado",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [{ id: "V-1038", sit: "Em rota", sitClass: "vivo", rider: "Bruno", progress: 0.4, stops: 2, done: 0, variant: "route", label: "0 de 2" }],
      trip: {
        id: "V-1045",
        rider: "Ana",
        sit: "Pronta para sair",
        sitClass: "vivo",
        progress: 0.38,
        variant: "ready",
        volumes: { expected: 3, checked: 3, handed: 3, received: 3, delivered: 0, returned: 0 },
        stops: [
          { id: "D-94", state: "pending", label: "Pinheiros", ref: "R. dos Pinheiros, 800", vol: 2 },
          { id: "D-95", state: "pending", label: "Pinheiros", ref: "R. Teodoro, 300", vol: 1 }
        ],
        facts: [
          { k: "fact", t: "Handoff confirmado · 3 volumes com Ana" },
          { k: "fact", t: "Ordem: 2 paradas" }
        ],
        foco: {
          titulo: "Pronta para sair",
          apoio: "Handoff completo. A viagem pode continuar.",
          acao: { id: "depart", label: "Registrar saída" },
          secs: [{ id: "map", label: "Mapa de apoio" }]
        },
        mobile: {
          olho: "Handoff ok",
          titulo: "Pode sair",
          apoio: "2 paradas · ordem definida",
          dados: "Esperados 3 · Com você 3",
          cta: { id: "depart", label: "Iniciar viagem" },
          secs: [{ id: "map", label: "Mapa de apoio" }]
        }
      }
    },
    inRoute: {
      id: "inRoute",
      name: "5 · Viagem em rota",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [
        { id: "V-1042", sit: "Em preparação", sitClass: "", rider: "—", progress: 0.1, stops: 3, done: 0, variant: "prep", label: "Montagem" }
      ],
      trip: {
        id: "V-1046",
        rider: "Ana",
        sit: "Em rota",
        sitClass: "vivo",
        progress: 0.48,
        variant: "route",
        volumes: { expected: 3, checked: 3, handed: 3, received: 3, delivered: 0, returned: 0 },
        stops: [
          { id: "D-94", state: "pending", label: "1", ref: "R. dos Pinheiros, 800 — ap 12", vol: 2 },
          { id: "D-95", state: "pending", label: "2", ref: "R. Teodoro, 300", vol: 1 }
        ],
        facts: [
          { k: "fact", t: "Saída registrada" },
          { k: "prov", t: "Sessão de localização da viagem ativa" }
        ],
        foco: {
          titulo: "Próxima parada",
          apoio: "R. dos Pinheiros, 800 — ap 12",
          acao: { id: "arrive", label: "Confirmar chegada" },
          secs: [
            { id: "deliver", label: "Confirmar entrega" },
            { id: "exception", label: "Registrar exceção" },
            { id: "map", label: "Mapa de apoio" }
          ]
        },
        mobile: {
          olho: "Parada 1 de 2",
          titulo: "Entregar",
          apoio: "R. dos Pinheiros, 800 — ap 12",
          dados: "2 volumes nesta parada",
          cta: { id: "arrive", label: "Confirmar chegada" },
          secs: [
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
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1046",
        rider: "Ana",
        sit: "Em rota",
        sitClass: "vivo",
        progress: 0.72,
        variant: "route",
        volumes: { expected: 3, checked: 3, handed: 3, received: 3, delivered: 2, returned: 0 },
        stops: [
          { id: "D-94", state: "done", label: "1", ref: "Confirmada", vol: 2 },
          { id: "D-95", state: "pending", label: "2", ref: "R. Teodoro, 300", vol: 1 }
        ],
        facts: [{ k: "fact", t: "Parada 1 confirmada · 2 volumes" }],
        foco: {
          titulo: "Próxima parada",
          apoio: "R. Teodoro, 300 — portaria",
          acao: { id: "deliver", label: "Confirmar entrega" },
          secs: [{ id: "exception", label: "Registrar exceção" }]
        },
        mobile: {
          olho: "Parada 2 de 2",
          titulo: "Entregar",
          apoio: "R. Teodoro, 300 — portaria",
          dados: "1 volume nesta parada",
          cta: { id: "deliver", label: "Confirmar entrega" },
          secs: [{ id: "exception", label: "Registrar exceção" }]
        }
      }
    },
    noAnswer: {
      id: "noAnswer",
      name: "7 · Cliente não atende",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1047",
        rider: "Bruno",
        sit: "Precisa de atenção",
        sitClass: "tensao",
        progress: 0.5,
        variant: "exception",
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        stops: [{ id: "D-100", state: "exception", label: "1", ref: "R. Harmonia, 55", vol: 2 }],
        facts: [
          { k: "tensao", t: "Tentativa 19:35 · cliente não atendeu" },
          { k: "prov", t: "A entrega continua aberta" }
        ],
        foco: {
          titulo: "Cliente não respondeu",
          apoio: "A entrega continua aberta.",
          acao: { id: "retry", label: "Nova tentativa depois" },
          secs: [
            { id: "continue", label: "Seguir a rota" },
            { id: "return", label: "Retornar à loja" }
          ]
        },
        mobile: {
          olho: "Tentativa",
          titulo: "Cliente não respondeu",
          apoio: "A entrega continua aberta.",
          dados: "2 volumes ainda com você",
          cta: { id: "retry", label: "Nova tentativa depois" },
          secs: [
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
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1048",
        rider: "Bruno",
        sit: "Precisa de atenção",
        sitClass: "tensao",
        progress: 0.45,
        variant: "exception",
        volumes: { expected: 1, checked: 1, handed: 1, received: 1, delivered: 0, returned: 0 },
        stops: [{ id: "D-101", state: "exception", label: "1", ref: "Referência incompleta", vol: 1 }],
        facts: [
          { k: "tensao", t: "Endereço não confere" },
          { k: "prov", t: "Localização indisponível. A viagem pode continuar." }
        ],
        foco: {
          titulo: "Endereço não confere",
          apoio: "Aguarde orientação da loja ou retorne com o volume.",
          acao: { id: "wait_le", label: "Solicitar orientação" },
          secs: [{ id: "return", label: "Retornar à loja" }]
        },
        mobile: {
          olho: "Orientação",
          titulo: "Endereço não confere",
          apoio: "Localização indisponível. A viagem pode continuar sob orientação.",
          dados: "1 volume",
          cta: { id: "wait_le", label: "Solicitar orientação" },
          secs: [{ id: "return", label: "Retornar à loja" }]
        }
      }
    },
    damage: {
      id: "damage",
      name: "9 · Avaria",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1049",
        rider: "Carla",
        sit: "Precisa de atenção",
        sitClass: "tensao",
        progress: 0.5,
        variant: "exception",
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        stops: [{ id: "D-102", state: "exception", label: "1", ref: "Al. Lorena, 200", vol: 2 }],
        facts: [{ k: "tensao", t: "Embalagem danificada" }],
        foco: {
          titulo: "Embalagem danificada",
          apoio: "Cliente aceitou com ressalva ou recusou?",
          acao: { id: "deliver", label: "Cliente aceitou · confirmar" },
          secs: [{ id: "return", label: "Cliente recusou · retornar" }]
        },
        mobile: {
          olho: "Avaria",
          titulo: "Embalagem danificada",
          apoio: "Cliente aceitou com ressalva ou recusou?",
          dados: "2 volumes",
          cta: { id: "deliver", label: "Cliente aceitou · confirmar" },
          secs: [{ id: "return", label: "Cliente recusou · retornar" }]
        }
      }
    },
    refused: {
      id: "refused",
      name: "10 · Entrega recusada",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1054",
        rider: "Bruno",
        sit: "Retorno necessário",
        sitClass: "tensao",
        progress: 0.55,
        variant: "exception",
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 0, returned: 0 },
        stops: [{ id: "D-150", state: "exception", label: "1", ref: "Recusada", vol: 2 }],
        facts: [
          { k: "tensao", t: "Cliente recusou receber" },
          { k: "fact", t: "Volumes voltam à loja" }
        ],
        foco: {
          titulo: "Cliente recusou receber",
          apoio: "Não deixe o pedido. Inicie o retorno.",
          acao: { id: "return", label: "Registrar retorno" },
          secs: []
        },
        mobile: {
          olho: "Recusa",
          titulo: "Cliente recusou receber",
          apoio: "Não deixe o pedido. Retorne com os volumes.",
          dados: "2 volumes a devolver",
          cta: { id: "return", label: "Registrar retorno" },
          secs: []
        }
      }
    },
    partial: {
      id: "partial",
      name: "11 · Viagem parcialmente concluída",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1050",
        rider: "Ana",
        sit: "Em rota",
        sitClass: "vivo",
        progress: 0.78,
        variant: "route",
        volumes: { expected: 5, checked: 5, handed: 5, received: 5, delivered: 4, returned: 0 },
        stops: [
          { id: "D-110", state: "done", label: "1", ref: "Ok", vol: 2 },
          { id: "D-111", state: "done", label: "2", ref: "Ok", vol: 2 },
          { id: "D-112", state: "pending", label: "3", ref: "R. Haddock, 500", vol: 1 }
        ],
        facts: [{ k: "fact", t: "2 de 3 paradas confirmadas" }],
        foco: {
          titulo: "Última parada",
          apoio: "R. Haddock, 500 — sala 3",
          acao: { id: "deliver", label: "Confirmar entrega" },
          secs: [{ id: "exception", label: "Registrar exceção" }]
        },
        mobile: {
          olho: "Parada 3 de 3",
          titulo: "Entregar",
          apoio: "R. Haddock, 500 — sala 3",
          dados: "1 volume",
          cta: { id: "deliver", label: "Confirmar entrega" },
          secs: [{ id: "exception", label: "Registrar exceção" }]
        }
      }
    },
    offline: {
      id: "offline",
      name: "12 · Offline",
      conn: "offline",
      mode: "ambiente",
      sussurro: "Estado técnico · sem culpa",
      peripheral: [],
      trip: {
        id: "V-1051",
        rider: "Diego",
        sit: "Dados pendentes",
        sitClass: "tech",
        progress: 0.65,
        variant: "offline",
        pendingSync: 2,
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 1, returned: 0 },
        stops: [
          { id: "D-120", state: "done", label: "1", ref: "No aparelho", vol: 1 },
          { id: "D-121", state: "pending", label: "2", ref: "R. Cardeal, 90", vol: 1 }
        ],
        facts: [
          { k: "prov", t: "Salvo no aparelho. Será enviado quando a conexão voltar." }
        ],
        foco: {
          titulo: "Continuar a rota",
          apoio: "Sem conexão. As ações ficam no aparelho.",
          acao: { id: "deliver", label: "Confirmar entrega" },
          secs: [{ id: "exception", label: "Registrar exceção" }]
        },
        mobile: {
          olho: "Sem conexão",
          titulo: "Continuar a rota",
          apoio: "R. Cardeal, 90",
          dados: "1 volume restante",
          sync: "Salvo no aparelho. Será enviado quando a conexão voltar.",
          cta: { id: "deliver", label: "Confirmar entrega" },
          secs: [{ id: "exception", label: "Registrar exceção" }]
        }
      }
    },
    pendingSync: {
      id: "pendingSync",
      name: "13 · Evento aguardando sincronização",
      conn: "unstable",
      mode: "ambiente",
      sussurro: "Dados pendentes",
      peripheral: [],
      trip: {
        id: "V-1051b",
        rider: "Diego",
        sit: "Dados pendentes",
        sitClass: "tech",
        progress: 0.85,
        variant: "offline",
        pendingSync: 3,
        openEnd: true,
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        stops: [
          { id: "D-120", state: "done", label: "1", ref: "Ok no aparelho", vol: 1 },
          { id: "D-121", state: "done", label: "2", ref: "Ok no aparelho", vol: 1 }
        ],
        facts: [{ k: "prov", t: "3 eventos aguardando sincronização" }],
        foco: {
          titulo: "Paradas no aparelho",
          apoio: "A loja ainda não recebeu tudo.",
          acao: { id: "return", label: "Registrar retorno" },
          secs: []
        },
        mobile: {
          olho: "Conexão instável",
          titulo: "Paradas no aparelho",
          apoio: "A loja ainda não recebeu tudo.",
          dados: "—",
          sync: "3 eventos aguardando sincronização",
          cta: { id: "return", label: "Registrar retorno" },
          secs: []
        }
      }
    },
    syncing: {
      id: "syncing",
      name: "14 · Sincronizando",
      conn: "syncing",
      mode: "ambiente",
      sussurro: "Dados pendentes",
      peripheral: [],
      trip: {
        id: "V-1051",
        rider: "Diego",
        sit: "Dados pendentes",
        sitClass: "tech",
        progress: 0.88,
        variant: "offline",
        pendingSync: 1,
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        stops: [
          { id: "D-120", state: "done", label: "1", ref: "Ok", vol: 1 },
          { id: "D-121", state: "done", label: "2", ref: "Enviando", vol: 1 }
        ],
        facts: [{ k: "prov", t: "Sincronizando…" }],
        foco: {
          titulo: "Sincronizando",
          apoio: "Enviando o que estava no aparelho.",
          acao: { id: "return", label: "Registrar retorno" },
          secs: []
        },
        mobile: {
          olho: "Enviando",
          titulo: "Sincronizando",
          apoio: "Paradas concluídas no aparelho.",
          dados: "—",
          sync: "Sincronizando 1 evento…",
          cta: { id: "return", label: "Registrar retorno" },
          secs: []
        }
      }
    },
    conflict: {
      id: "conflict",
      name: "15 · Conflito de sincronização",
      conn: "online",
      mode: "foco",
      sussurro: "Dados pendentes",
      peripheral: [],
      trip: {
        id: "V-1052",
        rider: "Elena",
        sit: "Dados pendentes",
        sitClass: "tech",
        progress: 0.9,
        variant: "conflict",
        conflict: true,
        openEnd: true,
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        stops: [{ id: "D-130", state: "done", label: "1", ref: "Conflito de horário", vol: 2 }],
        facts: [
          { k: "prov", t: "Conflito de sincronização" },
          { k: "prov", t: "Resolução na expedição — sem auto-merge" }
        ],
        foco: {
          titulo: "Há um conflito",
          apoio: "Duas versões do mesmo evento. A mesa resolve.",
          acao: { id: "resolver", label: "Resolver na mesa" },
          secs: []
        },
        mobile: {
          olho: "Aguarde",
          titulo: "Há um conflito",
          apoio: "Sua ação foi salva. A expedição vai conferir.",
          dados: "—",
          sync: "Conflito · resolução na mesa",
          syncTensao: true,
          cta: { id: "wait_le", label: "Entendi" },
          secs: []
        }
      }
    },
    returning: {
      id: "returning",
      name: "16 · Retorno à loja",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1053",
        rider: "Ana",
        sit: "Em retorno",
        sitClass: "vivo",
        progress: 0.7,
        variant: "return",
        volumes: { expected: 4, checked: 4, handed: 4, received: 4, delivered: 3, returned: 1 },
        stops: [
          { id: "D-140", state: "done", label: "1", ref: "Ok", vol: 1 },
          { id: "D-141", state: "done", label: "2", ref: "Ok", vol: 1 },
          { id: "D-142", state: "exception", label: "3", ref: "Volta", vol: 1 }
        ],
        facts: [
          { k: "fact", t: "1 volume a devolver" },
          { k: "prov", t: "Handoff de volta na loja ainda pendente" }
        ],
        foco: {
          titulo: "Voltar à loja",
          apoio: "Entregar 1 volume na expedição.",
          acao: { id: "arrive_store", label: "Cheguei na loja" },
          secs: []
        },
        mobile: {
          olho: "Retorno",
          titulo: "Voltar à loja",
          apoio: "1 volume para devolver na expedição.",
          dados: "Entregues 3 · Retorno 1",
          cta: { id: "arrive_store", label: "Cheguei na loja" },
          secs: []
        }
      }
    },
    closePending: {
      id: "closePending",
      name: "17 · Fechamento pendente",
      conn: "online",
      mode: "foco",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1053",
        rider: "Ana",
        sit: "Fechamento pendente",
        sitClass: "tensao",
        progress: 0.94,
        openEnd: true,
        variant: "open",
        returnProvisional: true,
        volumes: { expected: 4, checked: 4, handed: 4, received: 4, delivered: 3, returned: 1 },
        stops: [
          { id: "D-140", state: "done", label: "1", ref: "Ok", vol: 1 },
          { id: "D-141", state: "done", label: "2", ref: "Ok", vol: 1 },
          { id: "D-142", state: "exception", label: "3", ref: "Retorno", vol: 1 }
        ],
        facts: [
          { k: "prov", t: "Retorno informado" },
          { k: "tensao", t: "Falta handoff de volta e reconciliação" }
        ],
        foco: {
          titulo: "Fechamento pendente",
          apoio: "A viagem permanece aberta até conferir volumes e retorno.",
          acao: { id: "fechar", label: "Confirmar fechamento" },
          secs: [{ id: "receber", label: "Receber handoff de volta" }]
        },
        mobile: {
          olho: "Na loja",
          titulo: "Aguardando conferência",
          apoio: "Retorno ainda não confirmado. Viagem não está fechada.",
          dados: "Devolver 1 volume",
          cta: { id: "wait_le", label: "Aguardar conferência" },
          secs: []
        }
      }
    },
    closed: {
      id: "closed",
      name: "18 · Viagem encerrada",
      conn: "online",
      mode: "calmo",
      sussurro: "Operação sob controle",
      peripheral: [
        { id: "V-1046", sit: "Em rota", sitClass: "vivo", rider: "Ana", progress: 0.4, stops: 2, done: 0, variant: "route", label: "Em rota" },
        { id: "V-1042", sit: "Em preparação", sitClass: "", rider: "—", progress: 0.12, stops: 3, done: 0, variant: "prep", label: "Montagem" },
        { id: "V-1045", sit: "Pronta para sair", sitClass: "vivo", rider: "Bruno", progress: 0.35, stops: 2, done: 0, variant: "ready", label: "Handoff ok" }
      ],
      trip: {
        id: "V-1053",
        rider: "Ana · disponível",
        sit: "Encerrada e conferida",
        sitClass: "",
        progress: 1,
        variant: "closed",
        closed: true,
        volumes: { expected: 4, checked: 4, handed: 4, received: 4, delivered: 3, returned: 1 },
        stops: [
          { id: "D-140", state: "done", label: "1", ref: "Ok", vol: 1 },
          { id: "D-141", state: "done", label: "2", ref: "Ok", vol: 1 },
          { id: "D-142", state: "done", label: "3", ref: "Devolvido", vol: 1 }
        ],
        facts: [
          { k: "fact", t: "Handoff de volta confirmado" },
          { k: "fact", t: "Volumes reconciliados" }
        ],
        foco: {
          titulo: "Viagem encerrada e conferida",
          apoio: "Entregador disponível para nova atribuição.",
          acao: null,
          secs: []
        },
        mobile: {
          olho: "Concluído",
          titulo: "Viagem encerrada e conferida",
          apoio: "Você está disponível para nova viagem quando a loja atribuir.",
          dados: "3 entregues · 1 devolvido",
          sync: "Tudo sincronizado",
          cta: null,
          secs: []
        }
      }
    },
    openIncident: {
      id: "openIncident",
      name: "19 · Ocorrência ainda aberta",
      conn: "online",
      mode: "ambiente",
      sussurro: "",
      peripheral: [],
      trip: {
        id: "V-1055",
        rider: "Carla · disponível",
        sit: "Ocorrência aberta",
        sitClass: "tensao",
        progress: 1,
        variant: "closed",
        closed: true,
        openIncident: true,
        volumes: { expected: 2, checked: 2, handed: 2, received: 2, delivered: 2, returned: 0 },
        stops: [{ id: "D-160", state: "done", label: "1", ref: "Com ressalva", vol: 2 }],
        facts: [
          { k: "fact", t: "Viagem encerrada no transporte" },
          { k: "tensao", t: "Ocorrência de avaria ainda em tratamento" }
        ],
        foco: {
          titulo: "Ocorrência ainda aberta",
          apoio: "A rota terminou. A loja segue com o tratamento.",
          acao: { id: "ocorrencia", label: "Ver ocorrência" },
          secs: []
        },
        mobile: {
          olho: "Viagem ok",
          titulo: "Ocorrência com a loja",
          apoio: "Sua parte na rota terminou.",
          dados: "2 entregues",
          cta: null,
          secs: []
        }
      }
    },
    reissue: {
      id: "reissue",
      name: "20 · Reenvio vinculado",
      conn: "online",
      mode: "ambiente",
      sussurro: "Nova viagem no organismo",
      peripheral: [
        { id: "V-1053", sit: "Encerrada e conferida", sitClass: "", rider: "Ana", progress: 1, stops: 3, done: 3, variant: "closed", label: "Origem" }
      ],
      trip: {
        id: "V-1060",
        rider: "—",
        sit: "Em preparação",
        sitClass: "",
        progress: 0.1,
        variant: "prep",
        reissueOf: "D-142",
        volumes: { expected: 1, checked: 1, handed: 0, received: 0, delivered: 0, returned: 0 },
        stops: [{ id: "D-142b", state: "pending", label: "Reenvio", ref: "Novo D-142b · origem D-142", vol: 1 }],
        facts: [
          { k: "fact", t: "Novo delivery · vínculo com D-142" },
          { k: "prov", t: "Decisão de reenvio fora do financeiro de Entregas" }
        ],
        foco: {
          titulo: "Reenvio",
          apoio: "Mesma referência operacional. Novo identificador.",
          acao: { id: "atribuir", label: "Atribuir entregador" },
          secs: []
        },
        mobile: {
          olho: "Reenvio",
          titulo: "Aguardando atribuição",
          apoio: "Quando atribuída, a próxima ação aparece aqui.",
          dados: "1 volume",
          cta: null,
          secs: []
        }
      }
    }
  };

  const state = {
    view: "desktop",
    scenarioId: "closed", // default Calmo
    mapOpen: false,
    volumeStep: 0
  };

  const el = (id) => document.getElementById(id);

  function toast(msg) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.add("is-show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("is-show"), 2800);
  }

  function connLabel(c) {
    if (c === "offline") return { text: "Offline", cls: "offline" };
    if (c === "syncing") return { text: "Sincronizando", cls: "syncing" };
    if (c === "unstable") return { text: "Instável", cls: "unstable" };
    return { text: "Conectado", cls: "" };
  }

  function metaLine(trip) {
    const v = trip.volumes || {};
    const parts = [];
    if (trip.stops) parts.push(`<span><strong>${trip.stops.length}</strong> paradas</span>`);
    if (v.expected != null) {
      let vol = `Esperados ${v.expected}`;
      if (v.checked != null) vol += ` · Conferidos ${v.checked}`;
      if (v.delivered) vol += ` · Cliente ${v.delivered}`;
      if (v.returned) vol += ` · Retorno ${v.returned}`;
      parts.push(`<span>${vol}</span>`);
    }
    if (trip.pendingSync) parts.push(`<span><strong>${trip.pendingSync}</strong> no aparelho</span>`);
    if (trip.reissueOf) parts.push(`<span>Origem ${trip.reissueOf}</span>`);
    return parts.join("");
  }

  function sitTone(sitClass) {
    if (sitClass === "tensao") return "is-tense";
    if (sitClass === "vivo") return "is-live";
    if (sitClass === "tech") return "is-tech";
    return "";
  }

  function renderPeripheral(p) {
    const fakeTrip = {
      progress: p.progress,
      variant: p.variant,
      openEnd: p.openEnd,
      stops: [],
      pendingSync: p.pendingSync,
      sitClass: p.sitClass,
      blocked: p.variant === "block",
      closed: p.variant === "closed"
    };
    for (let i = 0; i < (p.stops || 0); i++) {
      fakeTrip.stops.push({ state: i < (p.done || 0) ? "done" : "pending" });
    }
    return `<div class="area area-periferica ${sitTone(p.sitClass)}" role="listitem" data-peripheral="${p.id}" aria-label="Viagem ${p.id}">
      <div class="area-eye">Viagem</div>
      <div class="area-head">
        <span class="area-id">${p.id}</span>
        <span class="area-sit ${p.sitClass || ""}">${p.sit}</span>
        <span class="area-rider">${p.rider}</span>
      </div>
      ${stagesHtml(fakeTrip, false)}
      <div class="area-meta"><span>${p.label || ""}</span></div>
    </div>`;
  }

  function renderFocus(trip, mode) {
    if (!trip.foco || mode === "calmo") return "";
    const f = trip.foco;
    const lines = (trip.facts || [])
      .map((x) => `<div class="foco-ev ${x.k === "fact" ? "fact" : x.k === "tensao" ? "tensao" : "prov"}">${x.t}</div>`)
      .join("");
    let acoes = "";
    if (f.acao) {
      acoes += `<button type="button" class="acao-pill ${f.acao.atencao ? "atencao" : ""}" data-act="${f.acao.id}">${f.acao.label}</button>`;
    }
    (f.secs || []).forEach((s) => {
      acoes += `<button type="button" class="acao-sec" data-act="${s.id}">${s.label}</button>`;
    });
    return `<div class="foco-body">
      <div class="foco-situation">${f.titulo}</div>
      <div class="foco-consequence">${f.apoio}</div>
      <div class="foco-evidence">${lines}</div>
      <div class="acao-area">${acoes}
        <div class="map-mini ${state.mapOpen ? "is-open" : ""}" id="map-mini">
          Localização opcional. A viagem pode continuar pela ordem das paradas.
          <div class="map-mini-field" role="img" aria-label="Apoio de mapa"></div>
        </div>
      </div>
    </div>`;
  }

  function renderDesktop(sc) {
    if (!sc || !sc.trip) {
      const host = el("organismo");
      if (host) host.innerHTML = '<div class="area area-foco">Cenário sem viagem.</div>';
      return;
    }
    const mode = sc.mode || "ambiente";
    document.body.dataset.mode = mode;
    document.body.setAttribute("data-mode", mode);
    const suss = el("campo-sussurro");
    if (suss) suss.textContent = sc.sussurro || "";

    const trip = sc.trip;
    const peri = (sc.peripheral || []).map(renderPeripheral).join("");
    const tone = sitTone(trip.sitClass);
    const closedCls = trip.closed && !trip.openIncident ? "is-closed" : "";

    const focusHtml = `<div class="area area-foco ${tone} ${closedCls}" role="listitem" data-trip="${trip.id}" aria-current="${mode === "foco" ? "true" : "false"}">
      <div class="area-eye">Viagem ${trip.id}</div>
      <div class="area-head">
        <span class="area-id">${trip.id}</span>
        <span class="area-sit ${trip.sitClass || ""}">${trip.sit}</span>
        <span class="area-rider">${trip.rider}</span>
      </div>
      ${stagesHtml(trip, false)}
      <div class="area-meta">${metaLine(trip)}</div>
      ${renderFocus(trip, mode)}
    </div>`;

    // Sempre periféricas + viagem principal na mesma superfície (Calmo inclusive).
    const host = el("organismo");
    if (!host) return;
    host.innerHTML = peri + focusHtml;
    // Garante presença no DOM: se vazio, falha explícita (nunca "fundo vazio" silencioso)
    if (!host.querySelector || !host.innerHTML || host.innerHTML.indexOf("area") === -1) {
      host.innerHTML = focusHtml || '<div class="area area-foco">Falha ao montar viagens.</div>';
    }
  }

  function renderMobile(sc) {
    const trip = sc.trip;
    const m = trip.mobile;
    const c = connLabel(sc.conn);
    el("phone-conn").className = "conn tech-state " + c.cls;
    el("phone-conn").innerHTML = `<span class="pip" aria-hidden="true"></span><span class="conn-text">${c.text}</span>`;

    let cta = "";
    if (m.cta) {
      cta = `<button type="button" class="acao-pill" data-act="${m.cta.id}">${m.cta.label}</button>`;
    }
    const secs = (m.secs || [])
      .map((s) => `<button type="button" class="acao-sec" data-act="${s.id}">${s.label}</button>`)
      .join("");
    const sync = m.sync
      ? `<div class="sync-line ${m.syncTensao ? "tensao" : ""}">${m.sync}</div>`
      : "";

    const nextStop = (trip.stops || []).find((s) => s.state === "pending" || s.state === "exception");
    const stopLine = nextStop ? nextStop.ref : (m.apoio || "");

    el("phone-body").innerHTML = `
      <div>
        <div class="phone-eye">${m.olho}</div>
        <div class="phone-trip">${trip.id}</div>
        <h2 class="phone-title">${m.titulo}</h2>
        <p class="phone-support">${m.apoio}</p>
        ${stagesHtml(trip, true)}
        <div class="phone-facts">
          <div class="phone-fact">${m.dados || "—"}</div>
          ${nextStop && stopLine !== m.apoio ? `<div class="phone-fact">${stopLine}</div>` : ""}
          ${trip.rider && trip.rider !== "—" ? `<div class="phone-fact">${trip.rider}</div>` : ""}
        </div>
        ${sync}
      </div>
      <div class="phone-acoes">${cta}${secs}</div>
    `;
  }

  function render() {
    const sc = SCENARIOS[state.scenarioId];
    if (!sc) {
      console.error("[entregas] cenário desconhecido:", state.scenarioId);
      return;
    }
    document.body.dataset.surface = state.view;
    document.body.setAttribute("data-surface", state.view);
    const campo = el("campo");
    const mobile = el("mobile-wrap");
    if (campo) campo.classList.toggle("is-active", state.view === "desktop");
    if (mobile) mobile.classList.toggle("is-active", state.view === "mobile");
    const bd = el("btn-desktop");
    const bm = el("btn-mobile");
    if (bd) bd.setAttribute("aria-pressed", state.view === "desktop" ? "true" : "false");
    if (bm) bm.setAttribute("aria-pressed", state.view === "mobile" ? "true" : "false");
    try {
      renderDesktop(sc);
      renderMobile(sc);
    } catch (err) {
      console.error("[entregas] render falhou:", err);
      const host = el("organismo");
      if (host) {
        host.innerHTML =
          '<div class="area area-foco"><div class="area-eye">Erro</div><div class="foco-situation">Falha ao renderizar</div><div class="foco-consequence">' +
          String(err && err.message ? err.message : err) +
          "</div></div>";
      }
    }
  }

  function openModal(title, body, primary, onPrimary) {
    el("modal-title").textContent = title;
    el("modal-body").innerHTML = body;
    el("modal-primary").textContent = primary;
    el("modal-backdrop").classList.add("is-open");
    el("modal-primary").onclick = onPrimary;
  }
  function closeModal() {
    el("modal-backdrop").classList.remove("is-open");
  }

  function openExceptions() {
    let selected = null;
    const grid = EXCEPTIONS.map((e) => `<button type="button" data-ex="${e.code}">${e.label}</button>`).join("");
    openModal(
      "Registrar exceção",
      `<p>Escolha o motivo. A entrega continua aberta.</p>
       <div class="exception-grid" id="ex-grid">${grid}</div>
       <textarea id="ex-note" placeholder="Nota opcional" aria-label="Nota opcional"></textarea>`,
      "Registrar",
      () => {
        if (!selected) {
          toast("Escolha um motivo.");
          return;
        }
        closeModal();
        const map = { E01: "noAnswer", E02: "badAddr", E05: "refused", E06: "damage" };
        if (map[selected]) setScenario(map[selected]);
        toast("O cliente não respondeu. A entrega continua aberta.");
      }
    );
    el("ex-grid").onclick = (ev) => {
      const b = ev.target.closest("[data-ex]");
      if (!b) return;
      selected = b.getAttribute("data-ex");
      el("ex-grid").querySelectorAll("button").forEach((x) => x.classList.remove("is-on"));
      b.classList.add("is-on");
    };
  }

  function openVolumes() {
    const v = SCENARIOS[state.scenarioId].trip.volumes;
    state.volumeStep = 0;
    const steps = [
      {
        title: "Saída bloqueada",
        body: `<p>São esperados <strong>${v.expected}</strong> volumes, mas apenas <strong>${v.checked}</strong> foram conferidos.</p>
               <p>A viagem não pode ser liberada até a nova conferência.</p>`
      },
      {
        title: "Revisar volumes",
        body: `<div class="volume-row"><span>Conferidos</span><input type="number" id="vol-checked" min="0" max="20" value="${v.checked}" /></div>
               <div class="volume-row"><span>Recebidos pelo entregador</span><input type="number" id="vol-received" min="0" max="20" value="${v.received || 0}" /></div>`
      },
      {
        title: "Reconfirmar",
        body: `<p>Confirme que os números batem com o esperado (${v.expected}) para liberar a saída.</p>`
      }
    ];
    function show() {
      const s = steps[state.volumeStep];
      openModal(s.title, s.body, state.volumeStep < 2 ? "Continuar" : "Salvar", () => {
        if (state.volumeStep === 1) {
          const c = Number(el("vol-checked").value);
          const r = Number(el("vol-received").value);
          if (c !== v.expected || r !== v.expected) {
            toast("Ainda há divergência. Saída bloqueada.");
            closeModal();
            setScenario("volDiv");
            return;
          }
        }
        if (state.volumeStep < 2) {
          state.volumeStep++;
          show();
          return;
        }
        closeModal();
        toast("Volumes conferidos. Viagem liberada.");
        setScenario("handoff");
      });
    }
    show();
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
      else toast("Localização indisponível. A viagem pode continuar.");
      return;
    }
    if (act === "depart") {
      const t = SCENARIOS[state.scenarioId].trip;
      if (t.blocked || t.divergence) {
        toast("Saída bloqueada.");
        return;
      }
      toast("Saída registrada.");
      setScenario("inRoute");
      return;
    }
    if (act === "arrive") {
      toast("Chegada registrada.");
      return;
    }
    if (act === "deliver") {
      toast("Entrega confirmada.");
      if (state.scenarioId === "inRoute") setScenario("delivered");
      else if (state.scenarioId === "delivered" || state.scenarioId === "partial") setScenario("returning");
      else if (state.scenarioId === "offline") toast("Salvo no aparelho. Será enviado quando a conexão voltar.");
      else render();
      return;
    }
    if (act === "return") {
      toast("Retorno à loja.");
      setScenario("returning");
      return;
    }
    if (act === "arrive_store") {
      toast("Na loja. Falta handoff de volta.");
      setScenario("closePending");
      return;
    }
    if (act === "receber") {
      toast("Handoff de volta recebido.");
      return;
    }
    if (act === "fechar") {
      toast("Viagem encerrada e conferida.");
      setScenario("closed");
      return;
    }
    if (act === "atribuir") {
      toast("Entregador disponível atribuído.");
      setScenario("volDiv");
      return;
    }
    if (act === "resolver") {
      toast("Conflito resolvido.");
      setScenario("closed");
      return;
    }
    if (act === "retry") toast("Nova tentativa. A entrega continua aberta.");
    if (act === "continue") toast("Seguindo a rota. A entrega continua aberta.");
    if (act === "wait" || act === "wait_le") toast("Aguardando a loja.");
    if (act === "ocorrencia") toast("Ocorrência permanece aberta.");
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
    sel.onchange = () => setScenario(sel.value);
    el("modal-cancel").onclick = closeModal;
    el("modal-backdrop").addEventListener("click", (ev) => {
      if (ev.target === el("modal-backdrop")) closeModal();
    });
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (btn) handleAction(btn.getAttribute("data-act"));
    });
    render();
  }

  init();
})();
