// Prévia navegável do Copiloto com o caso FICTÍCIO das 19:05: um HTML único, sem servidor nem dado real.
// As telas são geradas pelo MESMO home.js do produto, percorrendo os links a partir do Agora.
//   node tests/copiloto-turno/gerar-vitrine.mjs <saida.html>
import {mkdtemp,cp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import caso from "./caso.cjs";
const raiz=fileURLToPath(new URL("../../",import.meta.url));
const saida=process.argv[2]??join(raiz,"vitrine-copiloto-itaim.html");
const tmp=await mkdtemp(join(tmpdir(),"vitrine-itaim-"));
try {
  await cp(join(raiz,"src/product/ui"),tmp,{recursive:true});
  await writeFile(join(tmp,"package.json"),'{"type":"module"}');
  const {telaHome}=await import(pathToFileURL(join(tmp,"surfaces/home.js")));
  const dados=caso.montar(), o=dados.operacao_ifood, v=dados.home_operacional;
  // Só na prévia: o pedido pronto #4170 aparece com entregador na loja, para mostrar a expedição.
  Object.assign(o.pedidos[3],{etapa:"pronto · entregador na loja",pronto_ha_min:6});
  const rota="/copiloto?unidade=ITAIM";
  const chave=q=>{const p=new URLSearchParams(q);p.delete("unidade");p.sort();return p.toString();};
  function tela(q,parada=false){
    globalThis.location={hash:"#"+rota+"&"+q};
    const salvo={velha:o.leitura_velha,ha:o.gravado_ha_min,em:o.gravado_em};
    if(parada)Object.assign(o,{leitura_velha:true,gravado_ha_min:27,gravado_em:"2026-11-20T21:38:00.000Z"});
    try{return telaHome({...v,rota_home:rota,operacao_ifood:o});}
    finally{Object.assign(o,{leitura_velha:salvo.velha,gravado_ha_min:salvo.ha});if(salvo.em===undefined)delete o.gravado_em;}
  }
  const paginas={}, fila=["menu=mapa"], vistas=new Set();
  while(fila.length&&Object.keys(paginas).length<120){
    const q=fila.shift(), k=chave(q); if(vistas.has(k))continue; vistas.add(k);
    let html;
    try { html=tela(q); } catch { paginas[k]=null; continue; } // consulta que depende do servidor real (Fontes): fora da prévia
    paginas[k]=html;
    for(const m of html.matchAll(/href="#\/copiloto\?unidade=ITAIM&amp;([^"]+)"/g)){const prox=m[1].replaceAll("&amp;","&");if(!vistas.has(chave(prox)))fila.push(prox);}
  }
  paginas[chave("menu=mapa&demo=parada")]=tela("menu=mapa",true);
  const css=["../../entregas/ui/shared/tokens.css","tokens/product-tokens.css","tokens/organismo-tokens.css","tokens/organismo-fonts.css","shell/shell.css","components/components.css","surfaces/home.css","surfaces/entregas.css"];
  const estilos=(await Promise.all(css.map(f=>readFile(join(raiz,"src/product/ui",f),"utf8").catch(()=>"")))).join("\n");
  const doc=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Prévia do Copiloto Itaim</title><style>${estilos}
body{background:#08130d;margin:0}#app{padding-inline:16px} /* recuo inicial; o script copia o da margem negativa do .org. Nada de clip, para a medição valer. */
.vitrine-faixa{color:#f2ebd9;background:#0f241a;padding:.6rem 1rem;border-bottom:1px solid currentColor;font:14px/1.4 system-ui,sans-serif}.vitrine-faixa a{color:#8cc63f;min-height:44px;display:inline-flex;align-items:center}</style></head>
<body><div class="vitrine-faixa" role="note"><strong>Prévia com caso fictício</strong> · turno de ensaio às 19:05, nomes e números inventados. Nenhum dado real.
<a href="#${rota}&menu=mapa">Agora</a> · <a href="#${rota}&menu=mapa&demo=parada">Ver com a fonte parada</a></div><div id="app"></div>
<script type="application/json" id="paginas">${JSON.stringify(paginas).replaceAll("<","\\u003c")}</script>
<script>
const paginas=JSON.parse(document.getElementById("paginas").textContent);
const chave=h=>{const q=(h.split("?")[1]||"");const p=new URLSearchParams(q);p.delete("unidade");p.sort();return p.toString();};
function mostrar(){const k=chave(location.hash||"#/copiloto?unidade=ITAIM&menu=mapa");const html=paginas[k]??paginas[chave("#/copiloto?unidade=ITAIM&menu=mapa")];
  const app=document.getElementById("app");
  app.innerHTML=paginas[k]?html:'<p role="status" style="padding:1rem">Esta consulta depende da leitura real do caixa e não faz parte da prévia.</p>'+paginas[chave("#/copiloto?unidade=ITAIM&menu=mapa")];
  // O shell do app dá ao .org o recuo que a margem negativa dele pede (16 px no celular, 24 px no desktop).
  const org=app.querySelector(".org");if(org)app.style.paddingInline=Math.max(0,-parseFloat(getComputedStyle(org).marginLeft))+"px";
  window.scrollTo(0,0);}
addEventListener("resize",()=>{const org=document.querySelector("#app .org");if(org){document.getElementById("app").style.paddingInline="0px";document.getElementById("app").style.paddingInline=Math.max(0,-parseFloat(getComputedStyle(org).marginLeft))+"px";}});
addEventListener("hashchange",mostrar);mostrar();
</script></body></html>`;
  await writeFile(saida,doc,"utf8");
  console.log("VITRINE "+Object.keys(paginas).length+" telas -> "+saida);
} finally { await rm(tmp,{recursive:true,force:true}); }
