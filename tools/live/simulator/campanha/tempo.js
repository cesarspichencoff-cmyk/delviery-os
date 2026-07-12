/* ============================================================================
 * DeliveryOS · tools/live/simulator/campanha · TEMPO LOCAL DA LOJA
 * ----------------------------------------------------------------------------
 * Converte "dia local + hora local" no fuso IANA da loja para o instante UTC
 * correspondente — sem offset fixo escondido (funciona para qualquer fuso,
 * inclusive com DST, por aproximação iterativa via Intl). Determinístico.
 * ==========================================================================*/
"use strict";

const formatadores = new Map();

function formatador(tz) {
  let f = formatadores.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    formatadores.set(tz, f);
  }
  return f;
}

/** representa um instante como "YYYY-MM-DDTHH:mm:ss" no fuso dado */
function localDe(ms, tz) {
  const partes = formatador(tz).formatToParts(new Date(ms));
  const p = (t) => partes.find((x) => x.type === t).value;
  const hora = p("hour") === "24" ? "00" : p("hour"); // peculiaridade do Intl
  return `${p("year")}-${p("month")}-${p("day")}T${hora}:${p("minute")}:${p("second")}`;
}

/**
 * Instante UTC (ms) do horário local `HH:mm[:ss]` no dia local `YYYY-MM-DD`.
 * @throws se o fuso for inválido ou a conversão não convergir.
 */
function utcDeHorarioLocal(diaLocal, horaLocal, tz) {
  const alvo = `${diaLocal}T${horaLocal.length === 5 ? horaLocal + ":00" : horaLocal}`;
  const alvoMs = Date.parse(alvo + "Z");
  if (Number.isNaN(alvoMs)) throw new Error(`tempo_local_invalido: ${alvo}`);
  let ms = alvoMs; // chute inicial: como se o local fosse UTC
  for (let i = 0; i < 4; i++) {
    const visto = Date.parse(localDe(ms, tz) + "Z");
    const diff = alvoMs - visto;
    if (diff === 0) return ms;
    ms += diff;
  }
  throw new Error(`tempo_local_nao_convergiu: ${alvo} em ${tz}`);
}

/** dia local seguinte (aritmética de calendário, sem fuso) */
function proximoDiaLocal(diaLocal) {
  const d = new Date(Date.parse(diaLocal + "T12:00:00Z")); // meio-dia evita borda
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "HH:mm" -> minutos desde 00:00 local */
function minutosDe(horaLocal) {
  const [h, m] = horaLocal.split(":").map(Number);
  return h * 60 + m;
}

module.exports = { utcDeHorarioLocal, proximoDiaLocal, minutosDe, localDe };
