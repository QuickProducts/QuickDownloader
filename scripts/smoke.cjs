const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();
app.setPath('userData',path.join(__dirname,'../.test-profile'));
const delay = ms => new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1280,height:860,show:false,webPreferences:{preload:path.join(__dirname,'smoke-preload.cjs'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 const errors=[];
 win.webContents.on('console-message',(_e,...args)=>{const msg=args[0];if(typeof msg==='object' && msg.level==='error') errors.push(msg.message);});
 const run=code=>win.webContents.executeJavaScript(code);
 const check=async(code,label)=>{if(!await run(code))throw new Error(label); console.log('PASS '+label);};
 try {
 await win.loadFile(path.join(__dirname,'../src/index.html'));await delay(1500);
 fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});
 fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});
 await check(`document.querySelector('#downloadBtn').onclick === null && typeof document.querySelector('#form').onsubmit === 'function'`,'renderer initialization');
 for(const theme of ['light','forest','dark']){
 await run(`document.querySelector('#themeToggle').click()`);
 await check(`document.body.dataset.theme === '${theme}'`,'theme cycle '+theme);
 await run(`document.querySelector('.intro').click()`);
 await check(`document.body.dataset.theme === '${theme}'`,'ordinary clicks preserve '+theme);
 await delay(250);
 fs.writeFileSync(path.join(__dirname, '../test-results/'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 for(const width of [960,1280,1600]){
 win.setSize(width,720);await delay(100);
 for(const id of ['download','history','settings']) {
 await run(`page('${id}')`);await delay(300);
 await check(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`,'no horizontal overflow '+width+' '+id);
 if(width===1280){await run(`document.documentElement.classList.add('capture-still');document.querySelectorAll('.page').forEach(p=>{p.hidden=p.id!=='${id}';p.classList.remove('exiting')});document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='${id}'));document.querySelector('#breadcrumb').textContent={download:'Загрузить',history:'История',settings:'Настройки'}['${id}']`);await delay(350);await win.webContents.capturePage();fs.writeFileSync(path.join(__dirname,'../docs/screenshots/'+id+'.png'),(await win.webContents.capturePage()).toPNG());await run(`document.documentElement.classList.remove('capture-still')`);}
 }
 }
 await check(`[...document.images].filter(i=>i.offsetParent).every(i=>i.complete && i.naturalWidth>0)`,'visible images load');
 await run(`window.qd.setSetting('tutorialCompleted',false).then(()=>window.tutorialSystem.show())`);
 await check(`!!document.querySelector('dialog[open] #tutorialTitle') && document.body.style.overflow==='hidden'`,'tutorial modal and scroll lock');
 await run(`document.querySelector('dialog[open] .primary').click()`);await delay(100);
 console.log(await run(`JSON.stringify({active:window.tutorialSystem.isActive,overflow:document.body.style.overflow,locks:[...scrollLocks],dialogs:document.querySelectorAll('dialog').length})`));
 await check(`!window.tutorialSystem.isActive && document.body.style.overflow===''`,'tutorial cleanup');
 await run(`page('download');window.qd.testOutcome('reject');document.querySelector('#url').value='https://example.com/video';document.querySelector('#form').requestSubmit()`);await delay(350);
 await check(`!document.querySelector('#downloadBtn').disabled && document.body.style.overflow==='' && document.querySelector('#toast').textContent.includes('Test IPC failure')`,'IPC rejection unlocks UI');
 await run(`window.qd.testOutcome('pending');document.querySelector('#form').requestSubmit()`);await delay(100);
 await check(`document.body.style.overflow==='hidden' && document.querySelector('#downloadBtn').disabled`,'active download scroll lock');
 await run(`document.querySelector('#cancelDl').click()`);await delay(100);
 await check(`document.body.style.overflow==='' && !document.querySelector('#downloadBtn').disabled && document.querySelector('#toast').textContent==='Загрузка отменена'`,'cancellation releases UI without error');
 await run(`window.qd.testOutcome('success');document.querySelector('#form').requestSubmit()`);await delay(100);
 await check(`document.querySelector('#modal').open && document.querySelector('#dlPct').textContent==='100%'`,'successful download');
 await run(`document.querySelector('#modal').close();historyCache=[{id:1,title:'<img src=x onerror=alert(1)>',url:'https://example.com',date:new Date().toISOString()}];renderHistory()`);
 await check(`!document.querySelector('#historyList img') && document.querySelector('.hist-main strong').textContent.startsWith('<img')`,'history escapes remote content');
 await run(`window.qd.testOutcome('setup-fail');runSetup()`);await delay(100);
 await check(`!document.querySelector('#setupError').hidden && !document.querySelector('#setupRetry').disabled && document.body.style.overflow==='hidden'`,'setup failure allows retry and keeps modal lock');
 await run(`window.qd.testOutcome('success');document.querySelector('#setupRetry').click()`);await delay(3000);
 await check(`document.querySelector('#setupOverlay').hidden && document.body.style.overflow===''`,'setup retry succeeds and unlocks');
 if(errors.length) throw new Error(errors.join('\n'));
 console.log('All smoke tests passed');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
