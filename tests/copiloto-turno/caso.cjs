// Dados de bancada. Mesmo renderer, classificação de sacolas e motor de previsão do Itaim.
const { createHash } = require("node:crypto");
const { medirFilaItaim } = require("../../dist/src/product/viewmodels/medicao-fila-itaim.js");
const { previsaoDoTurnoItaim } = require("../../dist/src/product/viewmodels/previsao-turno-itaim.js");
const bruto = require("./caso.json");
const reembolso = p => p.etapa === "cancelado";
const cardapio = {
  enrolados: ["Enrolados","sushi"], cozinha_quentes: ["Cozinha","cozinha"], enrolados_quentes: ["Sushi Quentes","sushi"]
};
const chave = p => createHash("sha256").update("turno-ficticio-"+p.id).digest("hex");
const agora = Date.parse("2026-11-20T19:05:00-03:00");
function montar() {
  const pedidos = bruto.pedidos.map(p => ({
    chave_gestor:chave(p), codigo:p.ifood, hora:"18:40", ativo:!reembolso(p), etapa:p.etapa, nome_cliente:p.cliente,
    modalidade:"entrega iFood", teknisa:{sequencia:p.comanda?.slice(-3) ?? null},
    // Como a VM real: pedido em preparo traz a hora do prazo; Lia ainda tem 4 min até 19:09.
    preparo:{passou_min:p.atraso_min,...(p.prazo?{prazo:p.prazo}:{}),...(p.id===3?{faltam_min:4}:{})}, detalhes:[],
    itens:p.itens.map(i=>({descricao:i.quantidade+"× "+i.produto,opcoes:[],observacao:i.nota ?? null}))
  }));
  const grupos = Object.entries(cardapio).map(([praca,[rotulo,ambiente]])=>{
    const itens=bruto.pedidos.flatMap(p=>reembolso(p)?[]:p.itens.filter(i=>i.praca===praca).map(i=>({
      chave_gestor:chave(p), codigo:p.ifood, hora:"18:40", etapa:p.etapa, produto:i.produto, codigo_produto:i.produto==="Guioza"?"2":"1",
      descricao:i.quantidade+"× "+i.produto, quantidade:i.quantidade,opcoes:[],observacoes:i.nota?[{fonte:"iFood",texto:i.nota}]:[]
    })));
    const total=etapa=>itens.filter(i=>i.etapa===etapa).reduce((a,i)=>a+i.quantidade,0);
    return {praca,rotulo,ambiente,itens,em_preparo:total("em preparo"),prontos:total("pronto")};
  });
  const previa={grupos,pendentes:[],notas_gerais:[]};
  // Mesmos campos que a VM real envia ao Copiloto (titulo, conciliacao, janela, limitacoes), com valores do caso.
  const o={disponivel:true,leitura_velha:false,gravado_ha_min:1,pedidos,atencao:[],previa_por_praca:previa,
    titulo:"4 pedidos em andamento no iFood",janela:"18:40–19:05",
    conciliacao:{correspondencia_comprovada:3,complemento_nao_lido_pela_teknisa:0,sem_comanda_na_teknisa:0,item_ou_quantidade_divergente:0,somente_na_teknisa_na_janela:0},
    limitacoes:["Caso fictício de aceite: identidades e números inventados."],
    contagens:{em_andamento:4,em_preparo:3,aguardando_aceite:0,prontos:1,na_rua:0,concluidos:0,cancelados:1},medicao_itaim:medirFilaItaim(pedidos.filter(p=>p.ativo),previa)};
  const ambiente=(id, rotulo, subareas=[])=>({id,rotulo,subareas,cor:"sem_medicao",estado_texto:"",motivo:"",pressao:{observado:false}});
  const gestor={estado:"lido",pedidos:[40,25,10,6,1].map((m,i)=>({id_interno:"ficticio-"+i,eventos:{PLACED:new Date(agora-m*60000).toISOString()},teste:false}))};
  const home={modo:"ambiente",titulo:"Turno de ensaio",observado_em:new Date(agora).toISOString(),demonstracao:false,ligacoes:[],
    ambientes:[ambiente("caixa","Caixa"),ambiente("sushi","Sushi",[ambiente("enrolados","Enrolados"),ambiente("enrolados_quentes","Sushi Quentes")]),
      ambiente("cozinha","Cozinha"),ambiente("conferencia","Conferência"),ambiente("motoboy","Motoboy")],
    previsao_turno:previsaoDoTurnoItaim(agora,gestor,o),aprofundamentos:[]};
  return {home_operacional:home,operacao_ifood:o};
}
module.exports={montar,agora,previsaoDoTurnoItaim};
