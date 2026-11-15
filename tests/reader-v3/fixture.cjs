'use strict';
function fixture(n=1){
 const scope={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:String(n).padStart(10,'0'),NRCOMANDA:String(n+10000).padStart(10,'0')};
 const h={...scope,NRCOMANDAEXT:String(n),IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'X',DTHRABERMESA:'2026-11-15T12:00:00.000',DSOBSCOMANDA:'FICT_ORDER_NOTE'};
 const item=(line,sku,q='1.000')=>({...scope,NRPRODCOMVEN:line,CDPRODUTO:sku,CDARVPROD:sku==='P1'?'9.20.00.010.00':'9.20.00.020.00',QTPRODCOMVEN:q,IDSTPRCOMVEN:'4',DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:null});
 const items=[item('001','P1'),item('002','P2','2.000')];items[0].DSOBSDESCIT='FICT_NO_CILANTRO';
 const wrap=rows=>({rows,totalRows:rows.length,readExhausted:true});
 return {readExhausted:true,headerRows:[h],itemRows:items,childRows:{
  ITCOMANDAVEN_COMBO:wrap(items.map((r,i)=>({...scope,NRPRODCOMVEN:r.NRPRODCOMVEN,CDPRODUTO:r.CDPRODUTO,CDPRODPROMOCAO:i===0?'P4':null,NRSEQPRODCOM:i===0?'1':null}))),
  ITCOMANDAEST:wrap([{...scope,NRPRODCOMVEN:'001',CDPRODUTO:'P3',QTPROCOMEST:'3.000'}]),
  OBSITCOMANDAVEN:wrap([{...scope,NRPRODCOMVEN:'001',CDGRPOCOR:'G1',CDOCORR:'O1',NRPRODCOMVENOBS:'002',QTPRODCOMVENOBS:'2.000'}]),
  OBSITCOMANDAEST:wrap([{...scope,NRPRODCOMVEN:'001',CDPRODUTO:'P3',CDGRPOCOR:'G1',CDOCORR:'O2'}]),
  OCORRENCIA:wrap([{CDGRPOCOR:'G1',CDOCORR:'O1',CDPRODUTO:'P2',DSOCORR:'FICT_EXTRA',DSAPELIDOOBS:null},{CDGRPOCOR:'G1',CDOCORR:'O2',CDPRODUTO:null,DSOCORR:'FICT_CHILD_NOTE',DSAPELIDOOBS:null}]),
  PRODUTO:wrap(['P1','P2','P3','P4'].map(p=>({CDPRODUTO:p,NMPRODUTO:'FICT_'+p})))}};
}
const key=f=>['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA'].map(k=>f.headerRows[0][k]).join('|');
module.exports={fixture,key};

// The product serves these modules as browser ESM. Load their unchanged logic
// here without changing the repository's CommonJS package or requiring a browser.
async function renderCopiloto(vm) {
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'../../src/product/ui');
 const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
 const ui=moduleUrl(fs.readFileSync(path.join(root,'components/ui.js')));
 const surface=fs.readFileSync(path.join(root,'surfaces/copiloto.js'),'utf8').replace('../components/ui.js',ui);
 const {telaCopiloto}=await import(moduleUrl(surface));
 return telaCopiloto(vm);
}
module.exports.renderCopiloto=renderCopiloto;
