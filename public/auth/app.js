import { cloudConfig, cloudClient, identity, roleHome, rootURL, sessionPortal, signInAccount, rememberAuthCallback } from '../shared/cloud.js?v=portal-auth-1';
import { portalPath, portalAllows } from '../shared/session-scope.js?v=portal-auth-1';
import { signupErrorMessage } from './errors.js';
const $ = selector => document.querySelector(selector);
const form = $('#auth-form'), status = $('#auth-status');
const authButtons=[...document.querySelectorAll('button')];
for(const button of authButtons)button.disabled=true;
let mode = 'signin', busy = false, recovery = false;

export function safeDestination(next, role, portal=sessionPortal) {
 const root = new URL(rootURL('')); let url;
 const fallback=portalAllows(portal,role)?rootURL(portalPath(portal)):roleHome(role);
 try { url = new URL(next || fallback, root); } catch { return fallback; }
 if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return fallback;
 const path = url.pathname.slice(root.pathname.length);
 const allowed = role === 'admin' ? ['admin/', 'kitchen/'] : role === 'chef' ? ['kitchen/'] : ['', 'index.html', 'orders/', 'orders/index.html'];
 return allowed.includes(path) ? url.href : fallback;
}
function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
function setMode(value) {
 if(value==='signup'&&sessionPortal!=='customer')return;
 mode = value; form.reset();
 const signup = mode === 'signup', reset = mode === 'reset', update = mode === 'update';
 for (const id of ['name-field','confirm-field','signup-consent']) $( '#' + id).hidden = id === 'name-field' || id === 'signup-consent' ? !signup : !(signup || update);
 $('#email-field').hidden = update; form.elements.email.required = !update;
 $('#password-field').hidden = reset; form.elements.password.required = !reset;
 form.elements.password.minLength = signup || update ? 12 : 1;
 form.elements.password.autocomplete = signup || update ? 'new-password' : 'current-password';
 form.elements.name.required = signup; form.elements.confirmation.required = signup || update; form.elements.consent.required = signup;
 $('#forgot-password').hidden = mode !== 'signin'; $('#back-to-signin').hidden = !(reset || update);
 $('#auth-title').innerHTML = signup ? 'Join the <em>table.</em>' : reset || update ? 'A fresh <em>start.</em>' : sessionPortal==='admin'?'Administrator<br><em>sign in.</em>':sessionPortal==='kitchen'?'Kitchen<br><em>sign in.</em>':'Welcome <em>back.</em>';
 $('#auth-description').textContent = signup ? 'Create your customer account. Confirm your email before signing in.' : reset ? 'Enter your account email to request a password reset link.' : update ? 'Choose a new password with at least 12 characters.' : sessionPortal==='customer'?'Sign in to order and follow your food. Staff sign-ins are separate from your customer session.':`Use your ${sessionPortal==='admin'?'administrator':'chef or administrator'} credentials. Signing out here keeps the other portals signed in.`;
 $('#auth-submit').textContent = signup ? 'Create account' : reset ? 'Send reset link' : update ? 'Save new password' : 'Sign in';
 $('#show-signin').setAttribute('aria-pressed', String(mode === 'signin')); $('#show-signup').setAttribute('aria-pressed', String(signup));
 $('#show-signin').classList.toggle('ops-button-primary',!signup);$('#show-signup').classList.toggle('ops-button-primary',signup);
 message('');
}
$('#show-signup').hidden=sessionPortal!=='customer';
document.querySelector('.auth-tabs').hidden=sessionPortal!=='customer';
$('#auth-portal-label').textContent=sessionPortal==='admin'?'ADMINISTRATOR ACCESS':sessionPortal==='kitchen'?'KITCHEN ACCESS':'A SEAT AT OUR TABLE';
document.title=sessionPortal==='admin'?'Administrator sign in — BitesBro':sessionPortal==='kitchen'?'Kitchen sign in — BitesBro':'Your account — BitesBro';
document.querySelectorAll('[data-auth-portal]').forEach(link=>{const portal=link.dataset.authPortal,url=new URL(rootURL('auth/'));url.searchParams.set('portal',portal);url.searchParams.set('next',new URL(rootURL(portalPath(portal))).pathname);link.href=url;link.toggleAttribute('aria-current',portal===sessionPortal);if(portal===sessionPortal)link.setAttribute('aria-current','page');});
$('#show-signin').addEventListener('click', () => { if (!busy) setMode('signin'); });
$('#show-signup').addEventListener('click', () => { if (!busy) setMode('signup'); });
$('#forgot-password').addEventListener('click', () => setMode('reset'));
$('#back-to-signin').addEventListener('click', () => setMode('signin'));
form.addEventListener('submit', async event => {
 event.preventDefault(); if (busy || !form.reportValidity()) return;
 const values = Object.fromEntries(new FormData(form));
 if (['signup','update'].includes(mode) && values.password !== values.confirmation) return message('The two passwords must match.', true);
 busy = true; for (const button of document.querySelectorAll('button')) button.disabled = true; message('One little moment…');
 try {
  const client = await cloudClient(); const redirectTo = rootURL('auth/');
  if (mode === 'signup') {
   rememberAuthCallback();
   const { error } = await client.auth.signUp({ email: values.email.trim(), password: values.password, options: { data: { display_name: values.name.trim() }, emailRedirectTo: redirectTo } });
   if (error) throw new Error(signupErrorMessage(error));
   setMode('signin'); message('Check your email for a confirmation link, then sign in. If you already have an account, use your existing password.');
  } else if (mode === 'reset') {
   rememberAuthCallback();
   const { error } = await client.auth.resetPasswordForEmail(values.email.trim(), { redirectTo });
   if (error) throw new Error('A reset link could not be requested. Please try again later.');
   message('If this email has an account, a password reset link will be sent.');
  } else if (mode === 'update') {
   if (!recovery) throw new Error('Open the password reset link from your email first.');
   const { error } = await client.auth.updateUser({ password: values.password });
   if (error) throw new Error('The password could not be updated. Request a new reset link and retry.');
   recovery = false; await client.auth.signOut({ scope: 'local' }); setMode('signin'); message('Password updated. Sign in with your new password.');
  } else {
   const account=await signInAccount(values.email.trim(),values.password);
   location.replace(safeDestination(new URL(location.href).searchParams.get('next'),account.role,account.portal));
  }
 } catch (error) { message(error.message, true); }
 finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; }
});
try {
 const config = await cloudConfig();
 if (!config.enabled) throw new Error('Supabase accounts are not configured on this deployment yet.');
 const client = await cloudClient();
 client.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') { recovery = true; setMode('update'); } });
 // Initializing auth completes PKCE confirmation/recovery callbacks before reading the role.
 const { error } = await client.auth.getSession();
 if (error) throw new Error('This account link has expired or could not be verified. Request a new link.');
 if (!recovery) {
  const account = await identity();
  if (account && !account.guest) location.replace(safeDestination(new URL(location.href).searchParams.get('next'), account.role));
  else {setMode('signin');if(account?.guest)$('#auth-description').textContent='You are using guest checkout. Signing into a customer account replaces that guest session; guest orders do not move to the other account. Staff portal sign-ins stay separate.';form.hidden=false;}
 }
 else form.hidden=false;
 if(!form.hidden)for(const button of authButtons)button.disabled=false;
} catch (error) { message(error.message, true); }
