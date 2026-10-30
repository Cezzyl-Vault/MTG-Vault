// ══════════════════════════════════════════════════════════
//  AUTH  ·  Login, Registrierung, Logout
// ══════════════════════════════════════════════════════════
function switchAuthTab(m){
  authMode=m;
  document.getElementById('tabLogin').classList.toggle('active',m==='login');
  document.getElementById('tabSignup').classList.toggle('active',m==='signup');
  document.getElementById('authSubmit').textContent=m==='login'?'Anmelden':'Registrieren';
  document.getElementById('authError').textContent='';
}
async function submitAuth(){
  const email=document.getElementById('authEmail').value.trim();
  const pw=document.getElementById('authPassword').value;
  const errEl=document.getElementById('authError');
  const submitBtn=document.getElementById('authSubmit');
  errEl.textContent='';errEl.style.color='var(--red)';
  if(!email||!pw){errEl.textContent='E-Mail und Passwort erforderlich.';return;}
  // Button in Lade-Zustand setzen
  setBusy(submitBtn,true,authMode==='login'?'Anmelden…':'Registrieren…');
  try{
    let res=authMode==='login'
      ?await _sb.auth.signInWithPassword({email,password:pw})
      :await _sb.auth.signUp({email,password:pw});
    if(res.error){
      setBusy(submitBtn,false);
      // Datenbank zwischenzeitlich pausiert? → Status-Bildschirm statt kryptischer Fehlermeldung
      const cfg=loadCfg();
      if(cfg&&!await checkDbReachable(cfg)){showDbPaused(cfg);return;}
      errEl.textContent=res.error.message;return;
    }
    if(authMode==='signup'&&!res.data.session){errEl.style.color='var(--green)';errEl.textContent='Bestätigungsmail gesendet!';setBusy(submitBtn,false);return;}
    showApp(res.data.user||res.data.session.user);
  }catch(e){
    setBusy(submitBtn,false);
    const cfg=loadCfg();
    if(cfg&&!await checkDbReachable(cfg)){showDbPaused(cfg);return;}
    errEl.textContent='Verbindungsfehler. Bitte erneut versuchen.';
  }
}
// Login ohne Passwort: Supabase schickt einen Anmeldelink an die E-Mail.
// Der Link führt zurück auf genau diese Seite; supabase-js liest die Session
// beim Start aus der Adresse (detectSessionInUrl) und speichert sie dauerhaft.
// shouldCreateUser:false → per Link lässt sich nur ein bestehendes Konto
// anmelden, kein neues anlegen.
async function sendMagicLink(){
  const email=document.getElementById('authEmail').value.trim();
  const errEl=document.getElementById('authError');
  const btn=document.getElementById('authMagicLink');
  errEl.textContent='';errEl.style.color='var(--red)';
  if(!email){errEl.textContent='Bitte zuerst deine E-Mail-Adresse eingeben.';return;}
  setBusy(btn,true,'Sende Link…');
  try{
    const{error}=await _sb.auth.signInWithOtp({email,options:{
      shouldCreateUser:false,
      emailRedirectTo:location.origin+location.pathname
    }});
    setBusy(btn,false);
    if(error){
      const cfg=loadCfg();
      if(cfg&&!await checkDbReachable(cfg)){showDbPaused(cfg);return;}
      errEl.textContent=/rate limit|security purposes/i.test(error.message)
        ?'Zu viele Anfragen. Bitte ein paar Minuten warten und erneut versuchen.'
        :/signups? not allowed|not found/i.test(error.message)
          ?'Zu dieser E-Mail gibt es kein Konto.'
          :error.message;
      return;
    }
    errEl.style.color='var(--green)';
    errEl.textContent='Link gesendet! Öffne die E-Mail auf diesem Gerät und klicke auf den Link.';
  }catch(e){
    setBusy(btn,false);
    const cfg=loadCfg();
    if(cfg&&!await checkDbReachable(cfg)){showDbPaused(cfg);return;}
    errEl.textContent='Verbindungsfehler. Bitte erneut versuchen.';
  }
}

// Kommt man über einen abgelaufenen/ungültigen Anmeldelink zurück, hängt
// Supabase den Fehler an die Adresse (#error_description=…). Meldung auf dem
// Login-Bildschirm zeigen und die Adresse aufräumen.
function showAuthErrorFromUrl(){
  const params=new URLSearchParams(location.hash.slice(1)||location.search.slice(1));
  const desc=params.get('error_description');
  if(!desc)return;
  const errEl=document.getElementById('authError');
  errEl.style.color='var(--red)';
  errEl.textContent=params.get('error_code')==='otp_expired'
    ?'Der Anmeldelink ist abgelaufen oder wurde schon benutzt. Bitte einen neuen anfordern.'
    :'Anmeldung fehlgeschlagen: '+desc.replace(/\+/g,' ');
  history.replaceState(null,'',location.pathname);
}

async function signOut(){await _sb.auth.signOut();allCards=[];allDecks=[];currentUser=null;showAuth();}

