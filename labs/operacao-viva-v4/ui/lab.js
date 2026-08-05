/**
 * LAB · OPERAÇÃO VIVA V4 — a superfície
 * ============================================================================
 * Este arquivo não conhece regra de domínio. Ele busca uma view model pronta e
 * a desenha. Toda decisão — modo, cor, degrau, consolidação, estado de fonte —
 * já veio decidida do servidor.
 *
 * O que ele conhece sozinho: o Modo de Validação, que é local ao navegador por
 * decisão (D38 e B7 continuam de pé). Nenhuma requisição de escrita sai daqui;
 * o servidor recusaria com 405 se saísse.
 */

import {
  ANTECEDENCIAS,
  AVISO_PERMANENTE,
  CORRECOES,
  ROTULO_ANTECEDENCIA,
  ROTULO_CORRECAO,
  ROTULO_ESTADO,
  ROTULO_UTILIDADE,
  ROTULO_VEREDITO,
  UTILIDADES,
  VEREDITOS,
  estadoDeValidacao,
  montarRegistro,
  validadeVencida,
} from "/lab/operacao-viva-v4/validacao/contrato.js";
import { IndexedDbValidationRepository } from "/lab/operacao-viva-v4/validacao/indexeddb.js";
import { MemoryValidationRepository } from "/lab/operacao-viva-v4/validacao/repositorio.js";
import { resumoDoTurno } from "/lab/operacao-viva-v4/validacao/resumo-turno.js";
import { exportar, importar } from "/lab/operacao-viva-v4/validacao/schema.js";

const BASE = "/lab/operacao-viva-v4";
const $ = (s) => document.querySelector(s);

const estado = {
  cenas: null,
  vm: null,
  registros: [],
  repo: null,
  persistencia: "indexeddb",
};

/* ------------------------------------------------------------------ *
 * Utilidades de texto
 * ------------------------------------------------------------------ */

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A hora da LOJA, não a do computador que abriu a página.
 *
 * O fuso é fixo de propósito. A operação acontece em São Paulo, e um horário
 * que muda conforme quem abre a tela produz duas leituras diferentes do mesmo
 * instante — além de tornar qualquer captura de tela indeterminística. É a
 * mesma regra que o núcleo de fonte viva já aplica: sem fuso declarado, não há
 * dia operacional confiável.
 */
const FUSO_DA_LOJA = "America/Sao_Paulo";

const FORMATO_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DA_LOJA,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function hora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return FORMATO_HORA.format(d).replace(":", "h");
}

/** O degrau da unidade, e nunca a porcentagem. Tamanho não vira número. */
function degrau(cor) {
  if (cor === "vermelho") return "3";
  if (cor === "amarelo") return "2";
  if (cor === "verde") return "1";
  return "0";
}

/**
 * A linha de medição de uma unidade.
 *
 * Ela foi reescrita olhando a tela. `carga 14 · pressão 50%` parecia dois
 * ângulos do mesmo número, e não é: 14 é a SOMA de três praças, 50% é a pressão
 * da praça mais carregada. Agora a linha diz quantas praças entraram na conta.
 *
 * E quando o campo está ausente, a linha mostra um marcador curto em vez de
 * despejar a explicação inteira — que continua inteira, no `title`, para quem
 * quiser o motivo.
 */
function medicao(u) {
  const partes = [];

  if (u.carga.observado) {
    partes.push(
      u.pracas_contadas > 1
        ? `<span>carga <strong>${esc(u.carga.valor)}</strong> em ${esc(
            u.pracas_contadas,
          )} praças</span>`
        : `<span>carga <strong>${esc(u.carga.valor)}</strong></span>`,
    );
  } else {
    partes.push(
      `<span title="${esc(u.carga.explicacao)}">carga não medida</span>`,
    );
  }

  if (u.pressao.observado) {
    partes.push(
      u.pracas_contadas > 1
        ? `<span>pressão <strong>${esc(u.pressao.valor)}%</strong> na mais carregada</span>`
        : `<span>pressão <strong>${esc(u.pressao.valor)}%</strong></span>`,
    );
  } else {
    partes.push(
      `<span title="${esc(u.pressao.explicacao)}">pressão não medida</span>`,
    );
  }

  const h = u.ultima_atualizacao ? hora(u.ultima_atualizacao) : null;
  if (h) partes.push(`<span>${esc(h)}</span>`);

  return partes.join(" · ");
}

function bloco(titulo, sub, corpo) {
  return `<section class="bloco"><h2 class="bloco__titulo">${esc(titulo)}</h2>${
    sub ? `<p class="bloco__sub">${esc(sub)}</p>` : ""
  }${corpo}</section>`;
}

function campo(rot, val, ausente = false) {
  return `<div class="campo${ausente ? " campo--ausente" : ""}"><p class="campo__rot">${esc(
    rot,
  )}</p><p class="campo__val">${val}</p></div>`;
}

/* ------------------------------------------------------------------ *
 * O organismo
 * ------------------------------------------------------------------ */

/** As fileiras na ordem do pedido. Produção tem três unidades lado a lado. */
const FILEIRAS = [
  ["caixa"],
  ["sushi", "sushi_quentes", "cozinha"],
  ["conferencia"],
  ["motoboy"],
];

function unidade(u) {
  const d = degrau(u.cor);
  const itens = u.itens_em_producao
    .slice(0, 4)
    .map(
      (i) =>
        `<li><span>${esc(i.nome)}</span><span class="qtd">${esc(i.qtd)}</span></li>`,
    )
    .join("");
  return `<article class="unidade" data-degrau="${d}" data-unidade="${esc(u.id)}" data-cor="${esc(
    u.cor,
  )}">
    <div class="unidade__topo">
      <span class="unidade__ponto" aria-hidden="true"></span>
      <h3 class="unidade__nome">${esc(u.rotulo)}</h3>
      ${u.experimental ? '<span class="unidade__exp" title="Unidade operacional experimental deste laboratório. O domínio canônico não a tem.">EXPERIMENTAL</span>' : ""}
    </div>
    <p class="unidade__estado">${esc(u.estado_texto)}</p>
    <p class="unidade__motivo">${esc(u.motivo)}</p>
    <p class="unidade__linha">${medicao(u)}</p>
    ${itens ? `<ul class="unidade__itens">${itens}</ul>` : ""}
  </article>`;
}

function fio(vm, de) {
  const ls = vm.ligacoes.filter((l) => l.de === de);
  const forte =
    ls.find((l) => l.intensidade === "carregada") ??
    ls.find((l) => l.intensidade === "ativa") ??
    ls[0];
  if (!forte) return "";
  const texto = ls
    .filter((l) => l.texto !== null)
    .map((l) => l.texto)
    .join(" ");
  return `<div class="fio" data-intensidade="${esc(forte.intensidade)}">
    <span class="fio__linha" aria-hidden="true"></span>
    ${texto ? `<p class="fio__texto">${esc(texto)}</p>` : ""}
  </div>`;
}

function organismo(vm) {
  const porId = new Map(vm.unidades.map((u) => [u.id, u]));
  const partes = [];
  FILEIRAS.forEach((fileira, i) => {
    partes.push(
      `<div class="fileira">${fileira
        .map((id) => (porId.has(id) ? unidade(porId.get(id)) : ""))
        .join("")}</div>`,
    );
    if (i < FILEIRAS.length - 1) partes.push(fio(vm, fileira[0]));
  });
  return `<div class="palco">${partes.join("")}</div>`;
}

/* ------------------------------------------------------------------ *
 * Foco
 * ------------------------------------------------------------------ */

function foco(vm) {
  const f = vm.foco;
  if (f === null) {
    return `<div class="rebaixado"><p class="rebaixado__titulo">Nada ocupa o Foco nesta leitura.</p><p class="campo__val">Nenhuma situação chegou ao piso de interrupção. Os sinais ativos seguem visíveis em Ambiente.</p></div>`;
  }
  const pedidos = f.pedidos_envolvidos.map(esc).join(", ");
  const itens = f.itens_envolvidos
    .map((i) => `${esc(i.nome)} (${esc(i.qtd)})`)
    .join(", ");
  const evidencias = f.evidencias
    .map(
      (e) =>
        `<li>${esc(String(e.tipo).replace(/_/g, " "))}: ${esc(e.referencia)}</li>`,
    )
    .join("");
  const fontes = f.fontes
    .map((s) => `<li>${esc(s.rotulo)} — ${esc(s.estado.rotulo)}</li>`)
    .join("");

  return `<article class="foco">
    <p class="foco__eyebrow">FOCO · ${esc(f.unidade_rotulo ?? "A casa")}</p>
    <h2 class="foco__situacao">${esc(f.situacao)}</h2>
    ${f.acao_humana ? `<p class="foco__acao">${esc(f.acao_humana)}</p>` : ""}
    <div class="foco__grade">
      ${campo("Por que esta e não outra", esc(f.motivo_da_escolha))}
      ${campo("Impacto esperado", esc(f.impacto_esperado))}
      ${campo("Pedidos envolvidos", pedidos ? esc(pedidos) : "—")}
      ${campo("Itens envolvidos", itens ? esc(itens) : "—")}
      ${campo("Evidência", evidencias ? `<ul>${evidencias}</ul>` : "—")}
      ${campo("Fontes e saúde", fontes ? `<ul>${fontes}</ul>` : "—")}
      ${campo("Confiança", esc(f.confianca_texto), true)}
      ${campo(
        "Validade",
        f.validade_ate
          ? `até ${esc(hora(f.validade_ate) ?? f.validade_ate)}${
              validadeVencida(f.validade_ate, vm.observado_em) ? " — <strong>já vencida</strong>" : ""
            }`
          : "não declarada nesta cena",
        f.validade_ate === null,
      )}
      ${campo(
        "Condição de retirada",
        esc(f.condicao_de_retirada ?? "não declarada nesta cena"),
        f.condicao_de_retirada === null,
      )}
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ *
 * Blocos de leitura
 * ------------------------------------------------------------------ */

function sinais(lista) {
  if (lista.length === 0) {
    return `<p class="campo__val">Nenhum sinal ativo além do Foco.</p>`;
  }
  return `<ul class="sinais">${lista
    .map(
      (s) => `<li class="sinal" data-sev="${esc(s.severidade)}">
        <span class="sinal__sev">sev ${esc(s.severidade)}</span>
        <span class="sinal__texto">${esc(s.resumo)}</span>
        <span class="sinal__alvo">${esc(s.codigo)} · ${esc(s.alvo_rotulo)}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

function fontes(vm) {
  return `<div class="fontes">${vm.fontes
    .map(
      (f) => `<article class="fonte" data-estado="${esc(f.estado.estado)}" data-fonte="${esc(f.id)}">
      <div class="fonte__topo">
        <h3 class="fonte__nome">${esc(f.rotulo)}</h3>
        <span class="fonte__estado">${esc(f.estado.rotulo)}</span>
      </div>
      <dl>
        <dt>Significa</dt><dd>${esc(f.estado.significado)}</dd>
        <dt>Última</dt><dd>${esc(f.ultima_atualizacao ? (hora(f.ultima_atualizacao) ?? f.ultima_atualizacao) : "nunca respondeu")}</dd>
        <dt>Na leitura</dt><dd>${esc(f.estado.consequencia)}</dd>
        <dt>Confiança</dt><dd>${esc(f.estado.confianca_permitida)}</dd>
        ${f.estado.acao_recomendada ? `<dt>Ação</dt><dd>${esc(f.estado.acao_recomendada)}</dd>` : ""}
        <dt>Detalhe</dt><dd>${esc(f.detalhe)}</dd>
      </dl>
    </article>`,
    )
    .join("")}</div>`;
}

function avisos(vm) {
  const partes = [];
  for (const d of vm.divergencias) {
    partes.push(`<div class="aviso" data-tipo="divergencia">
      <strong>${esc(d.fonte_a)} × ${esc(d.fonte_b)}</strong>
      <p class="aviso__linha">${esc(d.fonte_a)}: ${esc(d.leitura_a)}</p>
      <p class="aviso__linha">${esc(d.fonte_b)}: ${esc(d.leitura_b)}</p>
      <p class="aviso__linha">${esc(d.incompatibilidade)}</p>
    </div>`);
  }
  for (const a of vm.ausencias_materiais) {
    partes.push(`<div class="aviso" data-tipo="${esc(a.natureza)}">
      <strong>${esc(a.o_que)}</strong>
      <p class="aviso__linha">${esc(a.por_que)}</p>
      <p class="aviso__linha">${esc(a.consequencia)}</p>
    </div>`);
  }
  for (const s of vm.sinais_retirados) {
    partes.push(`<div class="aviso" data-tipo="retirado">
      <strong>Retirado · ${esc(s.nome)} — ${esc(s.alvo_rotulo)}</strong>
      <p class="aviso__linha">${esc(hora(s.retirado_em) ?? s.retirado_em)} · ${esc(s.motivo)}</p>
    </div>`);
  }
  return `<div class="avisos">${partes.join("")}</div>`;
}

function consolidacao(vm) {
  return `<div class="consolida">${vm.consolidacoes
    .map(
      (c) => `<article class="pedido" data-fluxo="${esc(c.fluxo)}" data-obrigatorio="${esc(
        c.obrigatorio,
      )}">
      <div class="pedido__topo">
        <span class="pedido__id">${esc(c.pedido_id)}</span>
        <span class="pedido__fluxo">${
          c.fluxo === "caixa" ? "Caixa" : "Delivery / Conferência"
        }${c.obrigatorio ? " · obrigatório" : ""}</span>
        <span class="sinal__alvo">${esc(c.unidades_produtoras.join(" + ") || "sem praça")}</span>
      </div>
      <p class="pedido__motivo">${esc(c.motivo)}</p>
      ${
        c.candidato_a_caixa
          ? `<ul class="pedido__condicoes">${c.condicoes
              .map(
                (x) => `<li data-estado="${esc(x.estado)}"><span class="marca">${esc(
                  x.estado.replace(/_/g, " "),
                )}</span><span>${esc(x.rotulo)} — ${esc(x.detalhe)}</span></li>`,
              )
              .join("")}</ul>`
          : ""
      }
    </article>`,
    )
    .join("")}</div>`;
}

/* ------------------------------------------------------------------ *
 * Modo de Validação
 * ------------------------------------------------------------------ */

function idDaLeitura(vm) {
  return `${vm.cenario_id}::leitura`;
}
function idDaRecomendacao(vm) {
  return vm.foco === null
    ? null
    : `${vm.cenario_id}::foco::${vm.foco.sinal.codigo}::${vm.foco.sinal.alvo_rotulo}`;
}

function registroDe(reading_id) {
  return estado.registros.find((r) => r.reading_id === reading_id) ?? null;
}

function formulario(vm, alvo, reading_id, titulo, entendeu, realidade, vencida) {
  const r = registroDe(reading_id);
  const est = estadoDeValidacao(r, { validadeVencida: vencida });
  const marcado = (campo, valor) =>
    r !== null && r[campo] === valor ? " checked" : "";
  const marcadoLista = (valor) =>
    r !== null && r.correcoes.includes(valor) ? " checked" : "";
  const v = (campo) => (r !== null && r[campo] !== null ? esc(r[campo]) : "");

  return `<form class="validacao" data-alvo="${esc(alvo)}" data-leitura="${esc(reading_id)}">
    <div class="fonte__topo">
      <h3 class="fonte__nome">${esc(titulo)}</h3>
      <span class="validacao__estado" data-estado="${esc(est)}">${esc(ROTULO_ESTADO[est])}</span>
    </div>

    <div class="validacao__comparacao">
      <div class="comparacao__lado" data-lado="sistema">
        <p class="campo__rot">DeliveryOS entendeu</p>
        <p class="campo__val">${esc(entendeu)}</p>
      </div>
      <div class="comparacao__lado" data-lado="realidade" data-vazio="${realidade ? "nao" : "sim"}">
        <p class="campo__rot">O que realmente aconteceu</p>
        <p class="campo__val">${
          realidade
            ? esc(realidade)
            : "Ainda não registrado. Enquanto ninguém disser, o sistema não sabe se acertou."
        }</p>
      </div>
    </div>

    <fieldset>
      <legend>A leitura estava</legend>
      <div class="opcoes">${VEREDITOS.map(
        (x) =>
          `<label class="opcao"><input type="radio" name="verdict" value="${esc(x)}"${marcado(
            "verdict",
            x,
          )} required /> ${esc(ROTULO_VEREDITO[x])}</label>`,
      ).join("")}</div>
    </fieldset>

    <fieldset>
      <legend>O que estava diferente</legend>
      <div class="opcoes">${CORRECOES.map(
        (x) =>
          `<label class="opcao"><input type="checkbox" name="correcoes" value="${esc(
            x,
          )}"${marcadoLista(x)} /> ${esc(ROTULO_CORRECAO[x])}</label>`,
      ).join("")}</div>
    </fieldset>

    <label class="campo-texto"><span>A correção, em uma frase</span>
      <input type="text" name="correcao_texto" maxlength="280" value="${v("correcao_texto")}" /></label>

    <label class="campo-texto"><span>A ação que teria sido mais útil</span>
      <input type="text" name="acao_mais_util" maxlength="280" value="${v("acao_mais_util")}" /></label>

    <label class="campo-texto"><span>Algum problema que o sistema não viu</span>
      <input type="text" name="problema_nao_detectado" maxlength="280" value="${v(
        "problema_nao_detectado",
      )}" /></label>

    <fieldset>
      <legend>Isso ajudou</legend>
      <div class="opcoes">${UTILIDADES.map(
        (x) =>
          `<label class="opcao"><input type="radio" name="utilidade" value="${esc(x)}"${marcado(
            "utilidade",
            x,
          )} /> ${esc(ROTULO_UTILIDADE[x])}</label>`,
      ).join("")}</div>
    </fieldset>

    <fieldset>
      <legend>Antecedência</legend>
      <div class="opcoes">${ANTECEDENCIAS.map(
        (x) =>
          `<label class="opcao"><input type="radio" name="antecedencia" value="${esc(
            x,
          )}"${marcado("antecedencia", x)} /> ${esc(ROTULO_ANTECEDENCIA[x])}</label>`,
      ).join("")}</div>
    </fieldset>

    <label class="campo-texto"><span>Comentário curto</span>
      <textarea name="comentario" rows="2" maxlength="280">${v("comentario")}</textarea></label>

    <div class="acoes">
      <button type="submit" data-primaria="sim">Registrar validação</button>
      ${r !== null ? `<button type="button" data-acao="apagar">Apagar esta validação</button>` : ""}
      <p class="recado" data-papel="recado"></p>
    </div>
  </form>`;
}

function validacao(vm) {
  const vencida =
    vm.foco !== null && vm.foco.validade_ate !== null
      ? validadeVencida(vm.foco.validade_ate, vm.observado_em)
      : false;
  const partes = [
    formulario(
      vm,
      "leitura",
      idDaLeitura(vm),
      "A leitura da operação",
      vm.validacao_esperada.deliveryos_entendeu,
      vm.validacao_esperada.realidade_demonstrada,
      false,
    ),
  ];
  const idRec = idDaRecomendacao(vm);
  if (idRec !== null) {
    partes.push(
      formulario(
        vm,
        "recomendacao",
        idRec,
        "A orientação do Foco",
        `${vm.foco.situacao} ${vm.foco.acao_humana ?? ""}`.trim(),
        vm.validacao_esperada.realidade_demonstrada,
        vencida,
      ),
    );
  }
  return `<div class="avisos">${partes.join("")}</div>`;
}

/* ------------------------------------------------------------------ *
 * Resumo do turno
 * ------------------------------------------------------------------ */

function itemResumo(rot, c) {
  if (!c.observado) {
    return `<div class="resumo__item" data-ausente="sim"><p class="resumo__rot">${esc(
      rot,
    )}</p><p class="resumo__val">${esc(c.explicacao)}</p></div>`;
  }
  const valor = Array.isArray(c.valor)
    ? c.valor.length === 0
      ? "—"
      : c.valor
          .map((x) => (typeof x === "object" ? `${x.rotulo}: ${x.qtd}` : String(x)))
          .join(" · ")
    : String(c.valor);
  return `<div class="resumo__item"><p class="resumo__rot">${esc(rot)}</p><p class="resumo__val">${esc(
    valor,
  )}</p>${c.detalhe ? `<p class="resumo__det">${esc(c.detalhe)}</p>` : ""}</div>`;
}

function resumo() {
  const r = resumoDoTurno(estado.registros, {
    observados: estado.vm ? estado.vm.total_de_sinais : null,
  });
  const linhas = [
    ["Sinais observados", r.sinais_observados],
    ["Total avaliado", r.total_avaliado],
    ["Correto", r.correto],
    ["Parcialmente correto", r.parcialmente_correto],
    ["Incorreto", r.incorreto],
    ["Não confirmado", r.nao_confirmado],
    ["Falsos positivos", r.falsos_positivos],
    ["Problemas não detectados", r.problemas_nao_detectados],
    ["Recomendações validadas", r.recomendacoes_validadas],
    ["Recomendações corrigidas", r.recomendacoes_corrigidas],
    ["Unidade de maior divergência", r.unidade_de_maior_divergencia],
    ["Fonte de maior divergência", r.fonte_de_maior_divergencia],
    ["Utilidade percebida", r.utilidade],
    ["Antecedência", r.antecedencia],
    ["Cenas tocadas", r.cenarios_tocados],
  ];
  return `<div class="resumo">${linhas.map(([rot, c]) => itemResumo(rot, c)).join("")}</div>
    <div class="acoes" style="margin-top:16px">
      <button type="button" id="btnExportar">Exportar JSON</button>
      <button type="button" id="btnImportar">Importar JSON do Lab</button>
      <button type="button" id="btnLimparCena">Reiniciar esta cena</button>
      <button type="button" id="btnLimparTudo">Limpar todas as validações</button>
      <input type="file" id="arquivoImport" accept="application/json,.json" hidden />
      <p class="recado" id="recadoResumo">${esc(r.procedencia)}</p>
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Desenho
 * ------------------------------------------------------------------ */

function desenhar() {
  const vm = estado.vm;
  const h = hora(vm.observado_em);
  $("#hora").textContent = h ? `${h} · SIMULAÇÃO` : "SIMULAÇÃO";
  $("#cenaDemonstra").textContent = vm.demonstra;

  const rebaixado = vm.eleicao.rebaixado
    ? `<div class="rebaixado"><p class="rebaixado__titulo">Falta lastro para dizer que está tudo bem.</p><ul>${vm.eleicao.motivos
        .map((m) => `<li>${esc(m.texto)}</li>`)
        .join("")}</ul></div>`
    : "";

  $("#superficie").innerHTML = `
    <div class="estado chega" data-modo="${esc(vm.modo)}">
      <div>
        <h1 class="estado__titulo">${esc(vm.titulo)}</h1>
        <p class="estado__apoio">${esc(vm.apoio)}</p>
      </div>
      <div class="estado__pulso">
        <span class="pulso__n">${vm.pulso.observado ? esc(vm.pulso.valor) : "—"}</span>
        <span class="pulso__rot">${
          vm.pulso.observado ? "pedidos em andamento" : "pulso não observado"
        }</span>
      </div>
    </div>
    ${rebaixado}
    ${bloco("O que merece atenção agora", null, foco(vm))}
    ${bloco(
      "O caminho do pedido",
      `Ritmo: ${vm.ritmo.texto} — ${vm.ritmo.lastro}`,
      organismo(vm),
    )}
    ${bloco(
      "Ambiente — o que segue ativo",
      `${vm.total_de_sinais} sinal(is) nesta leitura. Nada aqui é escondido pelo Foco.`,
      sinais(vm.ambiente),
    )}
    ${bloco("Saúde das fontes", null, fontes(vm))}
    ${bloco(
      "Divergências, ausências e sinais retirados",
      "Ausência estrutural nunca houve fonte; ausência superveniente havia leitura e parou.",
      avisos(vm),
    )}
    ${bloco(
      "Onde cada pedido é aberto e fechado",
      "ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT — um ponto único por pedido, sem divisão e sem junção posterior.",
      consolidacao(vm),
    )}
    ${bloco("Validação humana", AVISO_PERMANENTE, validacao(vm))}
    ${bloco("Resumo do turno", "Calculado dos registros deste navegador.", resumo())}
    ${bloco(
      "Sinais que este sistema não consegue produzir",
      "Declarados, nunca em silêncio: um sinal ausente sem explicação é indistinguível de um sinal que não disparou.",
      `<ul class="sinais">${vm.sinais_indisponiveis
        .map(
          (s) =>
            `<li class="sinal" data-sev="0"><span class="sinal__sev">${esc(
              s.codigo,
            )}</span><span class="sinal__texto">${esc(s.nome)} — ${esc(
              s.motivo,
            )}</span><span class="sinal__alvo">falta: ${esc(s.fonte_que_falta)}</span></li>`,
        )
        .join("")}</ul>`,
    )}
    ${bloco(
      "O que esta tela não prova",
      null,
      `<div class="avisos">${vm.limitacoes
        .map(
          (l) =>
            `<div class="aviso" data-tipo="estrutural"><strong>${esc(
              l.titulo,
            )}</strong><p class="aviso__linha">${esc(l.texto)}</p></div>`,
        )
        .join("")}</div>`,
    )}
  `;

  ligarValidacao();
  ligarResumo();
}

/* ------------------------------------------------------------------ *
 * Eventos
 * ------------------------------------------------------------------ */

function ligarValidacao() {
  for (const form of document.querySelectorAll("form.validacao")) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const recado = form.querySelector('[data-papel="recado"]');
      const dados = new FormData(form);
      const verdict = dados.get("verdict");
      if (verdict === null) {
        recado.dataset.erro = "sim";
        recado.textContent = "Escolha como a leitura estava antes de registrar.";
        return;
      }
      const vm = estado.vm;
      const unidade =
        form.dataset.alvo === "recomendacao" && vm.foco !== null ? vm.foco.unidade : null;
      const fonteMaisFraca =
        vm.fontes.find((f) => !f.estado.sustenta_calmo) ?? vm.fontes[0] ?? null;
      try {
        const registro = montarRegistro({
          scenario_id: vm.cenario_id,
          reading_id: form.dataset.leitura,
          alvo: form.dataset.alvo,
          verdict,
          correcoes: dados.getAll("correcoes"),
          correcao_texto: dados.get("correcao_texto"),
          acao_mais_util: dados.get("acao_mais_util"),
          problema_nao_detectado: dados.get("problema_nao_detectado"),
          comentario: dados.get("comentario"),
          utilidade: dados.get("utilidade"),
          antecedencia: dados.get("antecedencia"),
          contexto: {
            unidade_id: unidade,
            fonte_id: fonteMaisFraca ? fonteMaisFraca.id : null,
          },
          versao_fixture: vm.versao_fixture,
        });
        await estado.repo.salvar(registro);
        await recarregarRegistros();
        desenhar();
      } catch (e) {
        recado.dataset.erro = "sim";
        recado.textContent = `Não foi possível registrar: ${e.message}`;
      }
    });

    const apagar = form.querySelector('[data-acao="apagar"]');
    if (apagar) {
      apagar.addEventListener("click", async () => {
        const r = registroDe(form.dataset.leitura);
        if (r === null) return;
        await estado.repo.remover(r.validation_id);
        await recarregarRegistros();
        desenhar();
      });
    }
  }
}

function ligarResumo() {
  const recado = $("#recadoResumo");

  $("#btnExportar").addEventListener("click", () => {
    const r = exportar(
      estado.registros,
      resumoDoTurno(estado.registros, { observados: estado.vm.total_de_sinais }),
    );
    if (!r.ok) {
      recado.dataset.erro = "sim";
      recado.textContent = r.detalhe;
      return;
    }
    const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "deliveryos-lab-v4-validacoes.json";
    a.click();
    URL.revokeObjectURL(url);
    recado.dataset.erro = "nao";
    recado.textContent = `Exportadas ${estado.registros.length} validação(ões). Nada foi enviado a lugar nenhum.`;
  });

  const arquivo = $("#arquivoImport");
  $("#btnImportar").addEventListener("click", () => arquivo.click());
  arquivo.addEventListener("change", async () => {
    const f = arquivo.files && arquivo.files[0];
    if (!f) return;
    const texto = await f.text();
    arquivo.value = "";
    const r = importar(texto);
    if (!r.ok) {
      recado.dataset.erro = "sim";
      recado.textContent = `Importação recusada (${r.motivo}): ${r.detalhe}`;
      return;
    }
    for (const reg of r.registros) await estado.repo.salvar(reg);
    await recarregarRegistros();
    desenhar();
    $("#recadoResumo").textContent = `Importadas ${r.registros.length} validação(ões).`;
  });

  $("#btnLimparCena").addEventListener("click", async () => {
    await estado.repo.limparCenario(estado.vm.cenario_id);
    await recarregarRegistros();
    desenhar();
  });

  $("#btnLimparTudo").addEventListener("click", async () => {
    await estado.repo.limpar();
    await recarregarRegistros();
    desenhar();
  });
}

/* ------------------------------------------------------------------ *
 * Dados
 * ------------------------------------------------------------------ */

async function obter(caminho) {
  const r = await fetch(caminho, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}`);
  return r.json();
}

async function recarregarRegistros() {
  estado.registros = await estado.repo.listar();
}

async function trocarCena(id) {
  const main = $("#leitura");
  main.setAttribute("aria-busy", "true");
  $("#carregando").hidden = false;
  try {
    estado.vm = await obter(`${BASE}/api/cena/${encodeURIComponent(id)}`);
    desenhar();
  } finally {
    $("#carregando").hidden = true;
    main.setAttribute("aria-busy", "false");
  }
}

async function iniciar() {
  $("#avisoValidacao").textContent = AVISO_PERMANENTE;

  // A persistência real é IndexedDB. Se este navegador não a expõe, o Lab NÃO
  // finge que salvou: ele cai para memória e diz isso em voz alta.
  if (IndexedDbValidationRepository.disponivel()) {
    estado.repo = new IndexedDbValidationRepository();
    estado.persistencia = "indexeddb";
  } else {
    estado.repo = new MemoryValidationRepository();
    estado.persistencia = "memoria";
  }
  try {
    await estado.repo.abrir();
  } catch (e) {
    estado.repo = new MemoryValidationRepository();
    estado.persistencia = "memoria";
    $("#faixa").textContent = `LABORATÓRIO EXPERIMENTAL · A VALIDAÇÃO NÃO ESTÁ SENDO SALVA (${e.message})`;
  }
  if (estado.persistencia === "memoria") {
    $("#avisoValidacao").textContent = `${AVISO_PERMANENTE} Neste navegador ela nem isso: some ao recarregar.`;
  }
  await recarregarRegistros();

  estado.cenas = await obter(`${BASE}/api/cenas`);
  const sel = $("#seletorCena");
  sel.innerHTML = estado.cenas.grupos
    .map(
      (g) =>
        `<optgroup label="${esc(g.titulo)}">${g.cenas
          .map((id) => {
            const c = estado.cenas.cenas.find((x) => x.id === id);
            return `<option value="${esc(id)}">${esc(c ? c.titulo : id)}</option>`;
          })
          .join("")}</optgroup>`,
    )
    .join("");
  sel.addEventListener("change", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("cena", sel.value);
    window.history.replaceState(null, "", url);
    void trocarCena(sel.value);
  });

  const pedida = new URLSearchParams(window.location.search).get("cena");
  const inicial =
    pedida !== null && estado.cenas.cenas.some((c) => c.id === pedida)
      ? pedida
      : estado.cenas.cenas[0].id;
  sel.value = inicial;
  await trocarCena(inicial);
}

iniciar().catch((e) => {
  $("#carregando").hidden = true;
  $("#superficie").innerHTML = `<div class="rebaixado"><p class="rebaixado__titulo">O laboratório não conseguiu iniciar.</p><p class="campo__val">${esc(
    e.message,
  )}. Nada nesta tela representa estado nenhum — a leitura falhou, e isso não é o mesmo que "não há nada".</p></div>`;
});
