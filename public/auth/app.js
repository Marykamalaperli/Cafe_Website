import { cloudConfig, cloudClient, identity, roleHome, rootURL } from '../shared/cloud.js';
const $ = selector => document.querySelector(selector);
const form = $('#auth-form'), status = $('#auth-status');
let mode = 'signin', busy = false, recovery = false;

export function safeDestination(next, role) {
 const root = new URL(rootURL('')); let url;
 try { url = new URL(next || roleHome(role), root); } catch { return roleHome(role); }
 if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return roleHome(role);
 const path = url.pathname.slice(root.pathname.length);
 const allowed = role === 'admin' ? ['admin/', 'kitchen/'] : role === 'chef' ? ['kitchen/'] : ['', 'index.html', 'orders/', 'orders/index.html'];
 return allowed.includes(path) ? url.href : roleHome(role);
}
function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
function setMode(value) {
 mode = value; form.reset();
 const signup = mode === 'signup', reset = mode === 'reset', update = mode === 'update';
 for (const id of ['name-field','confirm-field','signup-consent']) $( '#' + id).hidden = id === 'name-field' || id === 'signup-consent' ? !signup : !(signup || update);
 $('#email-field').hidden = update; form.elements.email.required = !update;
 $('#password-field').hidden = reset; form.elements.password.required = !reset;
 form.elements.password.minLength = signup || update ? 12 : 1;
 form.elements.password.autocomplete = signup || update ? 'new-password' : 'current-password';
 form.elements.name.required = signup; form.elements.confirmation.required = signup || update; form.elements.consent.required = signup;
 $('#forgot-password').hidden = mode !== 'signin'; $('#back-to-signin').hidden = !(reset || update);
 $('#auth-title').innerHTML = signup ? 'Join the <em>table.</em>' : reset || update ? 'A fresh <em>start.</em>' : 'Welcome <em>back.</em>';
 $('#auth-description').textContent = signup ? 'Create your customer account. Confirm your email before signing in.' : reset ? 'Enter your account email to request a password reset link.' : update ? 'Choose a new password with at least 12 characters.' : 'Sign in to order and follow your food. Staff use the same secure sign-in.';
 $('#auth-submit').textContent = signup ? 'Create account' : reset ? 'Send reset link' : update ? 'Save new password' : 'Sign in';
 $('#show-signin').setAttribute('aria-pressed', String(mode === 'signin')); $('#show-signup').setAttribute('aria-pressed', String(signup));
 $('#show-signin').classList.toggle('ops-button-primary',!signup);$('#show-signup').classList.toggle('ops-button-primary',signup);
 message('');
}
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
   const { error } = await client.auth.signUp({ email: values.email.trim(), password: values.password, options: { data: { display_name: values.name.trim() }, emailRedirectTo: redirectTo } });
   if (error) throw new Error('The account could not be created. Check the details or try signing in.');
   setMode('signin'); message('Check your email for a confirmation link, then sign in. If you already have an account, use your existing password.');
  } else if (mode === 'reset') {
   const { error } = await client.auth.resetPasswordForEmail(values.email.trim(), { redirectTo });
   if (error) throw new Error('A reset link could not be requested. Please try again later.');
   message('If this email has an account, a password reset link will be sent.');
  } else if (mode === 'update') {
   if (!recovery) throw new Error('Open the password reset link from your email first.');
   const { error } = await client.auth.updateUser({ password: values.password });
   if (error) throw new Error('The password could not be updated. Request a new reset link and retry.');
   recovery = false; await client.auth.signOut({ scope: 'local' }); setMode('signin'); message('Password updated. Sign in with your new password.');
  } else {
   const { error } = await client.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
   if (error) throw new Error('Sign-in failed. Check your email and password, and confirm your email first.');
   const account = await identity(); if (!account) throw new Error('Your account role is not ready. Run the database setup and confirm your email.');
   location.replace(safeDestination(new URL(location.href).searchParams.get('next'), account.role));
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
 form.hidden = false;
 if (!recovery) {
  const account = await identity();
  if (account) location.replace(safeDestination(new URL(location.href).searchParams.get('next'), account.role));
  else setMode('signin');
 }
} catch (error) { message(error.message, true); }
