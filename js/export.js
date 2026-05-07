// ══════════════════════════════════════════════════════════
//  EXPORT  ·  CSV- und PDF-Export der Sammlung
// ══════════════════════════════════════════════════════════
//
//  Beide Exporte respektieren die aktuell gesetzten Filter
//  (filteredGroups aus collection.js). Wenn der User z.B. nach
//  "nur Foils" gefiltert hat, exportiert er auch nur Foils.
//
//  CSV: Alle Spalten der Karten-Tabelle, mit UTF-8 BOM (Excel-kompatibel)
//  PDF: Druckbare HTML-Variante in neuem Fenster, ruft window.print() auf —
//       der User wählt im Druckdialog "Als PDF speichern".

// Hilfsfunktion: alle Karten-Varianten aus den Groups extrahieren
function getFilteredCards(){
  const cards=[];
  for(const group of filteredGroups||[]){
    cards.push(...group.cards);
  }
  return cards;
}

// CSV-Wert maskieren: Anführungszeichen verdoppeln, ggf. ganzes Feld in Quotes
function csvEscape(val){
  if(val==null||val==='')return '';
  const s=String(val);
  if(s.includes(',')||s.includes('"')||s.includes('\n')||s.includes(';')){
    return '"'+s.replace(/"/g,'""')+'"';
  }
  return s;
}

// Browser-Download für eine generierte Datei auslösen
function triggerDownload(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Aktuelles Datum als ISO-Stamp für Dateinamen (z.B. 2026-05-07)
function todayIsoDate(){
  return new Date().toISOString().split('T')[0];
}

// ══════════════════════════════════════════════════════════
//  CSV-Export
// ══════════════════════════════════════════════════════════
function exportFilteredToCSV(){
  const cards=getFilteredCards();
  if(!cards.length){toastError('Keine Karten zum Exportieren.');return;}

  // Alle relevanten Spalten — entsprechen weitgehend dem ManaBox-Format,
  // sodass die Datei auch wieder reimportiert werden könnte.
  const headers=[
    'Name','Set Code','Set Name','Sammlernummer','Anzahl',
    'Foil','Seltenheit','Zustand','Sprache','Kaufpreis','Währung',
    'Manawert','Farben','Kartentyp','Misprint','Altered','Scryfall ID'
  ];
  const rows=cards.map(c=>[
    c.name||'',
    c.set_code||'',
    c.set_name||'',
    c.collector_number||'',
    c.quantity||0,
    c.foil||'',
    c.rarity||'',
    c.condition||'',
    c.language||'',
    c.purchase_price||'',
    c.currency||'',
    c.mana_value??'',
    (Array.isArray(c.colors)?c.colors.join('/'):''),
    c.type_line||'',
    c.misprint?'true':'false',
    c.altered?'true':'false',
    c.scryfall_id||''
  ]);

  const csv=[
    headers.map(csvEscape).join(','),
    ...rows.map(r=>r.map(csvEscape).join(','))
  ].join('\n');

  // UTF-8 BOM voranstellen, damit Excel Umlaute korrekt anzeigt
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  triggerDownload(blob,`mtg-vault-${todayIsoDate()}.csv`);

  const totalCards=cards.reduce((s,c)=>s+(c.quantity||1),0);
  toastSuccess(`${cards.length} Einträge (${totalCards} Karten) als CSV exportiert`);
}

// ══════════════════════════════════════════════════════════
//  PDF-Export  ·  Über Print-Dialog → "Als PDF speichern"
// ══════════════════════════════════════════════════════════
function exportFilteredToPDF(){
  const cards=getFilteredCards();
  if(!cards.length){toastError('Keine Karten zum Exportieren.');return;}

  // Karten alphabetisch sortieren — schöner für das Druck-Dokument
  cards.sort((a,b)=>(a.name||'').localeCompare(b.name||''));

  const totalCards=cards.reduce((s,c)=>s+(c.quantity||1),0);
  const totalValue=cards.reduce((s,c)=>s+(parseFloat(c.purchase_price)||0)*(c.quantity||1),0);
  const date=new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'});
  const dateTime=new Date().toLocaleString('de-DE');

  // Eigenständiges HTML-Dokument bauen, das in einem neuen Fenster gedruckt wird.
  // Das HTML ist bewusst minimal, damit's auf Papier/PDF gut aussieht.
  const tableRows=cards.map(c=>{
    const cardValue=(parseFloat(c.purchase_price)||0)*(c.quantity||1);
    return`<tr>
      <td>${esc(c.name||'')}</td>
      <td>${esc(c.set_name||c.set_code||'')}</td>
      <td>${esc(c.collector_number||'')}</td>
      <td class="right">${c.quantity||1}</td>
      <td>${esc((c.condition||'').replace(/_/g,' '))}</td>
      <td class="center">${c.foil==='foil'?'✦':''}</td>
      <td>${esc(c.language||'')}</td>
      <td class="right">${cardValue>0?cardValue.toFixed(2)+' €':'–'}</td>
    </tr>`;
  }).join('');

  const html=`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>MTG Vault Sammlung — ${date}</title>
  <style>
    @page{margin:1.5cm;}
    *{box-sizing:border-box;}
    body{font-family:'Times New Roman',Georgia,serif;color:#1a1a1a;font-size:10pt;margin:0;padding:0;}
    h1{text-align:center;font-size:20pt;margin:0 0 0.3cm 0;letter-spacing:0.05em;}
    .subtitle{text-align:center;font-size:10pt;color:#666;margin-bottom:0.8cm;font-style:italic;}
    .summary{
      background:#f8f5ec;padding:0.5cm;margin-bottom:0.7cm;
      border-left:4px solid #c9a84c;font-size:11pt;
      display:flex;justify-content:space-around;flex-wrap:wrap;gap:0.5cm;
    }
    .summary-item{text-align:center;}
    .summary-num{font-size:14pt;font-weight:bold;color:#000;display:block;}
    .summary-lbl{font-size:8pt;color:#666;text-transform:uppercase;letter-spacing:0.1em;}
    table{width:100%;border-collapse:collapse;}
    thead{display:table-header-group;}
    th,td{padding:0.18cm 0.28cm;text-align:left;border-bottom:1px solid #ddd;font-size:9pt;}
    th{background:#2c2c2c;color:#fff;font-weight:600;font-size:8.5pt;letter-spacing:0.05em;text-transform:uppercase;}
    tr:nth-child(even) td{background:#fafafa;}
    .right{text-align:right;}
    .center{text-align:center;}
    .footer{margin-top:1cm;font-size:8pt;text-align:center;color:#999;border-top:1px solid #eee;padding-top:0.3cm;}
    @media print{
      .no-print{display:none;}
      tr{page-break-inside:avoid;}
    }
    .no-print{
      position:fixed;top:1rem;right:1rem;
      background:#c9a84c;color:#000;border:none;padding:0.5rem 1rem;
      font-family:sans-serif;border-radius:4px;cursor:pointer;font-size:0.9rem;
    }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">🖨 Drucken / Als PDF speichern</button>
  <h1>Magic: The Gathering Sammlung</h1>
  <div class="subtitle">Exportiert am ${date}</div>
  <div class="summary">
    <div class="summary-item"><span class="summary-num">${totalCards}</span><span class="summary-lbl">Karten gesamt</span></div>
    <div class="summary-item"><span class="summary-num">${cards.length}</span><span class="summary-lbl">Einträge</span></div>
    <div class="summary-item"><span class="summary-num">${totalValue.toFixed(2)} €</span><span class="summary-lbl">Gesamtwert</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Set</th>
        <th>#</th>
        <th class="right">Anzahl</th>
        <th>Zustand</th>
        <th class="center">Foil</th>
        <th>Sprache</th>
        <th class="right">Wert</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div class="footer">MTG Vault · Erzeugt am ${dateTime}</div>
</body>
</html>`;

  // Neues Fenster öffnen, HTML reinschreiben, Druckdialog automatisch öffnen
  const w=window.open('','_blank');
  if(!w){
    toastError('Bitte Pop-ups für diese Seite erlauben, sonst kann das PDF nicht erzeugt werden.');
    return;
  }
  w.document.write(html);
  w.document.close();
  // Kleine Verzögerung, damit das Fenster vollständig gerendert ist, bevor der
  // Druckdialog kommt — sonst öffnet sich der manchmal vor dem fertigen Layout
  setTimeout(()=>{
    try{w.focus();w.print();}catch(e){}
  },300);

  toastSuccess(`Druckdialog geöffnet (${cards.length} Einträge). Wähle "Als PDF speichern".`);
}
