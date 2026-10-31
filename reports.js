(() => {
'use strict';
const $=s=>document.querySelector(s);
const status=$('#report-status');if(!status)return;
let householdRows=[];
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const records=()=>window.proofPocket?.getRecords?.()||[];
const dateValue=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?new Date(s+'T12:00:00'):null;
const selected=()=>{
 const all=records().map(r=>({...r,source:'personal'}));
 if($('#report-household').checked)householdRows.forEach(p=>{if(!all.some(r=>r.id===p.purchase_id))all.push({id:p.purchase_id,name:p.name,store:p.store,category:p.category,purchaseDate:p.purchase_date,amount:p.amount,returnDate:p.return_date,warrantyDate:p.warranty_date,source:'household'})});
 const period=$('#report-period').value, now=new Date(), start=new Date(now);start.setHours(0,0,0,0);
 if(period==='year')start.setMonth(0,1);else if(period!=='all')start.setDate(start.getDate()-Number(period)+1);
 return all.filter(r=>{const d=dateValue(r.purchaseDate);return period==='all'||(d&&d>=start&&d<=now)});
};
function render(){
 const rows=selected(), valued=rows.filter(r=>r.amount!==''&&Number.isFinite(Number(r.amount))), total=valued.reduce((s,r)=>s+Number(r.amount),0), avg=valued.length?total/valued.length:0;
 $('#report-total').textContent=money(total);$('#report-count').textContent=rows.length+' purchases · '+valued.length+' with amount';$('#report-average').textContent=money(avg);
 const dated=rows.flatMap(r=>[{date:r.returnDate,type:'return'},{date:r.warrantyDate,type:'warranty'}]).filter(x=>dateValue(x.date));
 const now=new Date();now.setHours(0,0,0,0);const within=dated.filter(x=>{const d=dateValue(x.date),diff=Math.round((d-now)/86400000);return diff>=0&&diff<=30});
 $('#report-warranty').textContent=rows.filter(r=>r.warrantyDate).length;$('#report-upcoming').textContent=within.length;
 const cats={};valued.forEach(r=>{const c=r.category||'Other';cats[c]=(cats[c]||0)+Number(r.amount)});
 const months={};valued.forEach(r=>{if(!dateValue(r.purchaseDate))return;const k=r.purchaseDate.slice(0,7);months[k]=(months[k]||0)+Number(r.amount)});
 const bars=(obj)=>{const entries=Object.entries(obj).sort((a,b)=>b[1]-a[1]);if(!entries.length)return '<p class="report-status">No amount data available for this selection.</p>';const max=Math.max(...entries.map(x=>x[1]),1);return entries.map(([k,v])=>'<div class="report-bar-row"><span class="report-bar-label">'+safe(k)+'</span><div class="report-bar-track"><div class="report-bar-fill" style="width:'+Math.max(1,v/max*100)+'%"></div></div><span class="report-bar-value">'+money(v)+'</span></div>').join('')};
 $('#report-categories').innerHTML=bars(cats);$('#report-monthly').innerHTML=bars(months);
 const activeWarranty=rows.filter(r=>r.warrantyDate&&dateValue(r.warrantyDate)>=now).length;
 const pastWarranty=rows.filter(r=>r.warrantyDate&&dateValue(r.warrantyDate)<now).length;
 const withReturn=rows.filter(r=>r.returnDate).length;
 $('#report-coverage').innerHTML=[['Active warranty dates',activeWarranty],['Past warranty dates',pastWarranty],['Return dates recorded',withReturn]].map(([label,n])=>'<div class="report-coverage-item"><strong>'+n+'</strong><span>'+label+'</span></div>').join('');
}
async function loadHousehold(){
 householdRows=[];
 const cfg=window.PROOFPOCKET_SUPABASE_CONFIG||window.PROOFPocket_SUPABASE_CONFIG;
 if(!window.supabase||!cfg?.url||!cfg?.publishableKey){status.textContent='Household reports require a signed-in account and configured sync.';return}
 try{
  const db=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const {data:{user},error:ue}=await db.auth.getUser();if(ue)throw ue;if(!user){status.textContent='Sign in to include household-shared purchases.';return}
  const {data:m,error}=await db.from('household_members').select('household_id').eq('user_id',user.id).maybeSingle();if(error)throw error;
  if(!m){status.textContent='No household membership found. Personal reports are available.';return}
  const {data,error:pe}=await db.rpc('get_household_shared_purchases',{p_household_id:m.household_id});if(pe)throw pe;householdRows=data||[];
  status.textContent='Household data loaded: '+householdRows.length+' explicitly shared purchase(s).';
 }catch(e){status.textContent='Household report unavailable: '+(e.message||'Could not load shared purchases.');}
}
$('#report-period').addEventListener('change',render);
$('#report-household').addEventListener('change',async()=>{if($('#report-household').checked&&!householdRows.length)await loadHousehold();render()});
$('#report-export').addEventListener('click',()=>{
 const rows=selected();if(!rows.length){status.textContent='There are no records in this report to export.';return}
 const cols=['name','store','category','purchaseDate','amount','returnDate','warrantyDate','source'];
 const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv=[cols.join(','),...rows.map(r=>cols.map(k=>quote(r[k])).join(','))].join('\r\n');
 const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='proofpocket-report-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 status.textContent='CSV report prepared from '+rows.length+' purchase record(s).';
});
window.addEventListener('proofpocket:records-changed',render);
document.querySelector('[data-view="reports"]')?.addEventListener('click',()=>{loadHousehold().then(render);render()});
render();
})();