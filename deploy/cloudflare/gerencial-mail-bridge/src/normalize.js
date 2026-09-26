import { listSheets, readCells } from "./ooxml.js";

const DAY_MS = 86400000;

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function near(a, b, tolerance = 0.02) {
  return Math.abs(num(a) - num(b)) <= tolerance;
}

function parseBusinessDate(subject, sentAt) {
  const match = String(subject ?? "").match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!match) throw new Error("Business date not found in subject");
  const day = Number(match[1]);
  const month = Number(match[2]);
  const sent = new Date(sentAt);
  let year = sent.getUTCFullYear();
  const sentMonth = sent.getUTCMonth() + 1;
  if (sentMonth === 1 && month === 12) year -= 1;
  if (sentMonth === 12 && month === 1) year += 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error("Invalid business date");
  }
  return date.toISOString().slice(0, 10);
}

function findDaySheet(content, day) {
  const candidates = listSheets(content);
  const wanted = new RegExp("^dia\\s*0?" + day + "\\.?\\s*$", "i");
  const found = candidates.find((name) => wanted.test(name));
  if (!found) throw new Error("Daily report sheet not found for day " + day);
  return found;
}

function periodGross(cells, col) {
  return round2(
    num(cells[col + "7"]) +
    num(cells[col + "9"]) +
    num(cells[col + "11"]) +
    num(cells[col + "12"]),
  );
}

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function selectPeriodSheet(content, report, col, period) {
  const prefix = period === "lunch" ? "ALMOCO" : "JANTAR";
  const expected = period === "lunch" ? "ALMOCO" : "JANTAR";
  const refs = ["E3","D5","D24","D25","G5","M5","R25"];
  const allNames = listSheets(content)
    .filter((name) => fold(name).startsWith(prefix));
  const currentNames = allNames.filter((name) => !fold(name).includes("ANTIGA"));
  const pool = currentNames.length ? currentNames : allNames;
  const candidates = pool
    .map((name) => {
      const cells = readCells(content, name, refs);
      let score = 0;
      if (fold(cells.E3) === expected) score += 1;
      if (near(cells.M5, report[col + "7"])) score += 4;
      if (near(cells.G5, report[col + "9"])) score += 3;
      if (near(cells.R25, periodGross(report, col))) score += 5;
      return { name, cells, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    throw new Error("No " + period + " Bordero sheet found");
  }
  return candidates[0];
}

export function normalizeClosing({ uid, subject, sentAt, reportContent, borderoContent }) {
  const businessDate = parseBusinessDate(subject, sentAt);
  const day = Number(businessDate.slice(-2));
  const reportSheet = findDaySheet(reportContent, day);

  const report = readCells(reportContent, reportSheet, [
    "D3","B6","C6","D6","B7","C7","D7","B8","C8","D8",
    "B9","C9","D9","B10","C10","D10","B11","C11","D11",
    "B12","C12","D12","B13","C13","D13",
  ]);
  const lunchSelected = selectPeriodSheet(borderoContent, report, "B", "lunch");
  const dinnerSelected = selectPeriodSheet(borderoContent, report, "C", "dinner");
  const lunch = lunchSelected.cells;
  const dinner = dinnerSelected.cells;

  const lunchGross = periodGross(report, "B");
  const dinnerGross = periodGross(report, "C");
  const reportGross = round2(num(report.D3) || lunchGross + dinnerGross);
  const borderoGross = round2(num(lunch.R25) + num(dinner.R25));
  const flags = [];
  if (String(lunch.E3 ?? "").trim().toUpperCase() !== "ALMOÇO") {
    flags.push("bordero_lunch_period_label_mismatch");
  }
  if (String(dinner.E3 ?? "").trim().toUpperCase() !== "JANTAR") {
    flags.push("bordero_dinner_period_label_mismatch");
  }
  if (!near(lunch.D24, lunch.D25)) flags.push("lunch_machine_system_difference");
  if (!near(dinner.D24, dinner.D25)) flags.push("dinner_machine_system_difference");
  if (!near(lunch.M5, report.B7)) flags.push("lunch_ifood_crosscheck_mismatch");
  if (!near(dinner.M5, report.C7)) flags.push("dinner_ifood_crosscheck_mismatch");
  if (!near(lunch.G5, report.B9)) flags.push("lunch_app_crosscheck_mismatch");
  if (!near(dinner.G5, report.C9)) flags.push("dinner_app_crosscheck_mismatch");
  if (!near(reportGross, lunchGross + dinnerGross)) {
    flags.push("report_total_component_mismatch");
  }
  if (!near(reportGross, borderoGross)) flags.push("report_bordero_total_mismatch");

  return {
    mailbox_uid: uid,
    business_date: businessDate,
    message_sent_at: new Date(sentAt).toISOString(),
    report_gross_total: reportGross,
    lunch_gross: lunchGross,
    dinner_gross: dinnerGross,
    ifood_orders_total: num(report.D6),
    ifood_value_total: round2(report.D7),
    app_orders_total: num(report.D8),
    app_value_total: round2(report.D9),
    tel_orders_total: num(report.D10),
    tel_value_total: round2(report.D11),
    salao_value_total: round2(report.D12),
    discounts_value_total: round2(report.D13),
    lunch_cash: round2(lunch.D5),
    dinner_cash: round2(dinner.D5),
    lunch_machine_total: round2(lunch.D24),
    dinner_machine_total: round2(dinner.D24),
    lunch_bordero_total: round2(lunch.R25),
    dinner_bordero_total: round2(dinner.R25),
    report_bordero_diff: round2(reportGross - borderoGross),
    totals_match: near(reportGross, borderoGross),
    period_label_mismatch: flags.some((f) => f.includes("period_label_mismatch")),
    quality_flags: flags,
    metrics: {
      reportSheet,
      lunchBorderoSheet: lunchSelected.name,
      dinnerBorderoSheet: dinnerSelected.name,
      report_component_total: round2(lunchGross + dinnerGross),
      bordero_total: borderoGross,
      lunch_ifood_value: round2(report.B7),
      dinner_ifood_value: round2(report.C7),
      lunch_app_value: round2(report.B9),
      dinner_app_value: round2(report.C9),
    },
  };
}
