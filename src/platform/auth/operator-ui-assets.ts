import * as fs from 'node:fs';
import * as path from 'node:path';

/** Same-origin bundle: reuse the canonical palette and motion values without
 * exposing the product server, widening the CSP or copying a second token set. */
export function loadOperatorUiAssets(appRoot: string) {
  const root=path.join(appRoot,'src/entregas/ui/copiloto/pedidos');
  const read=(file:string)=>fs.readFileSync(file,'utf8');
  const motion=JSON.parse(read(path.join(appRoot,'docs/figma/MOTION_TOKENS.json')));
  const tokens=Object.entries({...motion.duracao,...motion.easing})
    .map(([key,value])=>`--${key}:${value};`).join('');
  return {
    html:read(path.join(root,'index.html')),
    js:read(path.join(root,'app.js')),
    css:read(path.join(appRoot,'src/product/ui/tokens/organismo-tokens.css'))+
      `\n:root{${tokens}}\n`+read(path.join(root,'app.css')),
  };
}
