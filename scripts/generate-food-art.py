"""Generate the original, intentionally illustrative food menu artwork (stdlib only)."""
from pathlib import Path
import random, math
random.seed(17)
root=Path(__file__).resolve().parent.parent/'public/assets/images/food'
root.mkdir(parents=True,exist_ok=True)
head='<defs><radialGradient id="gold"><stop stop-color="#f3ca76"/><stop offset=".65" stop-color="#d8953c"/><stop offset="1" stop-color="#a65b27"/></radialGradient><linearGradient id="brown" x2=".3" y2="1"><stop stop-color="#a75f2e"/><stop offset="1" stop-color="#573523"/></linearGradient><radialGradient id="white"><stop stop-color="#fffef7"/><stop offset="1" stop-color="#dfdbcc"/></radialGradient><filter id="shadow"><feGaussianBlur stdDeviation="10"/></filter></defs>'
plate='<ellipse cx="306" cy="298" rx="183" ry="104" fill="#453d2e" opacity=".13" filter="url(#shadow)"/><ellipse cx="300" cy="263" rx="192" ry="151" fill="url(#white)"/><ellipse cx="300" cy="263" rx="165" ry="127" fill="none" stroke="#d5cdb9" stroke-width="2"/>'
def bowl(x,y,r,color):return f'<circle cx="{x+3}" cy="{y+5}" r="{r}" fill="#4b4537" opacity=".1"/><circle cx="{x}" cy="{y}" r="{r}" fill="#c3c2b5" stroke="#eeeade" stroke-width="3"/><circle cx="{x}" cy="{y}" r="{r-6}" fill="{color}"/>'
def leaves(x,y):return f'<path d="M{x-18} {y+12}Q{x-12} {y-20} {x+7} {y-10}Q{x+20} {y+7} {x-18} {y+12}" fill="#54743e"/><path d="m{x-12} {y+7} 20-12" stroke="#89a65e" fill="none"/>'
def save(name,body,bg='#e9e2d2'):(root/(name+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 480">'+head+f'<path fill="{bg}" d="M0 0h600v480H0z"/>'+body+'</svg>')
sides=bowl(207,170,37,'#c78937')+bowl(300,153,32,'#efdfbe')+bowl(385,169,31,'#708b43')
dosa=plate+sides+'<g transform="rotate(-15 300 280)"><path d="M140 249q160-43 304-11l-4 101q-150 30-302 0Z" fill="url(#gold)" stroke="#b97c34" stroke-width="2"/><ellipse cx="140" cy="293" rx="22" ry="46" fill="#b66b2e"/><ellipse cx="140" cy="292" rx="15" ry="33" fill="#e8b653"/><path d="M160 255q125-27 265-9" stroke="#fbe4a4" fill="none" stroke-width="7" opacity=".6"/></g>'
save('dosa',dosa)
idlis=plate+sides
for x,y in [(224,274),(333,273),(291,347)]:idlis+=f'<ellipse cx="{x}" cy="{y+6}" rx="58" ry="39" fill="#c6c2b2"/><ellipse cx="{x}" cy="{y}" rx="58" ry="39" fill="url(#white)"/>'
save('idli',idlis+leaves(300,276),'#e2e7d8')
save('vada',plate+sides+''.join(f'<circle cx="{x}" cy="{y}" r="48" fill="url(#gold)"/><circle cx="{x}" cy="{y}" r="14" fill="#ddd7c6"/>' for x,y in [(230,290),(350,300)])+leaves(300,252))
# A generous rice bowl; grains are vector strokes rather than a photo.
rice='<ellipse cx="303" cy="316" rx="170" ry="112" fill="#766044" opacity=".1" filter="url(#shadow)"/><ellipse cx="300" cy="266" rx="174" ry="133" fill="#314d3b"/><ellipse cx="300" cy="253" rx="157" ry="117" fill="#e8bd72"/>'
for i in range(240):
 a=random.random()*math.tau;r=math.sqrt(random.random());x=300+144*r*math.cos(a);y=253+104*r*math.sin(a)
 rice+=f'<path d="m{x:.1f} {y:.1f} 7 3" stroke="{random.choice(["#f7e6b9","#e9a64c","#d28634","#f6d499"])}" stroke-width="3" stroke-linecap="round"/>'
for x,y in [(240,220),(345,283),(295,185)]:rice+=leaves(x,y)
save('rice',rice,'#e5e6d8');save('biryani',rice+bowl(451,345,35,'#f3e8d3'),'#edddcf')
meals=plate+'<ellipse cx="300" cy="264" rx="167" ry="124" fill="#567443"/><ellipse cx="300" cy="285" rx="67" ry="54" fill="url(#white)"/>'
for x,y,r,c in [(190,202,36,'#b76a32'),(270,170,33,'#d6a43d'),(350,181,33,'#699348'),(410,242,35,'#eee4c9'),(399,322,30,'#c99545'),(199,322,29,'#d49639')]:meals+=bowl(x,y,r,c)
save('meals',meals+leaves(303,277),'#e0e5d5')
curry=plate+bowl(300,265,116,'#bc6e39')
for x,y in [(252,232),(324,210),(345,285),(265,307),(295,270)]:curry+=f'<rect x="{x-13}" y="{y-13}" width="28" height="27" rx="5" fill="#edca88" transform="rotate(15 {x} {y})"/>'
save('curry',curry+leaves(302,255),'#eaded1')
noodles=plate+'<ellipse cx="300" cy="262" rx="147" ry="110" fill="#cfb77b"/>'
for i in range(70):
 x=random.randint(195,385);y=random.randint(190,328)
 noodles+=f'<path d="M{x} {y}q30-30 42 7t-30 17" fill="none" stroke="{random.choice(["#d0a251","#efcc7c","#b78038"])}" stroke-width="4" stroke-linecap="round"/>'
save('noodles',noodles+leaves(300,230),'#e5e5d8')
pizza=plate+'<circle cx="300" cy="260" r="116" fill="url(#gold)"/><circle cx="300" cy="260" r="101" fill="#bd6540"/><circle cx="300" cy="260" r="94" fill="#ebd28c"/>'
for x,y in [(248,220),(330,197),(355,275),(289,314),(231,282)]:pizza+=f'<circle cx="{x}" cy="{y}" r="18" fill="#bc4d36"/><circle cx="{x}" cy="{y}" r="10" fill="#e47b4e"/>'
save('pizza',pizza+leaves(289,235)+leaves(338,302),'#e6e5d7')
save('burger',plate+'<g transform="rotate(-8 300 265)"><path d="M188 248c0-130 224-130 224 0Z" fill="url(#gold)"/><path d="m187 255 224 0-20 22-32-10-25 14-35-14-36 14-31-12-26 8Z" fill="#608240"/><path d="m199 281 202 0-10 38-183 0Z" fill="url(#brown)"/><path d="m196 276 207 0-17 18-57-6-26 13-23-14-69 6Z" fill="#efc762"/><path d="M199 327h202q3 42-101 42t-101-42Z" fill="url(#gold)"/><g stroke="#fff0bc" stroke-width="3"><path d="m245 214 6 3m28-14 7 2m23 7 6-4m29 8 7 3m-80 12 6 3m65-4 6 2"/></g></g>','#e9dfd1')
save('naan',plate+'<path d="M175 282c-18-85 35-150 130-141 95 7 143 101 111 161-32 66-219 73-241-20Z" fill="url(#gold)"/><path d="M191 274c-9-70 35-124 111-117 74 5 120 80 97 134-26 46-188 56-208-17Z" fill="#edcf94"/>'+''.join(f'<ellipse cx="{x}" cy="{y}" rx="12" ry="7" fill="#a86e37" opacity=".6"/>' for x,y in [(250,209),(330,232),(270,294),(354,286),(227,253)])+leaves(295,240))
save('samosa',plate+'<path d="m176 321 82-160 80 160Z" fill="url(#gold)" stroke="#b67d39" stroke-width="3"/><path d="m284 335 67-159 83 149Z" fill="url(#gold)" stroke="#b67d39" stroke-width="3"/>'+bowl(190,358,27,'#698546'))
fries=plate
for i in range(13):
 x=209+i*13;y=150+random.randint(0,40)
 fries+=f'<rect x="{x}" y="{y}" width="12" height="130" rx="4" fill="{random.choice(["#eec66e","#e3b451","#f5d481"])}" transform="rotate({random.randint(-10,10)} 300 270)"/>'
save('fries',fries+'<path d="m205 252 195 0-27 120-141 0Z" fill="#bd4b2d"/><text x="300" y="330" text-anchor="middle" font-family="Georgia,serif" font-size="54" fill="#fff6de">B</text>')
save('sweet',plate+bowl(300,265,115,'#c69b6b')+''.join(f'<circle cx="{x}" cy="{y}" r="37" fill="url(#gold)"/><path d="m{x-10} {y-20} 18-7" stroke="#f6da98" stroke-width="3"/>' for x,y in [(255,240),(339,247),(294,316)]),'#e9dcda')
save('brownie',plate+'<path d="m212 235 133-33 65 61-131 35Z" fill="#75442e"/><path d="m212 235 67 63v67l-67-54Z" fill="#4e3024"/><path d="m279 298 131-35v67l-131 35Z" fill="#623e2b"/><circle cx="310" cy="226" r="47" fill="url(#white)"/><path d="M276 201q40-28 69 7m-42-22 17 78" stroke="#87512e" stroke-width="8" fill="none"/>')
save('filter-coffee',plate+'<g transform="rotate(-10 300 255)"><ellipse cx="300" cy="330" rx="83" ry="29" fill="#c6a05b"/><path d="m235 200 15 113q50 25 100 0l15-113Z" fill="#c7a46e" stroke="#f4dfae" stroke-width="3"/><ellipse cx="300" cy="200" rx="65" ry="25" fill="#82502f" stroke="#f3dba8" stroke-width="4"/><ellipse cx="300" cy="198" rx="49" ry="16" fill="#c8955d"/></g>','#e4dfd2')
save('cooler',plate+'<path d="m239 154 17 201q44 24 88 0l17-201Z" fill="#ddb564" stroke="#fff8e0" stroke-width="4"/><ellipse cx="300" cy="154" rx="61" ry="18" fill="#f2d9a0"/><path d="m325 102-28 220" stroke="#66864a" stroke-width="8"/><path d="m258 204 9 130" stroke="#fff8df" stroke-width="5" opacity=".6"/><circle cx="352" cy="165" r="30" fill="#aec773" stroke="#e2ebb2" stroke-width="4"/>','#e1e6d6')
print('Generated 15 original food illustrations.')
