/* Servidor estático mínimo p/ preview do protótipo. */
const http=require("http"), fs=require("fs"), path=require("path");
const DIR=path.join(__dirname,"..","prototipos","parados-agora");
const PORT=5178;
const types={".html":"text/html",".js":"text/javascript",".json":"application/json",".css":"text/css"};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/index.html";
  const f=path.join(DIR,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end("404");return;}
    res.writeHead(200,{"Content-Type":types[path.extname(f)]||"application/octet-stream"}); res.end(d); });
}).listen(PORT,()=>console.log("serving "+DIR+" on http://localhost:"+PORT));
