import {mealRecommendations} from './recommendations.js';
import {connectDemoStore,clearDamagedDemo} from './shared/demo-store.js?v=history-7';
import {priceDemoBag,DEMO_BUSINESS} from './shared/demo-model.js?v=history-7';
import {mountRoleNavigation,siteURL} from './shared/ui.js?v=history-7';
import {cloudConfig,cloudRequest,requireRole,cloudClient,loginURL} from './shared/cloud.js';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:n%100?2:0}).format(n/100);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asset=path=>new URL(path.replace(/^\//,''),document.baseURI).href;
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="${asset('assets/icons.svg')}#${name}"/></svg>`;
const state={menu:[],categories:[],category:'all',search:'',diet:'all',sort:'recommended',limit:12,cart:[],cafe:null,browseOnly:false};
const photoAlt=item=>item.photo?'Representative photograph: '+item.photo.title:item.name;
const photoReference=item=>item.photo?.reference?`<span class="photo-reference">${escape(item.photo.reference)}</span>`:'';
const CART_KEY='bitesbro.food-bag.v2';
let toastTimer, selectedDish, recommendationClock;
let demoMode=false,demoStore,cloudEnabled=false,account,checkoutRequestId;
async function request(path,options={}){
 if(cloudEnabled) return cloudRequest(path,options);
 const response=await fetch(path,{...options,signal:options.signal||AbortSignal.timeout(12000),headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 let data;try{data=await response.json();}catch{const e=new Error('The ordering server is not available.');e.status=response.status;throw e;}
 if(!response.ok){const e=new Error(data.error||'Please try again.');e.fields=data.fields;e.status=response.status;throw e;}
 return data;
}
function notify(message,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=message;t.classList.toggle('error',error);t.classList.add('visible');toastTimer=setTimeout(()=>t.classList.remove('visible'),3500);}
const itemFor=line=>state.menu.find(item=>item.id===line.id);
function optionsFor(line){const item=itemFor(line);return {item,variant:item?.variants.find(v=>v.id===line.variant),addons:item?.addons.filter(a=>line.addons.includes(a.id))||[]};}
function unitPrice(line){const {item,variant,addons}=optionsFor(line);return (item?.price||0)+(variant?.price||0)+addons.reduce((n,a)=>n+a.price,0);}
const lineKey=line=>JSON.stringify([line.id,line.variant,line.spice,[...line.addons].sort()]);
function readCart(){
 try{
  const saved=JSON.parse(localStorage.getItem(CART_KEY)||localStorage.getItem('bitesbro.bag.v1')||'[]');
  if(!Array.isArray(saved)) return [];
  const result=[],keys=new Set();let total=0;
  for(const entry of saved){
   if(!entry||!Number.isInteger(entry.quantity)||entry.quantity<1||entry.quantity>10||total+entry.quantity>30) continue;
   const item=itemFor(entry);if(!item)continue;
   const variant=entry.variant||item.variants[0].id,spice=entry.spice||item.spice,addons=entry.addons||[];
   if(!item.variants.some(v=>v.id===variant)||!Array.isArray(addons)||new Set(addons).size!==addons.length||addons.some(id=>!item.addons.some(a=>a.id===id))||!(item.spice==='none'?['none']:['mild','medium','hot']).includes(spice))continue;
   const line={id:item.id,variant,spice,addons:[...addons].sort(),quantity:entry.quantity};line.key=lineKey(line);
   if(keys.has(line.key))continue;keys.add(line.key);total+=line.quantity;result.push(line);
  }
  return result;
 }catch{return [];}
}
function subtotal(){return state.cart.reduce((sum,line)=>sum+unitPrice(line)*line.quantity,0);}
function deliveryFee(){const fulfilment=demoMode?$('#demo-fulfilment').value:$('#fulfilment').value;return fulfilment==='delivery'&&subtotal()<(demoMode?DEMO_BUSINESS.freeDeliveryFrom:state.cafe?.freeDeliveryFrom??49900)?(demoMode?DEMO_BUSINESS.deliveryFee:state.cafe?.deliveryFee??4000):0;}
function saveCart(){
 try{localStorage.setItem(CART_KEY,JSON.stringify(state.cart));localStorage.removeItem('bitesbro.bag.v1');}catch{}
 const count=state.cart.reduce((sum,line)=>sum+line.quantity,0);
 $('#bag-count').textContent=count;$('#open-cart').setAttribute('aria-label',`Open bag, ${count} ${count===1?'item':'items'}`);
 $('#mobile-bag').hidden=!count;$('#mobile-bag-count').textContent=`${count} ${count===1?'dish':'dishes'}`;$('#mobile-bag-total').textContent=money(subtotal());document.body.classList.toggle('has-items',count>0);
}
function renderSignature(){const item=state.menu.find(i=>i.id==='masala-dosa');$('#signature').hidden=!item;if(!item)return;$('#signature-name').textContent=item.name;$('#signature-description').textContent=item.description;$('#signature-price').textContent=money(item.price);$('#signature-add').disabled=false;$('#signature-add').setAttribute('aria-label','Customise '+item.name);}
function renderMenu(){
 let filtered=state.menu.filter(item=>(state.category==='all'||item.category===state.category)&&(state.diet==='all'||(state.diet==='veg'?item.diet!=='non-veg':item.diet===state.diet))&&(`${item.name} ${item.description} ${item.cuisine} ${item.ingredients.join(' ')}`.toLowerCase().includes(state.search)));
 if(state.sort!=='recommended')filtered.sort((a,b)=>state.sort==='price-low'?a.price-b.price:b.price-a.price);
 $('#menu-status').textContent='';$('#menu-grid').setAttribute('aria-busy','false');$('#menu-count').textContent=`${filtered.length} ${filtered.length===1?'dish':'dishes'} to dig into`;
 $('#load-more').hidden=filtered.length<=state.limit;
 $('#menu-grid').innerHTML=filtered.length?filtered.slice(0,state.limit).map(item=>`<article class="menu-card" data-kind="${escape(item.category)}"><div class="menu-card-image"><img src="${escape(asset(item.image))}" alt="${escape(photoAlt(item))}" width="600" height="480" loading="lazy">${photoReference(item)}${item.badge?`<span class="menu-badge">${escape(item.badge)}</span>`:''}</div><div class="menu-card-body"><div class="menu-card-kicker"><span class="diet-tag ${item.diet==='non-veg'?'non-veg':''}"><span aria-hidden="true"></span>${item.diet==='non-veg'?'NON-VEG':item.diet==='vegan'?'PLANT BASED':'VEGETARIAN'}</span><span>~${item.prepMinutes} MIN</span></div><h3>${escape(item.name)}</h3><p class="menu-card-description">${escape(item.description)}</p><div class="food-portion"><span>${escape(item.portion)}</span>${item.spice!=='none'?`<span>${escape(item.spice)} spice</span>`:''}</div><div class="menu-card-meta"><span class="menu-price">${money(item.price)}</span><button class="add-button" data-add="${escape(item.id)}" aria-label="Add ${escape(item.name)} to bag">Add <span aria-hidden="true">+</span></button></div></div></article>`).join(''):`<div class="empty-state">${icon('search')}<h3>No bites found. Yet.</h3><p>Try a different cuisine, diet or craving.</p><button class="button button-outline" id="reset-menu">Show the whole menu</button></div>`;
}
function setCategory(category){state.category=category;state.limit=12;$$('.menu-tab').forEach(b=>{const active=b.dataset.category===category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderMenu();}
$$('.menu-tab').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.category)));
$$('[data-quick-category]').forEach(b=>b.addEventListener('click',()=>{setCategory(b.dataset.quickCategory);$('#menu').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));
$('#menu-search').addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();state.limit=12;renderMenu();});
$('#diet-filter').addEventListener('change',e=>{state.diet=e.target.value;state.limit=12;renderMenu();renderRecommendations();});
$('#sort-filter').addEventListener('change',e=>{state.sort=e.target.value;renderMenu();});
$('#load-more').addEventListener('click',()=>{state.limit+=12;renderMenu();});
$('#menu-grid').addEventListener('click',event=>{const b=event.target.closest('[data-add]');if(b)openDish(b.dataset.add);if(event.target.closest('#reset-menu')){state.diet='all';state.search='';$('#diet-filter').value='all';$('#menu-search').value='';setCategory('all');renderRecommendations();}if(event.target.closest('#retry-menu'))boot();});
function openDialog(dialog){if(!dialog.open)dialog.showModal();document.body.classList.add('dialog-open');}
document.addEventListener('click',event=>{const b=event.target.closest('[data-dialog]');if(b)openDialog(document.getElementById(b.dataset.dialog));event.target.closest('.close-dialog')?.closest('dialog').close();});
$$('dialog').forEach(dialog=>{dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});dialog.addEventListener('close',()=>{if(!$$('dialog[open]').length)document.body.classList.remove('dialog-open');});});
function openDish(id){
 const item=state.menu.find(i=>i.id===id);if(!item)return;selectedDish=item;
 $('#dish-title').textContent=item.name;
 $('#dish-detail').innerHTML=`<img class="dish-preview" src="${escape(asset(item.image))}" alt="${escape(photoAlt(item))}">${item.photo?`<p class="dish-photo-credit">${escape(item.photo.reference||'Representative food photograph')}. <a href="./photo-credits.html#${escape(item.photo.id)}">Photo credits</a></p>`:''}<p>${escape(item.description)}</p><p class="dish-facts">${escape(item.cuisine)} · ${escape(item.portion)} · ~${item.prepMinutes} min · ${item.diet==='non-veg'?'Non-vegetarian':item.diet==='vegan'?'Plant based':'Vegetarian'}</p>${item.ingredients.length?`<p class="ingredient-note"><strong>Sample ingredients:</strong> ${escape(item.ingredients.join(', '))}</p>`:''}<p class="ingredient-note"><strong>Allergens:</strong> ${item.allergens.length?escape(item.allergens.join(', ')):'No common allergens listed in the sample recipe'}. Shared kitchen; confirm handling before live service.</p>`;
 $('#dish-variant').replaceChildren(...item.variants.map(v=>new Option(v.label+(v.price?' +'+money(v.price):''),v.id)));
 $('#spice-label').hidden=item.spice==='none';$('#dish-spice').disabled=item.spice==='none';$('#dish-spice').value=item.spice==='none'?'medium':item.spice;
 $('#dish-addons').hidden=!item.addons.length;$('#addon-choices').innerHTML=item.addons.map(a=>`<label class="addon-choice"><span><input type="checkbox" name="addon" value="${escape(a.id)}">${escape(a.label)}</span><span>+${money(a.price)}</span></label>`).join('');
 updateDishPrice();openDialog($('#dish-dialog'));
}
function selectedLine(){const item=selectedDish;return {id:item.id,variant:$('#dish-variant').value,spice:item.spice==='none'?'none':$('#dish-spice').value,addons:$$('#addon-choices input:checked').map(i=>i.value).sort(),quantity:1};}
function updateDishPrice(){if(selectedDish)$('#dish-add').textContent='Add to order · '+money(unitPrice(selectedLine()));}
$('#customise-form').addEventListener('change',updateDishPrice);
$('#customise-form').addEventListener('submit',e=>{e.preventDefault();const line=selectedLine();line.key=lineKey(line);const existing=state.cart.find(l=>l.key===line.key);if((existing?.quantity||0)>=10||state.cart.reduce((n,l)=>n+l.quantity,0)>=30)return notify('Maximum 10 of each dish and 30 items per order.',true);if(existing)existing.quantity++;else state.cart.push(line);saveCart();$('#dish-dialog').close();notify(selectedDish.name+' added to your food bag.');});
$('#signature-add').addEventListener('click',()=>openDish('masala-dosa'));
function renderCart(){
 $('#cart-checkout').hidden=!state.cart.length;
 if(!state.cart.length){$('#cart-content').innerHTML=`<div class="cart-empty">${icon('plate')}<h3>A little room for good food.</h3><p>Your next favourite bite is on the menu.</p><button class="button button-orange" id="browse-menu">Find your craving ${icon('arrow')}</button></div>`;return;}
 $('#cart-content').innerHTML=state.cart.map(line=>{const {item,variant,addons}=optionsFor(line);const summary=[variant.label,...(line.spice==='none'?[]:[line.spice+' spice']),...addons.map(a=>a.label)].join(' · ');return `<div class="cart-item"><img class="cart-item-image" src="${escape(asset(item.image))}" alt="" width="72" height="72"><div><h3>${escape(item.name)}</h3><p class="cart-options">${escape(summary)}</p><p class="cart-item-price">${money(unitPrice(line)*line.quantity)}</p><div class="quantity-control"><button data-quantity="${escape(line.key)}" data-delta="-1" aria-label="Remove one ${escape(item.name)}">−</button><span>${line.quantity}</span><button data-quantity="${escape(line.key)}" data-delta="1" aria-label="Add one ${escape(item.name)}">+</button></div></div><button class="remove-item" data-remove="${escape(line.key)}" aria-label="Remove ${escape(item.name)} from bag">×</button></div>`;}).join('');
 updateTotals();
}
function updateTotals(){const fee=deliveryFee();$('#cart-subtotal').textContent=money(subtotal());$('#cart-delivery').textContent=(demoMode?$('#demo-fulfilment').value:$('#fulfilment').value)==='pickup'?'Pickup · free':fee?money(fee):'Free';$('#cart-total').textContent=money(subtotal()+fee);}
function showCart(){renderCart();openDialog($('#cart-dialog'));}
$('#open-cart').addEventListener('click',showCart);$('#mobile-bag').addEventListener('click',showCart);
$('#cart-content').addEventListener('click',event=>{
 if(event.target.closest('#browse-menu')){$('#cart-dialog').close();$('#menu').scrollIntoView({behavior:'smooth'});return;}
 const remove=event.target.closest('[data-remove]'),quantity=event.target.closest('[data-quantity]');
 if(remove)state.cart=state.cart.filter(l=>l.key!==remove.dataset.remove);
 if(quantity){const line=state.cart.find(l=>l.key===quantity.dataset.quantity);if(!line)return;const delta=Number(quantity.dataset.delta);if(delta>0&&(line.quantity>=10||state.cart.reduce((n,l)=>n+l.quantity,0)>=30))return notify('Maximum 10 of each dish and 30 items per order.',true);line.quantity+=delta;state.cart=state.cart.filter(l=>l.quantity>0);}
 if(remove||quantity){saveCart();renderCart();}
});
$('#fulfilment').addEventListener('change',()=>{const delivery=$('#fulfilment').value==='delivery';$('#delivery-fields').hidden=!delivery;$$('input,textarea',$('#delivery-fields')).forEach(i=>{i.disabled=!delivery;i.required=delivery;});updateTotals();});

function nextDate(date, days = 1) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function formatTime(time) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'pm' : 'am'}`;
}
const availabilityRequests = new WeakMap();
async function updateTimes(input, select, reservation) {
  availabilityRequests.get(select)?.abort();
  const controller = new AbortController();
  availabilityRequests.set(select, controller);
  select.disabled = true;
  select.replaceChildren(new Option('Checking the good times…', ''));
  if (!input.value) { select.replaceChildren(new Option('Choose your day first', '')); select.disabled = false; return; }
  try {
    const { slots } = await request(`/api/${reservation?'availability':'fulfilment'}?date=${encodeURIComponent(input.value)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
    if (controller.signal.aborted) return;
    const guests = Number($('#reservation-guests').value);
    const available = slots.filter(slot => reservation ? !slot.past && slot.seatsLeft >= guests : slot.available);
    select.replaceChildren(new Option(available.length ? 'Choose a little time' : 'No times left · try another day', ''));
    for (const slot of available) select.add(new Option(formatTime(slot.time), slot.time));
  } catch (error) {
    if (controller.signal.aborted) return;
    select.replaceChildren(new Option('Couldn’t check times · reselect your day', ''));
    const result = $('.form-result', select.closest('form'));
    result.textContent = 'We couldn’t check available times. Please change the day to retry.';
    result.className = 'form-result error';
  } finally { if (!controller.signal.aborted) select.disabled = false; }
}

function initializeDates(form = document) {
  if (!state.cafe || state.browseOnly) return;
  for (const input of $$('input[type=date]', form)) {
    input.min = state.cafe.today;
    input.max = nextDate(state.cafe.today, state.cafe.maxAdvanceDays);
    input.value = (input.id==='reservation-date'?state.cafe.slots:state.cafe.foodSlots).some(time => time > state.cafe.currentTime) ? state.cafe.today : nextDate(state.cafe.today);
    const reservation = input.id === 'reservation-date';
    updateTimes(input, reservation ? $('#reservation-time') : $('#pickup-time'), reservation);
  }
}
$('#reservation-date').addEventListener('change', () => updateTimes($('#reservation-date'), $('#reservation-time'), true));
$('#reservation-guests').addEventListener('change', () => updateTimes($('#reservation-date'), $('#reservation-time'), true));
$('#pickup-date').addEventListener('change', () => updateTimes($('#pickup-date'), $('#pickup-time'), false));

function formValues(form) {
  const values = Object.fromEntries(new FormData(form));
  values.consent = $('input[name=consent]', form).checked;
  return values;
}

function connectForm(id, path, transform = value => value, onSuccess) {
  const form = document.getElementById(id);
  form.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); event.target.classList.remove('field-invalid'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    if(demoMode||state.browseOnly||!state.cafe){const result=$('.form-result',form);result.className='form-result error';result.textContent=demoMode?'Use Demo checkout for a fictional order. Leave demo mode to use connected forms.':'This is the sample menu view. Connect the Node.js ordering server to submit real requests.';return;}
    const submit = $('button[type=submit]', form);
    const result = $('.form-result', form);
    result.textContent = '';
    result.className = 'form-result';
    $$('[aria-invalid]', form).forEach(input => { input.removeAttribute('aria-invalid'); input.classList.remove('field-invalid'); });
    form.dataset.submitting = 'true';
    submit.disabled = true;
    const original = submit.innerHTML;
    submit.textContent = 'One little moment…';
    try {
      if(cloudEnabled && path==='/api/orders') checkoutRequestId ||= crypto.randomUUID();
      const data = await request(path, { method: 'POST', body: JSON.stringify({...transform(formValues(form)),...(cloudEnabled&&path==='/api/orders'?{requestId:checkoutRequestId}:{})}) });
      form.reset();
      if(cloudEnabled&&account&&!account.guest){if(form.elements.email)form.elements.email.value=account.user.email;if(form.elements.name)form.elements.name.value=account.user.user_metadata?.display_name||'';}
      initializeDates(form);
      result.className = 'form-result success';
      result.textContent = `${data.message}${data.reference ? ` Your reference: ${data.reference}.` : ''}`;
      onSuccess?.(data);
    } catch (error) {
      result.className = 'form-result error';
      result.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? 'We couldn’t reach the café. Check your connection and try again.' : error.message;
      if(error.signIn){const link=document.createElement('a');link.href=loginURL();link.textContent=' Sign in / Create account';result.append(link);}
      for (const name of Object.keys(error.fields || {})) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLElement) { field.setAttribute('aria-invalid', 'true'); field.classList.add('field-invalid'); }
      }
      result.tabIndex = -1;
      result.focus();
      if (path === '/api/reservations') updateTimes($('#reservation-date'), $('#reservation-time'), true);
    } finally {
      form.dataset.submitting = 'false';
      submit.disabled = false;
      submit.innerHTML = original;
    }
  });
}
connectForm('reservation-form', '/api/reservations', values => ({ ...values, guests: Number(values.guests) }));
connectForm('newsletter-form', '/api/newsletter');
connectForm('contact-form', '/api/contact');
connectForm('order-form', '/api/orders', values => ({ ...values, items: state.cart.map(({id,quantity,variant,spice,addons})=>({id,quantity,variant,spice,addons})) }), data => {
  checkoutRequestId=undefined;
  state.cart = [];
  saveCart();
  $('#cart-checkout').hidden = true;
  $('#cart-content').innerHTML = `<div class="cart-empty">${icon('check')}<h3>A little good, all saved.</h3><p>Your demo food order is saved in the database.<br><strong>${escape(data.reference)}</strong></p><p>${money(data.total)} · ${escape(data.date)} at ${formatTime(data.time)}<br>No payment is taken, no delivery is dispatched and no email is sent.<br>Please wait for our location announcement before visiting.</p><button class="button button-orange close-dialog">Lovely, thank you ${icon('heart')}</button></div>`;
  if(cloudEnabled)location.assign(siteURL('orders/?order='+encodeURIComponent(data.reference)));
});

const navToggle = $('#nav-toggle');
function closeNav() { $('#main-nav').classList.remove('is-open'); navToggle.setAttribute('aria-expanded', 'false'); navToggle.setAttribute('aria-label', 'Open navigation'); }
navToggle.addEventListener('click', () => { const expanded = navToggle.getAttribute('aria-expanded') !== 'true'; $('#main-nav').classList.toggle('is-open', expanded); navToggle.setAttribute('aria-expanded', String(expanded)); navToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation'); });
$$('#main-nav a').forEach(link => link.addEventListener('click', closeNav));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNav(); });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeNav(); });

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }, { threshold: .08 });
  $$('.reveal').forEach(element => observer.observe(element));
}
if ('IntersectionObserver' in window) {
  const activeSection = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      $$('#main-nav a').forEach(link => { if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
    }
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  $$('main section[id]').forEach(section => activeSection.observe(section));
}
$('#motion-toggle').addEventListener('click', event => {
  const paused = document.documentElement.classList.toggle('motion-paused');
  event.currentTarget.setAttribute('aria-pressed', String(paused));
  event.currentTarget.textContent = paused ? 'Resume animations' : 'Pause animations';
});

$('#year').textContent=new Date().getFullYear();
async function boot(){
 try{
  const config=await cloudConfig(); cloudEnabled=config.enabled;
  demoMode=!cloudEnabled&&config.demoEnabled&&new URL(location.href).searchParams.get('demo')==='1';
  account=await requireRole('customer',{optional:true});
  if(account&&!account.demo&&account.role!=='customer')return;
  await mountRoleNavigation('customer',demoMode,account?.demo?undefined:account);
  if(cloudEnabled) configureCloudCustomer();
  else if(!config.demoEnabled){$('#demo-checkout-panel').hidden=true;$('.demo-workflow').hidden=true;}
 }catch(error){$('#menu-status').textContent=error.message;$('#demo-checkout-panel').hidden=true;$('.demo-workflow').hidden=true;state.browseOnly=true;for(const form of $$('form'))$('button[type=submit]',form)?.setAttribute('disabled','');return;}
 if(demoMode){try{await activateDemo();}catch(error){$('#menu-status').textContent='';$('#menu-grid').setAttribute('aria-busy','false');$('#menu-grid').innerHTML=`<div class="empty-state"><h3>The demo couldn’t open.</h3><p>${escape(error.message)}</p><button class="button button-outline" id="recover-customer-demo">Reset fictional demo data</button></div>`;}return;}
 let catalog;
 state.browseOnly=false;
 try{catalog=await request('/api/menu');if(cloudEnabled&&!catalog.items.length)throw new Error('Supabase menu setup is pending.');}
 catch(error){
  try{const r=await fetch(new URL('menu.json?v=three-roles-1',document.baseURI),{cache:'no-cache',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error();catalog=await r.json();state.browseOnly=true;}
  catch{$('#menu-status').textContent='';$('#menu-grid').setAttribute('aria-busy','false');$('#menu-grid').innerHTML='<div class="empty-state"><h3>The kitchen menu couldn’t load.</h3><p>Check your connection and try again.</p><button class="button button-outline" id="retry-menu">Try again</button></div>';return;}
 }
 state.menu=catalog.items;state.categories=catalog.categories;state.cart=readCart();renderMenu();renderSignature();saveCart();
 if(!state.browseOnly){
  try{state.cafe=await request('/api/cafe');if(Number.isFinite(Date.parse(state.cafe.serverTime)))recommendationClock={time:Date.parse(state.cafe.serverTime),started:performance.now()};$('#visit-address').textContent=state.cafe.address?state.cafe.address+', '+state.cafe.city:state.cafe.city+' · Street address coming soon.';$('#visit-hours').textContent=state.cafe.hours;
   if(state.cafe.email||state.cafe.phone){const contact=$('#visit-contact');contact.replaceChildren();for(const [value,prefix]of [[state.cafe.email,'mailto:'],[state.cafe.phone,'tel:']])if(value){const link=document.createElement('a');link.href=prefix+value;link.textContent=value;contact.append(link,document.createElement('br'));}}
   initializeDates();
  }catch{state.browseOnly=true;}
 }
 $('#connection-note').hidden=!state.browseOnly;
 if(state.browseOnly){
  $('#connection-note').textContent=cloudEnabled?'Supabase setup or connection is unavailable · Showing the sample menu. Ordering and forms are disabled until the database is ready.':'Sample menu view · Customise your bag here. Online checkout and forms need the connected Node.js server.';
  for(const form of [$('#order-form'),$('#reservation-form'),$('#newsletter-form'),$('#contact-form')]){const result=$('.form-result',form);result.className='form-result';result.textContent='Sample site: the ordering server is not connected. Requests cannot be submitted here.';$('button[type=submit]',form).disabled=true;}
 }
 renderRecommendations();
 if(cloudEnabled&&!state.browseOnly){
  const timer=setInterval(async()=>{if(document.hidden)return;try{const updated=await request('/api/menu');state.menu=updated.items;state.cart=readCart();renderMenu();renderSignature();renderRecommendations();saveCart();if($('#cart-dialog').open)renderCart();}catch{/* Keep the last menu; checkout still validates authoritative availability. */}},15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 }
}
boot();

function configureCloudCustomer(){
 document.body.dataset.live='true';$('#demo-checkout-panel').hidden=true;$('.demo-workflow').hidden=true;
 $('#order-form').hidden=false;
 $('.cart-payment').textContent='Orders saved in Supabase · No online payment collected';
 for(const form of [$('#order-form'),$('#reservation-form'),$('#contact-form'),$('#newsletter-form')]){
  const note=$('.form-note',form);if(note)note.textContent=form.id==='order-form'?'Guest checkout · No signup or password required. Your contact details are saved with your order. Pay on pickup or delivery; no online payment is collected.':'Sign in with a customer account to save this request. No email confirmation is connected.';
  if(account&&!account.guest){if(form.elements.email){form.elements.email.value=account.user.email;form.elements.email.readOnly=true;}if(form.elements.name)form.elements.name.value=account.user.user_metadata?.display_name||'';}
 }
 const privacy=$('#privacy-dialog .prose');
 privacy.innerHTML='<p>BitesBro is in Bangalore, with supplied hours of 10am–3pm and 6pm–11pm. Address, business contact details and a retention policy must be published before live service.</p><h3>Your account and orders</h3><p>You can place a guest order without a signup or password. With your consent, your contact details and order are stored in the restaurant database. Your private guest session lets you track only your own orders in this browser. Registered customers also have private order history. Authorised administrators manage operations; chefs receive preparation tickets without customer contact details or delivery addresses.</p><h3>Browser storage</h3><p>Your bag stores only dish identifiers, options and quantities. A private account or guest session is kept in this browser for access to your orders. Clearing site data or switching accounts removes access to guest history. Customer order records are not copied into the fictional demo store.</p><h3>Food photographs</h3><p>Menu photographs use a public Supabase storage bucket after administrator upload. Customer files are not accepted. Author, source and licence credits remain linked below.</p><h3>Service status</h3><p>Online payment, delivery dispatch and email notifications are not connected. Guest checkout sends no signup or confirmation email. Email signup and password recovery remain available for registered accounts once their email service is configured.</p>';
 cloudClient().then(client=>client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.reload();})).catch(()=>{});
}

function renderRecommendations(){
 if(!state.menu.length)return;
 const now=recommendationClock?new Date(recommendationClock.time+performance.now()-recommendationClock.started):new Date();
 const {context,items}=mealRecommendations(state.menu,{now,timezone:state.cafe?.timezone||'Asia/Kolkata',...(state.cafe?.openingPeriods?{openingPeriods:state.cafe.openingPeriods}:{}),diet:state.diet});
 $('#recommendations').dataset.period=context.key;
 $('#recommendation-eyebrow').textContent=context.label.toUpperCase()+' · PICKED FOR THIS PART OF YOUR DAY';
 $('#recommendation-title').innerHTML=escape(context.lead)+' <em>'+escape(context.emphasis)+'</em>';
 $('#recommendation-description').textContent=context.description;
 $('#recommendation-time').textContent=context.localTime;$('#recommendation-time').dateTime=context.iso;
 $('#recommendation-kitchen').textContent=context.kitchenStatus;$('#recommendation-kitchen').classList.toggle('is-open',context.isOpen);
 const nextKey=JSON.stringify([context.key,state.diet,items.map(item=>[item.id,item.price,item.image])]);
 if($('#recommendation-grid').dataset.renderKey===nextKey)return;
 $('#recommendation-grid').dataset.renderKey=nextKey;
 $('#recommendation-grid').innerHTML=items.length?items.map(item=>`<article class="recommendation-card"><img src="${escape(asset(item.image))}" alt="${escape(photoAlt(item))}" width="400" height="280" loading="lazy">${photoReference(item)}<div class="recommendation-card-body"><span class="diet-tag ${item.diet==='non-veg'?'non-veg':''}"><span aria-hidden="true"></span>${item.diet==='non-veg'?'NON-VEG':item.diet==='vegan'?'PLANT BASED':'VEGETARIAN'}</span><h3>${escape(item.name)}</h3><div><span class="menu-price">${money(item.price)}</span><button class="add-button" data-recommend-add="${escape(item.id)}" aria-label="Customise recommended ${escape(item.name)}">Make it mine <span aria-hidden="true">+</span></button></div></div></article>`).join(''):'<p class="recommendation-empty">No time-of-day picks match this diet right now. Explore the full menu below.</p>';
}
$('#recommendation-grid').addEventListener('click',event=>{const button=event.target.closest('[data-recommend-add]');if(button)openDish(button.dataset.recommendAdd);});
setInterval(()=>{if(!document.hidden)renderRecommendations();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderRecommendations();});

function configureDemo() {
 document.body.dataset.demoMode='true';
 $('#order-form').hidden=true;
 $('.cart-payment').textContent='Demo Mode — No real orders or payments.';
 $('#connection-note').hidden=false;
 $('#connection-note').textContent='Demo Mode — No real orders or payments. Menu edits and fictional tickets sync between tabs in this browser only.';
 $('#demo-checkout-note').textContent='Your fictional ticket will appear in the Kitchen Display and Administrator views. No personal details are collected.';
 for(const form of [$('#reservation-form'),$('#newsletter-form'),$('#contact-form')]) {
  $('button[type=submit]',form).disabled=true;
  $('.form-result',form).textContent='Demonstration mode: these connected forms are disabled. Leave demo mode to use the Node.js server.';
  const note=$('.form-note',form);if(note)note.textContent='Preview only in browser Demo Mode. No booking, message or signup is submitted here.';
 }
}
function refreshDemo() {
 const snapshot=demoStore.read(),previousCount=state.cart.reduce((sum,line)=>sum+line.quantity,0);
 state.menu=snapshot.menu.filter(item=>item.available&&!item.archived);state.categories=snapshot.categories;
 state.cart=readCart();renderMenu();renderSignature();renderRecommendations();saveCart();configureDemo();
 if($('#cart-dialog').open)renderCart();
 if($('#dish-dialog').open&&selectedDish){
  const item=state.menu.find(item=>item.id===selectedDish.id);
  if(!item){$('#dish-dialog').close();notify('That dish is unavailable in the demo menu.',true);}
  else{const choice=selectedLine();openDish(item.id);$('#dish-variant').value=choice.variant;$('#dish-spice').value=choice.spice;$$('#addon-choices input').forEach(input=>{input.checked=choice.addons.includes(input.value);});updateDishPrice();}
 }
 if($('#demo-checkout-dialog').open)updateDemoCheckout();
 if(state.cart.reduce((sum,line)=>sum+line.quantity,0)<previousCount)notify('Unavailable demo dishes were removed from your bag.',true);
}
async function activateDemo() {
 const config=await cloudConfig();if(config.enabled||!config.demoEnabled)throw new Error('Browser demo checkout is disabled. Use your customer account to order.');
 if(!demoStore){
  const connection=await connectDemoStore();
  demoStore=connection;demoMode=true;state.browseOnly=true;state.cafe=null;recommendationClock=undefined;
  const url=new URL(location.href);url.searchParams.set('demo','1');history.replaceState(null,'',url);
  mountRoleNavigation('customer',true);demoStore.subscribe(refreshDemo);
 }
 refreshDemo();
}
function updateDemoCheckout() {
 if(!demoStore)return;
 const snapshot=demoStore.read(),button=$('#place-demo-order');
 $('#demo-checkout-result').textContent='';
 try{
  const bill=priceDemoBag(snapshot,{items:state.cart,fulfilment:$('#demo-fulfilment').value});
  $('#demo-checkout-summary').innerHTML=bill.items.map(item=>`<div><span>${item.quantity} × ${escape(item.name)}</span><span>${money(item.unitPrice*item.quantity)}</span></div>`).join('')+`<div><span>Demo delivery fee</span><span>${money(bill.deliveryFee)}</span></div><div><span>Demonstration total</span><span id="demo-total">${money(bill.total)}</span></div><p class="demo-route-note">~${snapshot.settings.prepMinutes} minutes simulated preparation. No real pickup or delivery is arranged.</p>`;
  button.disabled=!snapshot.settings.acceptingOrders;
  if(!snapshot.settings.acceptingOrders)$('#demo-checkout-result').textContent='The demonstration kitchen is paused. Resume it in Administrator settings.';
 }catch(error){$('#demo-checkout-summary').textContent='';$('#demo-checkout-result').textContent=error.message;button.disabled=true;}
 updateTotals();
}
$('#open-demo-checkout').addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;
 try{await activateDemo();updateDemoCheckout();openDialog($('#demo-checkout-dialog'));}catch(error){notify(error.message,true);}finally{button.disabled=false;}
});
$('#demo-checkout-form').addEventListener('change',updateDemoCheckout);
$('#demo-checkout-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;if(form.dataset.submitting||!demoStore)return;
 form.dataset.submitting='true';$('#place-demo-order').disabled=true;$('#demo-checkout-result').textContent='';
 try{
  const order=await demoStore.dispatch({type:'order.place',items:state.cart.map(({id,quantity,variant,spice,addons})=>({id,quantity,variant,spice,addons})),fulfilment:$('#demo-fulfilment').value,instruction:$('#demo-instruction').value});
  state.cart=[];saveCart();$('#demo-checkout-dialog').close();$('#cart-checkout').hidden=true;
  location.assign(siteURL('orders/?order='+encodeURIComponent(order.reference)));
 }catch(error){$('#demo-checkout-result').textContent=error.message;$('#place-demo-order').disabled=false;}
 finally{delete form.dataset.submitting;}
});
$('#menu-grid').addEventListener('click',event=>{if(event.target.closest('#recover-customer-demo')){try{clearDamagedDemo();location.reload();}catch{notify('Enable browser site storage and reload to start the demo.',true);}}});
