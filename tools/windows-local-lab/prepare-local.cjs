
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname, app=path.join(root,'app');
const secret=()=>crypto.randomBytes(32).toString('hex');
const target=path.join(root,'private-local.json');
if(fs.existsSync(target))throw Error('Config existente: nao substituir segredos');
const s={admin:secret(),critical:secret(),async:secret(),pilot:secret(),device:secret(),read:secret(),users:[]};
const cfg=JSON.parse(fs.readFileSync(path.join(app,'config/entregas-pilot.example.json'),'utf8'));
cfg.mode='test';cfg.source_mode='simulated';cfg.bind='127.0.0.1';cfg.data_dir=path.join(root,'data','pilot');
cfg.banner='ENSAIO LOCAL — SEM OPERACAO REAL — {unit_name}';
cfg.users.forEach((u,i)=>{u.actor_id='lab-mooca-'+i;u.label='Participante ficticio '+i;u.token=secret();s.users.push(u)});
cfg.features=Object.fromEntries(Object.keys(cfg.features).map(k=>[k,false]));
fs.writeFileSync(path.join(root,'pilot-local.json'),JSON.stringify(cfg,null,2));
fs.writeFileSync(path.join(root,'gps-disabled.json'),JSON.stringify({gps_capture_enabled:false}));
fs.mkdirSync(path.join(root,'logs'),{recursive:true});
fs.writeFileSync(target,JSON.stringify(s,null,2),{flag:'wx'});
fs.writeFileSync(path.join(root,'pg-password.txt'),s.admin+'\n',{flag:'wx'});
console.log('LOCAL_CONFIG_PREPARED: credenciais geradas localmente; ITAIM; simulated; GPS desativado');
