import { readFileSync, writeFileSync } from 'node:fs';

const { photos } = JSON.parse(readFileSync('public/photo-credits.json', 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const rows = photos.map(photo => `<article class="credit-card" id="${escape(photo.id)}">
 <img src="${escape(photo.image)}" alt="${escape(photo.title)}" width="320" height="220" loading="lazy">
 <div><h2>${escape(photo.title)}</h2><p>By ${escape(photo.author)}</p>
 <p><a href="${escape(photo.source)}">Original source</a> · <a href="${escape(photo.licenseUrl)}">${escape(photo.license)}</a></p>
 <p class="credit-changes">${escape(photo.changes)} The photograph retains its source licence.</p>
 <a class="credit-mirror" href="${escape(photo.mirror)}">Exact downloaded file and revision</a></div></article>`).join('\n');

writeFileSync('public/photo-credits.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#f7f5ed">
<title>Food photograph credits — BitesBro</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css?v=customer-nav-1"><script type="module" src="./shared/customer-page.js?v=customer-flow-1"></script><link rel="stylesheet" href="./shared/customer-nav.css?v=customer-nav-1"><link rel="stylesheet" href="./shared/customer-flow.css?v=customer-flow-1"></head>
<body class="food-site credits-page"><a class="skip-link" href="#main">Skip to credits</a>
<header class="site-header" id="top"><div class="nav-wrap container"><a class="brand" href="./" aria-label="BitesBro home"><svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#plate"/></svg><span>BitesBro<span class="brand-tag">GOOD FOOD. GREAT MOODS.</span></span></a><nav id="main-nav" class="main-nav" aria-label="Main navigation"><a href="./#menu">Order food</a><a href="./orders/">My orders</a><a href="./#story">Our kitchen</a><a href="./#reserve">Book a table</a><a href="./#visit">Find us</a></nav><div class="nav-actions"><button class="bag-button" id="open-cart" aria-label="Open bag, 0 items"><svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#bag"/></svg><span class="bag-count" id="bag-count">0</span></button><div class="customer-account" id="customer-account"><a class="button button-small button-outline nav-signin" href="./auth/">Sign in</a></div><button class="mobile-toggle icon-button" id="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="Open navigation"><svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#menu"/></svg></button></div></div></header>
<main id="main" class="container"><p class="eyebrow">REAL PHOTOGRAPHS. CREDIT WHERE IT’S DUE.</p><h1>Behind the <em>good food.</em></h1>
<p class="credits-intro">These freely licensed stock photographs illustrate food and serving styles. They do not depict BitesBro’s own kitchen or guaranteed portions. Some dishes use a labelled cuisine reference photo. The food names, recipe notes and dietary labels describe the sample menu.</p>
<p class="credits-intro">CC0 and public-domain images can be reused without attribution requirements. Creative Commons BY and BY-SA photographs require credit; BY-SA adaptations must retain the applicable share-alike licence. Unsplash and Pexels images follow their linked free-use licences. Individual licences apply to the photographs, independently of the website code.</p>
<div class="credits-grid">${rows}</div><p class="credits-intro">All files are served locally. Author, source, licence, transformations and file provenance are also recorded in <a href="./photo-credits.json">the machine-readable credits</a>. Replace these with your own dish photographs when available.</p>
</main><footer class="container credits-footer"><a href="./">← Back to BitesBro</a></footer></body></html>\n`);
console.log(`Built credits for ${photos.length} food photographs.`);
