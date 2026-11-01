(() => {
  'use strict';
  const cfg = window.PROOFPOCKET_SUPABASE_CONFIG || window.PROOFPocket_SUPABASE_CONFIG;
  if (!window.supabase || !cfg || !cfg.url || !cfg.publishableKey) return;
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const bucket = 'proofpocket-receipts';
  const maxBytes = 5 * 1024 * 1024;
  const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getUser = async () => { const {data,error}=await client.auth.getUser(); if(error) throw error; return data.user||null; };
  const setStatus = (id,text,isError=false) => {
    const el=document.querySelector('[data-receipt-status="'+CSS.escape(id)+'"]');
    if(el){el.textContent=text;el.style.color=isError?'#a63b32':'';}
  };
  async function refresh(id, card) {
    const list=card.querySelector('.receipt-list'), msg=card.querySelector('.receipt-status');
    const user=await getUser();
    if(!user){msg.textContent='Sign in and sync this purchase to attach receipts.';return;}
    if(!isUuid(id)){msg.textContent='Sync this purchase first to enable receipt attachments.';return;}
    const {data,error}=await client.from('purchase_receipts').select('id,file_name').eq('purchase_id',id).order('created_at',{ascending:false});
    if(error)throw error;
    list.innerHTML=(data||[]).map(row=>'<div class="receipt-entry"><span title="'+esc(row.file_name)+'">'+esc(row.file_name)+'</span><button type="button" data-receipt-download="'+esc(row.id)+'" data-purchase="'+esc(id)+'">Download</button><button type="button" data-receipt-delete="'+esc(row.id)+'" data-purchase="'+esc(id)+'">Delete</button></div>').join('');
    msg.textContent=(data||[]).length?data.length+' receipt(s) attached.':'No receipts attached yet.';
  }
  function addControls() {
    document.querySelectorAll('.record-card[data-purchase-id]').forEach(card=>{
      if(card.querySelector('.receipt-tools'))return;
      const id=card.dataset.purchaseId;
      const tools=document.createElement('div');tools.className='receipt-tools';
      tools.innerHTML='<button type="button" data-receipt-upload="'+esc(id)+'">＋ Attach receipt</button><input type="file" hidden data-receipt-input="'+esc(id)+'" accept="application/pdf,image/jpeg,image/png,image/webp">';
      const list=document.createElement('div');list.className='receipt-list';
      const msg=document.createElement('p');msg.className='receipt-status';msg.dataset.receiptStatus=id;msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');
      card.append(tools,list,msg);
      refresh(id,card).catch(err=>{msg.textContent='Receipts unavailable: '+(err.message||'Please try again.');});
    });
  }
  async function upload(id,file,button) {
    if(!file)return;
    if(!allowed.has(file.type)){setStatus(id,'Choose a PDF, JPEG, PNG or WebP file.',true);return;}
    if(file.size<=0||file.size>maxBytes){setStatus(id,'Receipt must be no larger than 5 MB.',true);return;}
    button.disabled=true;setStatus(id,'Uploading receipt…');
    let path=null;
    try {
      const user=await getUser();if(!user)throw new Error('Sign in before uploading.');
      if(!isUuid(id))throw new Error('Sync this purchase first.');
      const {data:purchase,error:purchaseError}=await client.from('purchases').select('id').eq('id',id).eq('user_id',user.id).maybeSingle();
      if(purchaseError)throw purchaseError;if(!purchase)throw new Error('Purchase not found in this account.');
      const safeName=file.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,160)||'receipt';
      path=user.id+'/'+id+'/'+crypto.randomUUID();
      const {error:uploadError}=await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:insertError}=await client.from('purchase_receipts').insert({user_id:user.id,purchase_id:id,storage_path:path,file_name:safeName,mime_type:file.type,size_bytes:file.size});
      if(insertError){const cleanup=await client.storage.from(bucket).remove([path]);if(cleanup.error)console.error('Receipt cleanup required',cleanup.error);throw insertError;}
      const card=document.querySelector('.record-card[data-purchase-id="'+CSS.escape(id)+'"]');
      if(card)await refresh(id,card);
      setStatus(id,'Receipt uploaded.');
    } catch(err){setStatus(id,'Upload failed: '+(err.message||'Please try again.'),true);}
    finally{button.disabled=false;}
  }
  async function download(receiptId,id,button) {
    button.disabled=true;
    try {
      const {data:item,error}=await client.from('purchase_receipts').select('storage_path,file_name').eq('id',receiptId).eq('purchase_id',id).maybeSingle();
      if(error)throw error;if(!item)throw new Error('Receipt not found.');
      const {data,error:signError}=await client.storage.from(bucket).createSignedUrl(item.storage_path,60);
      if(signError)throw signError;
      const a=document.createElement('a');a.href=data.signedUrl;a.download=item.file_name;a.rel='noopener';document.body.append(a);a.click();a.remove();
    }catch(err){setStatus(id,'Download failed: '+err.message,true);}
    finally{button.disabled=false;}
  }
  async function remove(receiptId,id,button) {
    if(!confirm('Delete this receipt attachment? This cannot be undone.'))return;
    button.disabled=true;
    try {
      const {data:item,error}=await client.from('purchase_receipts').select('storage_path').eq('id',receiptId).eq('purchase_id',id).maybeSingle();
      if(error)throw error;if(!item)throw new Error('Receipt not found.');
      const {error:storageError}=await client.storage.from(bucket).remove([item.storage_path]);
      if(storageError)throw storageError;
      const {error:rowError}=await client.from('purchase_receipts').delete().eq('id',receiptId).eq('purchase_id',id);
      if(rowError)throw rowError;
      const card=document.querySelector('.record-card[data-purchase-id="'+CSS.escape(id)+'"]');if(card)await refresh(id,card);
    }catch(err){setStatus(id,'Delete failed: '+err.message,true);}
    finally{button.disabled=false;}
  }
  document.addEventListener('click',e=>{
    const uploadBtn=e.target.closest('[data-receipt-upload]');
    if(uploadBtn){document.querySelector('[data-receipt-input="'+CSS.escape(uploadBtn.dataset.receiptUpload)+'"]')?.click();return;}
    const dl=e.target.closest('[data-receipt-download]');if(dl){download(dl.dataset.receiptDownload,dl.dataset.purchase,dl);return;}
    const del=e.target.closest('[data-receipt-delete]');if(del)remove(del.dataset.receiptDelete,del.dataset.purchase,del);
  });
  document.addEventListener('change',e=>{
    const input=e.target.closest('[data-receipt-input]');if(!input)return;
    const file=input.files&&input.files[0];input.value='';
    const card=input.closest('.record-card');const button=card&&card.querySelector('[data-receipt-upload]');
    if(button)upload(input.dataset.receiptInput,file,button);
  });
  const observer=new MutationObserver(addControls);
  const start=()=>{const root=document.getElementById('records-list');if(root){observer.observe(root,{childList:true,subtree:true});addControls();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('proofpocket:records-changed',addControls);
  client.auth.onAuthStateChange(()=>document.querySelectorAll('.record-card[data-purchase-id]').forEach(card=>refresh(card.dataset.purchaseId,card).catch(err=>{const msg=card.querySelector('.receipt-status');if(msg)msg.textContent='Receipts unavailable: '+err.message;})));
})();
