// ══════════════════════════════════════════════════════════
//  UI  ·  Bestätigungs-Modal, Button-Lade-States, Toasts
// ══════════════════════════════════════════════════════════
//
//  Drei wiederverwendbare UI-Helfer, die App-weit genutzt werden:
//
//  1. confirmAction(text, options) — eigenes Bestätigungs-Modal
//     im Vault-Stil. Ersetzt das hässliche Browser-confirm().
//     Gibt ein Promise zurück: true wenn bestätigt, false wenn abgebrochen.
//
//  2. setBusy(button, busy, busyText?) — Button in Lade-Zustand
//     versetzen (deaktiviert, Text wird zu "…", optional Spinner).
//
//  3. toastError(msg) / toastSuccess(msg) — semantische Wrapper um
//     showToast() für konsistentes Feedback.

// ── BESTÄTIGUNGS-MODAL ──
//
// Aufruf:
//   const ok = await confirmAction('Karte wirklich löschen?');
//   if(!ok) return;
//
// Mit Optionen:
//   await confirmAction('Deck löschen?', {
//     title: 'DECK LÖSCHEN',
//     confirmLabel: 'Löschen',
//     danger: true
//   });
function confirmAction(message, options={}){
  const{
    title='BESTÄTIGEN',
    confirmLabel='Bestätigen',
    cancelLabel='Abbrechen',
    danger=false
  }=options;

  return new Promise(resolve=>{
    const overlay=document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent=title;
    document.getElementById('confirmMessage').textContent=message;
    const confirmBtn=document.getElementById('confirmBtnYes');
    const cancelBtn=document.getElementById('confirmBtnNo');
    confirmBtn.textContent=confirmLabel;
    cancelBtn.textContent=cancelLabel;
    confirmBtn.className=danger?'btn btn-danger':'btn btn-primary';

    // Cleanup-Funktion, damit alte Listener nicht aktiv bleiben
    function cleanup(result){
      overlay.classList.remove('open');
      confirmBtn.removeEventListener('click',onYes);
      cancelBtn.removeEventListener('click',onNo);
      overlay.removeEventListener('click',onOverlayClick);
      document.removeEventListener('keydown',onKey);
      resolve(result);
    }
    function onYes(){cleanup(true);}
    function onNo(){cleanup(false);}
    function onOverlayClick(e){if(e.target===overlay)cleanup(false);}
    function onKey(e){
      if(e.key==='Escape')cleanup(false);
      else if(e.key==='Enter')cleanup(true);
    }

    confirmBtn.addEventListener('click',onYes);
    cancelBtn.addEventListener('click',onNo);
    overlay.addEventListener('click',onOverlayClick);
    document.addEventListener('keydown',onKey);

    overlay.classList.add('open');
    // Fokus auf Bestätigen-Button, damit Enter direkt funktioniert
    setTimeout(()=>confirmBtn.focus(),50);
  });
}

// ── BUTTON LADE-ZUSTAND ──
//
// Aufruf:
//   setBusy(btn, true, 'Speichert…');   // deaktiviert + Text + Spinner
//   ... await operation() ...
//   setBusy(btn, false);                 // zurück
function setBusy(btn,busy,busyText){
  if(!btn)return;
  if(busy){
    // Originaltext sichern, falls noch nicht geschehen
    if(!btn.dataset.originalText)btn.dataset.originalText=btn.innerHTML;
    btn.disabled=true;
    btn.classList.add('is-busy');
    btn.innerHTML=`<span class="btn-spinner"></span>${busyText||btn.dataset.originalText}`;
  }else{
    btn.disabled=false;
    btn.classList.remove('is-busy');
    if(btn.dataset.originalText){
      btn.innerHTML=btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
  }
}

// ── TOAST-VARIANTEN ──
//
// Semantische Wrapper, damit Fehler optisch von Erfolg unterscheidbar sind.
// Ein Fehler-Toast bleibt länger sichtbar (5s statt 3s).
function toastSuccess(msg){showToastTyped(msg,'success',3000);}
function toastError(msg){showToastTyped(msg,'error',5000);}
function toastInfo(msg){showToastTyped(msg,'info',3000);}

function showToastTyped(msg,type,duration){
  const t=document.getElementById('toast');
  if(!t)return;
  t.textContent=msg;
  // CSS-Klassen-Variante für Farbe
  t.className='toast '+type;
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer=setTimeout(()=>t.classList.remove('show'),duration||3000);
}
