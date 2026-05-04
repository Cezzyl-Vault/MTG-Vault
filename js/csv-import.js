// ══════════════════════════════════════════════════════════
//  CSV-IMPORT  ·  Parser für ManaBox-Export
// ══════════════════════════════════════════════════════════
document.addEventListener('change',e=>{
  if(e.target.id!=='fileInput')return;
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>parseCSV(ev.target.result);
  reader.readAsText(file,'UTF-8');
  e.target.value='';
});

async function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2){showToast('CSV ist leer.');return;}
  const headers=csvLine(lines[0]).map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
  const ci=name=>{
    const a={name:['name','kartenname'],set_code:['set_code','set','setcode','edition'],set_name:['set_name','setname'],collector_number:['collector_number','number'],foil:['foil'],rarity:['rarity','seltenheit'],quantity:['quantity','qty','anzahl'],manabox_id:['manabox_id'],scryfall_id:['scryfall_id','uuid'],purchase_price:['purchase_price','price','preis'],misprint:['misprint'],altered:['altered'],condition:['condition','zustand'],language:['language','lang','sprache'],currency:['purchase_price_currency','currency']};
    for(const k of(a[name]||[name])){const i=headers.indexOf(k);if(i!==-1)return i;}return -1;
  };
  const newCards=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const cells=csvLine(lines[i]);
    const g=k=>{const idx=ci(k);return idx>=0?(cells[idx]||'').trim():'';};
    newCards.push({id:crypto.randomUUID(),user_id:currentUser.id,name:g('name'),set_code:g('set_code').toUpperCase(),set_name:g('set_name'),collector_number:g('collector_number'),foil:g('foil').toLowerCase(),rarity:g('rarity').toLowerCase(),quantity:parseInt(g('quantity'))||1,manabox_id:g('manabox_id'),scryfall_id:g('scryfall_id'),purchase_price:g('purchase_price'),currency:g('currency')||'EUR',misprint:g('misprint').toLowerCase()==='true',altered:g('altered').toLowerCase()==='true',condition:g('condition').toLowerCase(),language:g('language')});
  }
  if(!newCards.length){showToast('Keine Karten gefunden.');return;}
  showToast(`⬆ Lade ${newCards.length} Karten…`);
  if(await upsertCards(newCards)){await loadAll();showToast(`✓ ${newCards.length} Karten importiert`);}
}
function csvLine(line){
  const r=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(c===','&&!inQ){r.push(cur);cur='';}else cur+=c;}
  r.push(cur);return r;
}

