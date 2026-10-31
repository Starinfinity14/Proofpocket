(() => {
'use strict';
const $=s=>document.querySelector(s), status=$('#family-status'), current=$('#family-current'), members=$('#family-members'), shared=$('#family-shared'), inviteResult=$('#family-invite-result');
const cfg=window.PROOFPOCKET_SUPABASE_CONFIG||window.PROOFPocket_SUPABASE_CONFIG;
if(!window.supabase||!cfg?.url||!cfg?.publishableKey||!status)return;
const db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let user=null, household=null;
const say=(s,bad=false)=>{status.textContent=s;status.style.color=bad?'#a63b32':''};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw error;return data}
async function refresh(){
 const {data:{user:u}}=await db.auth.getUser();user=u||null;
 if(!user){household=null;current.textContent='Sign in from Settings to use family sharing.';members.textContent='Not signed in.';shared.textContent='Not signed in.';say('Sign in to manage household sharing.');return}
 const {data:m,error}=await db.from('household_members').select('household_id,role,joined_at').eq('user_id',user.id).maybeSingle();if(error)throw error;
 if(!m){household=null;current.textContent='You are not in a household yet.';members.textContent='No members yet.';shared.textContent='No shared purchases.';say('Create a household or accept an invitation.');return}
 const {data:h,error:he}=await db.from('households').select('id,name,owner_id,created_at').eq('id',m.household_id).maybeSingle();if(he)throw he;if(!h)throw new Error('Household could not be loaded.');household=h;
 current.innerHTML='<strong>'+esc(h.name)+'</strong><small>Role: '+esc(m.role)+'</small>';
 const {data:ms,error:me}=await db.from('household_members').select('user_id,role,joined_at').eq('household_id',h.id);if(me)throw me;
 members.innerHTML=(ms||[]).map(x=>'<div class="family-member"><span>'+esc(x.user_id===user.id?'You':x.user_id)+'<small>'+esc(x.role)+' · joined '+esc(new Date(x.joined_at).toLocaleDateString())+'</small></span>'+(m.role==='owner'&&x.user_id!==user.id?'<button type="button" data-remove-member="'+esc(x.user_id)+'" class="danger-btn">Remove</button>':'')+'</div>').join('')||'No members yet.';
 const {data:ps,error:pe}=await db.rpc('get_household_shared_purchases',{p_household_id:h.id});if(pe)throw pe;
 shared.innerHTML=(ps||[]).map(x=>'<div class="family-member"><span>'+esc(x.name)+'<small>'+esc(x.store||'Store not added')+' · shared '+esc(new Date(x.shared_at).toLocaleDateString())+'</small></span>'+(x.shared_by===user.id?'<button type="button" data-unshare="'+esc(x.purchase_id)+'" class="secondary-btn">Stop sharing</button>':'')+'</div>').join('')||'No purchases have been shared yet.';
 say('Household loaded. Share only the records you choose.');
}
async function run(fn){try{say('Working…');await fn();await refresh()}catch(e){say(e.message||'Something went wrong. Please try again.',true)}}
$('#family-create')?.addEventListener('click',()=>run(async()=>{if(!user)throw new Error('Sign in first.');await rpc('create_household',{p_name:$('#family-name').value.trim()||'My household'})}));
$('#family-invite')?.addEventListener('click',()=>run(async()=>{
 if(!household||household.owner_id!==user?.id)throw new Error('Only the household owner can invite members.');
 const email=$('#family-invite-email').value.trim().toLowerCase();if(!email||!email.includes('@'))throw new Error('Enter a valid email address.');
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);const token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const expiry=await rpc('create_household_invitation',{p_household_id:household.id,p_invited_email:email,p_token:token});
 inviteResult.hidden=false;inviteResult.textContent='Send this one-time invitation code to '+email+': '+token+' · Expires '+new Date(expiry).toLocaleString()+'. Keep it private.';$('#family-invite-email').value='';
}));
$('#family-accept')?.addEventListener('click',()=>run(async()=>{const token=$('#family-invite-code').value.trim();if(!token)throw new Error('Paste an invitation code.');await rpc('accept_household_invitation',{p_token:token});$('#family-invite-code').value=''}));
$('#family-share')?.addEventListener('click',()=>run(async()=>{if(!household)throw new Error('Create or join a household first.');const id=$('#family-purchase-id').value.trim();if(!id)throw new Error('Enter a purchase ID.');await rpc('share_household_purchase',{p_household_id:household.id,p_purchase_id:id});$('#family-purchase-id').value=''}));
members?.addEventListener('click',e=>{const b=e.target.closest('[data-remove-member]');if(!b)return;run(async()=>{if(!confirm('Remove this member from the household?'))return;await rpc('remove_household_member',{p_household_id:household.id,p_user_id:b.dataset.removeMember})})});
shared?.addEventListener('click',e=>{const b=e.target.closest('[data-unshare]');if(!b)return;run(async()=>{if(!confirm('Stop sharing this purchase with the household?'))return;await rpc('unshare_household_purchase',{p_household_id:household.id,p_purchase_id:b.dataset.unshare})})});
db.auth.onAuthStateChange(()=>{setTimeout(()=>refresh().catch(e=>say(e.message,true)),0)});
document.querySelector('[data-view="family"]')?.addEventListener('click',()=>refresh().catch(e=>say(e.message,true)));
refresh().catch(e=>say(e.message||'Could not load household.',true));
})();