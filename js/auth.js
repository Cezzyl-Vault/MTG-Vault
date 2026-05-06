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
    if(res.error){errEl.textContent=res.error.message;setBusy(submitBtn,false);return;}
    if(authMode==='signup'&&!res.data.session){errEl.style.color='var(--green)';errEl.textContent='Bestätigungsmail gesendet!';setBusy(submitBtn,false);return;}
    showApp(res.data.user||res.data.session.user);
  }catch(e){
    errEl.textContent='Verbindungsfehler. Bitte erneut versuchen.';
    setBusy(submitBtn,false);
  }
}
async function signOut(){await _sb.auth.signOut();allCards=[];allDecks=[];currentUser=null;showAuth();}

