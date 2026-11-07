// Customer pages share the same keyboard and mobile navigation behaviour.
export function wireCustomerNavigation() {
 const navigation=document.querySelector('#main-nav'),toggle=document.querySelector('#nav-toggle');
 if(!navigation||!toggle)return;
 const close=()=>{
  navigation.classList.remove('is-open');
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');
 };
 toggle.addEventListener('click',()=>{
  const expanded=toggle.getAttribute('aria-expanded')!=='true';
  navigation.classList.toggle('is-open',expanded);toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'Close navigation':'Open navigation');
 });
 navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){close();toggle.focus();}
 });
 document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))close();});
}
