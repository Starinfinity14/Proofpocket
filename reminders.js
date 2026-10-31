(() => {
  'use strict';
  const cfg=window.PROOFPOCKET_SUPABASE_CONFIG||window.PROOFPocket_SUPABASE_CONFIG;
  const client=window.supabase&&cfg&&cfg.url&&cfg.publishableKey
    ?window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
    :null;
  const STORE='proofpocket.reminders.v1', SENT='proofpocket.reminders.sent.v1';
  const $=id=>document.getElementById(id);
  const enabled=$('reminder-enabled'), save=$('reminder-save'), test=$('reminder-test'), status=$('reminder-status');
  if(!enabled||!save||!test||!status)return;
  const checks=[...document.querySelectorAll('input[name="reminder-days"]')];
  const defaults={enabled:false,days:[1,7],timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
  let prefs={...defaults};
  const setStatus=(message,error=false)=>{status.textContent=message;status.style.color=error?'#a63b32':'';};
  const readLocal=()=>{try{const v=JSON.parse(localStorage.getItem(STORE)||'null');if(v&&typeof v==='object')prefs={enabled:!!v.enabled,days:Array.isArray(v.days)?v.days.filter(n=>[1,3,7,14,30].includes(n)):[1,7],timezone:typeof v.timezone==='string'?v.timezone:defaults.timezone};}catch{}};
  const writeLocal=()=>{try{localStorage.setItem(STORE,JSON.stringify(prefs));}catch{setStatus('Could not save preferences in this browser.',true);}};
  const render=()=>{enabled.checked=prefs.enabled;checks.forEach(c=>c.checked=prefs.days.includes(Number(c.value)));};
  const selectedDays=()=>checks.filter(c=>c.checked).map(c=>Number(c.value)).sort((a,b)=>a-b);
  async function getUser(){if(!client)return null;const {data,error}=await client.auth.getUser();if(error)throw error;return data.user||null;}
  async function loadCloudPreferences(){
    if(!client)return;
    try{
      const user=await getUser();
      if(!user){setStatus('Saved on this device. Sign in to sync preferences to your account.');return;}
      const {data,error}=await client.from('reminder_preferences').select('email_enabled,reminder_days,timezone').eq('user_id',user.id).maybeSingle();
      if(error)throw error;
      if(data){prefs={enabled:data.email_enabled===true,days:Array.isArray(data.reminder_days)?data.reminder_days:[1,7],timezone:data.timezone||defaults.timezone};writeLocal();render();}
      setStatus('Signed-in reminder preferences are ready. Save to sync changes.');
    }catch(err){setStatus('Cloud preferences unavailable. Apply the household migration first. '+(err.message||''),true);}
  }
  save.addEventListener('click',async()=>{
    const days=selectedDays();
    if(!days.length){setStatus('Select at least one reminder interval.',true);return;}
    prefs={enabled:enabled.checked,days,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||defaults.timezone};
    writeLocal();
    if(prefs.enabled){
      if(!('Notification'in window)){setStatus('This browser does not support notifications. In-app deadlines still work.',true);return;}
      if(Notification.permission==='default'){
        try{const permission=await Notification.requestPermission();if(permission!=='granted'){setStatus('Notification permission was not granted. In-app deadlines still work.',true);return;}}
        catch{setStatus('Could not request notification permission. Check your browser settings.',true);return;}
      }
      if(Notification.permission!=='granted'){setStatus('Notifications are blocked in browser settings. In-app deadlines still work.',true);return;}
    }
    try{
      const user=await getUser();
      if(user){
        const {error}=await client.from('reminder_preferences').upsert({user_id:user.id,email_enabled:prefs.enabled,reminder_days:prefs.days,timezone:prefs.timezone,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error)throw error;
        setStatus('Preferences saved on this device and synced to your account.');
      }else setStatus('Preferences saved on this device. Sign in to sync them across devices.');
      checkDue();
    }catch(err){setStatus('Saved on this device, but cloud sync failed: '+(err.message||'Apply the household migration.'),true);}
  });
  function localDate(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return y+'-'+m+'-'+d;}
  function dayOffset(dateString){const [y,m,d]=dateString.split('-').map(Number);const target=new Date(y,m-1,d,12);const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);return Math.round((target-today)/86400000);}
  function checkDue(){
    if(!prefs.enabled||!('Notification'in window)||Notification.permission!=='granted'||!window.proofPocket)return;
    const records=window.proofPocket.getRecords(),today=localDate(new Date());
    let sent={};try{sent=JSON.parse(localStorage.getItem(SENT)||'{}')||{};}catch{}
    for(const record of records){
      for(const [field,label] of [['returnDate','Return deadline'],['warrantyDate','Warranty ends']]){
        const date=record[field];if(!date)continue;
        const remaining=dayOffset(date);if(remaining<0||!prefs.days.includes(remaining))continue;
        const key=[today,record.id,field,date].join('|');if(sent[key])continue;
        const timing=remaining===0?'is due today':'is due in '+remaining+' day'+(remaining===1?'':'s');
        try{const n=new Notification('ProofPocket reminder',{body:(record.name||'A purchase')+' — '+label.toLowerCase()+' '+timing+'.',tag:'proofpocket-'+record.id+'-'+field});n.onclick=()=>{window.focus();n.close();};sent[key]=Date.now();}catch{return;}
      }
    }
    const keys=Object.keys(sent);if(keys.length>500)keys.slice(0,keys.length-500).forEach(k=>delete sent[k]);
    try{localStorage.setItem(SENT,JSON.stringify(sent));}catch{}
  }
  test.addEventListener('click',async()=>{
    if(!('Notification'in window)){setStatus('This browser does not support notifications.',true);return;}
    if(Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}
    if(Notification.permission!=='granted'){setStatus('Allow notifications in browser settings before sending a test.',true);return;}
    try{new Notification('ProofPocket test',{body:'Notifications are enabled on this device.'});setStatus('Test notification sent.');}
    catch{setStatus('The browser could not display a notification.',true);}
  });
  readLocal();render();
  if(client){client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN')setTimeout(loadCloudPreferences,0);if(event==='SIGNED_OUT')setStatus('Signed out. Preferences remain saved on this device.');});}
  loadCloudPreferences();
  checkDue();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDue();});
  window.addEventListener('focus',checkDue);
  window.addEventListener('proofpocket:records-changed',checkDue);
  setInterval(checkDue,5*60*1000);
})();
