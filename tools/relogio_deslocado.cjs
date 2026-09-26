/*
 * Relógio civil deslocado — SÓ para prova de teste.
 *
 * Carregado por `NODE_OPTIONS="--require <este arquivo>"`, desloca a data civil
 * do processo (e dos filhos, que herdam NODE_OPTIONS) por
 * RELOGIO_DESLOCAMENTO_MS. Serve para provar que uma suíte não depende do dia
 * em que roda: o teste e o servidor que ele sobe passam a "viver" na mesma
 * outra data, e a relação entre os carimbos do teste e o "agora" do validador
 * continua a mesma.
 *
 * Só a data civil muda. `new Date(x)` com argumento, `Date.parse`, `Date.UTC`
 * e o relógio monotônico (timers, performance.now) ficam intactos. Datas
 * criadas pelo próprio Node (mtime de arquivo, cabeçalho HTTP Date) continuam
 * reais, e `instanceof Date` continua valendo para elas.
 *
 * Sem RELOGIO_DESLOCAMENTO_MS, não faz nada.
 */
"use strict";

const deslocamento = Number(process.env.RELOGIO_DESLOCAMENTO_MS || 0);

if (Number.isFinite(deslocamento) && deslocamento !== 0) {
  const DataReal = Date;
  const agora = () => DataReal.now() + deslocamento;
  function DataDeslocada(...args) {
    if (!new.target) return new DataReal(agora()).toString();
    return args.length === 0 ? new DataReal(agora()) : new DataReal(...args);
  }
  DataDeslocada.prototype = DataReal.prototype;
  Object.setPrototypeOf(DataDeslocada, DataReal);
  DataDeslocada.now = agora;
  DataDeslocada.parse = DataReal.parse;
  DataDeslocada.UTC = DataReal.UTC;
  globalThis.Date = DataDeslocada;
}
