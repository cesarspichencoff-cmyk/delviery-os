
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,s=JSON.parse(fs.readFileSync(path.join(root,'private-local.json')));
const {Client}=require(path.join(root,'app/node_modules/pg'));
(async()=>{const client=new Client({connectionString:'postgresql://deliveryos_owner:'+s.admin+'@127.0.0.1:55436/deliveryos_lab'});await client.connect();
try{if(process.argv[2]==='write'){
 await client.query('CREATE SCHEMA lab_check');await client.query('CREATE TABLE lab_check.persistence_probe (id integer PRIMARY KEY, marker text NOT NULL)');
 const marker=crypto.randomBytes(24).toString('hex');await client.query('INSERT INTO lab_check.persistence_probe VALUES (1,$1)',[marker]);
 fs.writeFileSync(path.join(root,'persistence-marker.txt'),marker,{flag:'wx'});console.log('PERSISTENCE_PROBE_WRITTEN');
}else{const r=await client.query('SELECT marker FROM lab_check.persistence_probe WHERE id=1');if(r.rows.length!==1||r.rows[0].marker!==fs.readFileSync(path.join(root,'persistence-marker.txt'),'utf8'))throw Error('Marcador nao corresponde');
 console.log('POSTGRES_RESTART_PERSISTENCE_PASS');}
}finally{await client.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
