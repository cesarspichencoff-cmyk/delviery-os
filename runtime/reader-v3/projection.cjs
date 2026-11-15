'use strict';
const {hash}=require('./store.cjs');
function project(e){
 if(e.schema!=='deliveryos.reader-v3.capture.v1'||e.revision!==hash({order:e.order,childRows:e.childRows,service:e.service}))throw Error('CAPTURE_DIGEST');
 const o=e.order,rs=e.childRows,products=new Map(rs.PRODUTO.rows.map(r=>[r.CDPRODUTO,r.NMPRODUTO]));
 const occurrences=new Map(rs.OCORRENCIA.rows.map(r=>[JSON.stringify([r.CDGRPOCOR,r.CDOCORR]),r]));
 const occurrence=r=>occurrences.get(JSON.stringify([r.CDGRPOCOR,r.CDOCORR]));
 const note=r=>occurrence(r).DSOCORR||occurrence(r).DSAPELIDOOBS;
 const itens=o.items.map((r,i)=>{
  const components=rs.ITCOMANDAEST.rows.filter(c=>c.NRPRODCOMVEN===r.NRPRODCOMVEN).map(c=>({codigo:c.CDPRODUTO,nome:products.get(c.CDPRODUTO),quantidade_nativa:c.QTPROCOMEST,
   observacoes:rs.OBSITCOMANDAEST.rows.filter(n=>n.NRPRODCOMVEN===c.NRPRODCOMVEN&&n.CDPRODUTO===c.CDPRODUTO).map(note)}));
  const complements=rs.OBSITCOMANDAVEN.rows.filter(c=>c.NRPRODCOMVEN===r.NRPRODCOMVEN&&c.NRPRODCOMVENOBS!==null).map(c=>({linha:c.NRPRODCOMVENOBS,codigo:occurrence(c).CDPRODUTO,nome:note(c),quantidade_nativa:c.QTPRODCOMVENOBS}));
  const obs=o.observation_rows.filter(n=>n.item_index===i&&n.CDPRODUTO===r.CDPRODUTO).map(n=>n.value);
  const ordinary=rs.OBSITCOMANDAVEN.rows.filter(c=>c.NRPRODCOMVEN===r.NRPRODCOMVEN&&c.NRPRODCOMVENOBS===null).map(note);
  const combo=rs.ITCOMANDAVEN_COMBO.rows.find(c=>c.NRPRODCOMVEN===r.NRPRODCOMVEN);
  const q=Number(r.QTPRODCOMVEN);
  return {indice:i+1,codigo:r.CDPRODUTO,codigo_arvore:r.CDARVPROD,nome:products.get(r.CDPRODUTO),quantidade:Number.isSafeInteger(q)&&q>0?q:null,quantidade_nativa:r.QTPRODCOMVEN,estado_nativo:r.IDSTPRCOMVEN,
   observacoes:[...obs,...ordinary],componentes:components,complementos:complements,
   combinado:combo.CDPRODPROMOCAO===null?null:{codigo:combo.CDPRODPROMOCAO,nome:products.get(combo.CDPRODPROMOCAO),grupo:combo.NRSEQPRODCOM}};
 });
 const validService=['ALMOCO','JANTAR'].includes(e.service?.turno);
 return {chave:e.order_key,codigo_curto:o.NRCOMANDAEXT,origem:o.IDORGCMDVENDA,aberto_em_local:o.DTHRABERMESA.slice(0,19),dia:o.DTHRABERMESA.slice(0,10),turno:e.service?.turno??'SEM_POLITICA',revisao:e.revision,observado_em:e.observed_at,estado_nativo:o.IDSTCOMANDA,
  retido:!validService,motivos_de_retencao:validService?[]:['SERVICE_POLICY_UNRESOLVED'],bloqueios_de_turno_substituidos:[],itens,
  observacoes_do_pedido:o.observation_rows.filter(n=>n.scope_hint==='order').map(n=>n.value),
  completude:{itens:'observados',observacoes:'campos_de_texto_lidos',observacoes_por_ocorrencia:'relacoes_lidas_nao_confirmadas',componentes:'relacoes_lidas_nao_confirmadas',complementos:'relacoes_lidas_nao_confirmadas'},
  reader_v3:{politica:e.service?.versao??null,independent_ifood_completeness:'NOT_CONFIRMED',sql_snapshot_atomicity_proven:false,source_writer_finished_proven:false}};
}
module.exports={project};
