(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const host = $('vault-panel');
  if (!host || !window.supabase || !window.PROOFPOCKET_SUPABASE_CONFIG) return;
  const cfg = window.PROOFPOCKET_SUPABASE_CONFIG;
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {auth:{persistSession:true,autoRefreshToken:true}});
  const bucket = 'proofpocket-vault';
  const maxBytes = 7 * 1024 * 1024;
  let userId = null;
  let entitled = false;
  let busy = false;
  const status = (msg, error=false) => { $('vault-status').textContent=msg; $('vault-status').style.color=error?'#a63b32':''; };
  const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unb64 = value => Uint8Array.from(atob(value), c=>c.charCodeAt(0));
  async function derive(passphrase,salt){
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function getKey(){
    const p=$('vault-passphrase').value;
    if(p.length<12) throw new Error('Use a vault passphrase of at least 12 characters.');
    return p;
  }
  async function refresh(){
    const {data:{session}}=await client.auth.getSession();
    userId=session?.user?.id||null;
    if(!userId){entitled=false; $('vault-lock').hidden=false; $('vault-content').hidden=true; status('Sign in to check Plus access.');return;}
    const {data,error}=await client.from('subscriptions').select('plus_entitled').eq('user_id',userId).maybeSingle();
    if(error) throw error;
    entitled=!!data?.plus_entitled;
    $('vault-lock').hidden=entitled;
    $('vault-content').hidden=!entitled;
    if(entitled){status('Plus Vault ready. Files are encrypted in your browser before upload.');await list();}
    else status('An active Plus subscription is required to use the Vault.');
  }
  async function list(){
    const {data,error}=await client.from('vault_documents').select('id,storage_path,display_name,document_type,encrypted_size_bytes,created_at').eq('user_id',userId).order('created_at',{ascending:false});
    if(error) throw error;
    const root=$('vault-list'); root.replaceChildren();
    if(!data?.length){root.textContent='No documents saved yet.';return;}
    for(const doc of data){
      const row=document.createElement('div'); row.className='vault-row';
      const info=document.createElement('div'); const title=document.createElement('strong'); title.textContent=doc.display_name;
      const meta=document.createElement('p'); meta.textContent=doc.document_type+' · '+(doc.encrypted_size_bytes/1024).toFixed(1)+' KB · encrypted';
      info.append(title,meta);
      const actions=document.createElement('div'); actions.className='vault-actions';
      const get=document.createElement('button'); get.className='secondary-btn'; get.type='button'; get.textContent='Decrypt & download'; get.addEventListener('click',()=>download(doc));
      const del=document.createElement('button'); del.className='danger-btn'; del.type='button'; del.textContent='Delete'; del.addEventListener('click',()=>remove(doc));
      actions.append(get,del);row.append(info,actions);root.append(row);
    }
  }
  async function upload(){
    if(busy)return;busy=true;
    try{
      if(!userId||!entitled)throw new Error('Sign in with an active Plus account first.');
      const file=$('vault-file').files[0];if(!file)throw new Error('Choose a document first.');
      if(file.size<1||file.size>maxBytes)throw new Error('Choose a file smaller than 7 MB.');\n      if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Only PDF, JPEG, PNG and WebP files are supported.');
      const pass=await getKey();status('Encrypting document in this browser…');
      const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
      const key=await derive(pass,salt);
      const plain=await file.arrayBuffer();
      const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
      const envelope=new Blob([JSON.stringify({v:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(cipher)})],{type:'application/octet-stream'});
      const id=crypto.randomUUID(),path=userId+'/'+id+'.ppvault';
      const {error:upErr}=await client.storage.from(bucket).upload(path,envelope,{contentType:'application/octet-stream',upsert:false});
      if(upErr)throw upErr;
      const {error:dbErr}=await client.from('vault_documents').insert({user_id:userId,storage_path:path,display_name:file.name.slice(0,120),document_type:$('vault-type').value,encrypted_mime_type:'application/octet-stream',encrypted_size_bytes:envelope.size,encryption_version:1});
      if(dbErr){await client.storage.from(bucket).remove([path]);throw dbErr;}
      $('vault-file').value='';status('Encrypted document saved.');await list();
    }catch(e){status(e.message||'Could not save document.',true);}finally{busy=false;}
  }
  async function download(doc){
    try{
      if(!entitled)throw new Error('Plus access is required.');
      const pass=await getKey();status('Downloading encrypted file…');
      const {data,error}=await client.storage.from(bucket).download(doc.storage_path);if(error)throw error;
      const env=JSON.parse(await data.text());if(env.v!==1)throw new Error('Unsupported vault file version.');
      const key=await derive(pass,unb64(env.salt));
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(env.iv)},key,unb64(env.ciphertext));
      const blob=new Blob([plain],{type:'application/octet-stream'}),url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=doc.display_name;a.click();URL.revokeObjectURL(url);
      status('Document decrypted and downloaded. The app did not save your passphrase.');
    }catch(e){status('Could not decrypt/download. Check your passphrase. '+(e.message||''),true);}
  }
  async function remove(doc){
    if(!confirm('Permanently delete this encrypted document?'))return;
    try{
      const {error}=await client.storage.from(bucket).remove([doc.storage_path]);if(error)throw error;
      const {error:dbErr}=await client.from('vault_documents').delete().eq('id',doc.id).eq('user_id',userId);if(dbErr)throw dbErr;
      status('Document deleted.');await list();
    }catch(e){status(e.message||'Could not delete document.',true);}
  }
  $('vault-upload').addEventListener('click',upload);
  client.auth.onAuthStateChange(()=>setTimeout(()=>refresh().catch(e=>status(e.message,true)),0));
  refresh().catch(e=>status(e.message||'Vault unavailable.',true));
})();