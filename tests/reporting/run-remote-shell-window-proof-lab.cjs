'use strict';
// Tests the upstream Desktop Commander v0.3.1 Windows spawn configuration:
// powershell.exe -Command <command>, windowsHide:true, shell:false.
// Only GitHub disposable Windows runners, synthetic Reader fixtures.
// Not a Desktop Commander invocation, not permission to run on CAIXA_MOOCA.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const args=process.argv.slice(2);
const bad=()=>{process.exitCode=77;};
if(process.platform!=='win32'||os.hostname().toUpperCase()==='CAIXA_MOOCA'||
 process.env.GITHUB_ACTIONS!=='true'||
 process.env.GITHUB_REPOSITORY!=='cesarspichencoff-cmyk/delviery-os'||
 args.length!==5||args.some(x=>typeof x!=='string'||!path.isAbsolute(x)))bad();
else {
 const [lab,gui,node,cli,pidFile]=args;
 if(path.basename(lab)!=='deliveryos-reader-proof-lab'||
    path.basename(gui)!=='NativeReaderOneShotLabLauncher.exe'||
    path.basename(node).toLowerCase()!=='node.exe'||
    path.basename(cli)!=='native_reader_one_shot_lab_cli_v1.cjs'||
    !fs.existsSync(path.join(lab,'LAB_ONLY.txt'))||
    fs.existsSync(pidFile))bad();
 else {
  const quote=x=>"'"+x.replace(/'/g,"''")+"'";
  const argv=['--lab-dir='+lab,'--node-path='+node,
    '--script-path='+cli,'--fixture-mode=legacy'];
  const command="$ErrorActionPreference='Stop'; "+
    "$a=@("+argv.map(x=>quote('"'+x+'"')).join(',')+"); "+
    "$p=Start-Process -FilePath "+quote(gui)+
    " -ArgumentList $a -Wait -PassThru; exit $p.ExitCode";
  const shell=spawn('powershell.exe',['-Command',command],{
    env:{...process.env,TERM:'xterm-256color',
      DELIVERYOS_READER_LAB_HOLD_MS:'2500'},
    windowsHide:true, // exact upstream v0.3.1 terminal-manager.ts option
    shell:false,
    stdio:['ignore','pipe','pipe']
  });
  // No order IDs/notes in the PID file; only a bounded process identity.
  if(!Number.isSafeInteger(shell.pid)||shell.pid<=0)bad();
  else {
   fs.writeFileSync(pidFile,JSON.stringify({
    schema:'deliveryos.remote-shell-visibility-lab.v1',
    shell_pid:shell.pid})+'\n',{encoding:'utf8',flag:'wx'});
   for(const stream of [shell.stdout,shell.stderr]){
    stream.on('data',x=>{ /* Deliberately discard child output. */ });
   }
   shell.once('error',()=>{process.exitCode=78;});
   shell.once('close',(code,signal)=>{
    process.exitCode=code===0&&signal===null?0:79;
   });
  }
 }
}
