// @ts-nocheck
/* Kinara Style — clothing catalogue, design rules, price, measurements and garment drawings.
 * Ported from the Darzi project (Mohitbehl12/darzi-site) so the server (prices, orders) and the app
 * (design studio, preview) use exactly the same logic. Pure functions, no DOM or storage. */
const COLORS={White:'#F6F6F2',Ivory:'#EDE3CC',Champagne:'#E4D1AC',Butter:'#F0DC98',Beige:'#D6C3A0',Mustard:'#C8992F',Sky:'#A9C6E3',Blue:'#3E6DB0',Cobalt:'#2850A8',Indigo:'#2C3A6E',Navy:'#1E2A47',Midnight:'#1A2040',Mint:'#BCE2CD',Sage:'#A5B697',Olive:'#6A6B3B',Green:'#2E5C46',Emerald:'#1E7B57',Lavender:'#C6B6DE','Dusty Rose':'#C99199',Pink:'#E8B5BD',Terracotta:'#B9603F',Rust:'#A4492A',Maroon:'#6D1F2C',Wine:'#561B35',Chocolate:'#4A3022',Grey:'#9A9FA4',Charcoal:'#3A3E44',Black:'#1A1B1D'};
const FABRIC={'Cotton poplin':0,'Oxford cotton':300,'Linen':900,'Cotton-linen':500,'Washed cotton':100,'Seersucker':500,'Silk':1800,'Mashru silk':1300,'Supima jersey':400,'Organic cotton jersey':200,'Linen jersey':500,'Open-weave knit':700,'Cotton':0,'Mul cotton':200,'Khadi':600,'Chanderi':1200,'Kota Doria':700,'Cotton twill':300,'Ripstop':400,'Wool blend':2500,'Tropical wool':2000,'Stretch cotton':400,'Velvet':1600,'Tweed':2200,'Crepe':700,'Organza':1400,'Denim':600,'Brocade':1500};
const FITS=['Slim','Tailored','Regular','Relaxed','Oversized','Boxy'];
const FIT_IN={Slim:16,Tailored:11,Regular:6,Relaxed:0,Oversized:-8,Boxy:-3,'Wide-leg':0};
const EASE={Slim:3,Tailored:4,Regular:5.5,Relaxed:8,Oversized:12,Boxy:9,'Wide-leg':10};
const PATTERNS=['Solid','Pinstripe','Check','Madras check','Micro print','Floral','Ajrakh print','Chikankari','Zari border'];
const PAT_COST={Solid:0,'Zari border':1200,Chikankari:900,'Ajrakh print':500};
const SHIRT_COLLARS=['Spread','Cuban','Mandarin','Button-down','Cutaway'];
const SUITISH={collarLabel:'Lapel',collars:['Notch lapel','Peak lapel','Shawl lapel'],sleeves:['Full'],buttons:['Two-button','One-button','Double-breasted'],pockets:['Flap pockets','Jetted pockets','Patch pockets'],lengths:['Regular','Extended'],fab:['Wool blend','Tropical wool','Linen','Velvet','Tweed'],fits:['Slim','Tailored','Regular','Relaxed']};
const ETH_JACKET={kind:'top',collarLabel:'Collar',collars:['Mandarin'],buttons:['Visible placket','Contrast buttons','Hidden placket'],fab:['Silk','Mashru silk','Wool blend','Linen','Velvet','Brocade'],fits:['Slim','Tailored','Regular']};
const CATS={
 shirt:{name:'Shirts',one:'Shirt',base:2490,kind:'top',hem:268,days:7,blurb:'Office to weekend',fab:['Cotton poplin','Oxford cotton','Linen','Cotton-linen','Seersucker','Open-weave knit','Silk'],collarLabel:'Collar',collars:SHIRT_COLLARS,sleeves:['Full','Half'],buttons:['Visible placket','Hidden placket','Contrast buttons','Wooden buttons'],pockets:['None','One chest pocket','Two chest pockets'],lengths:['Regular','Longer back','Cropped','Extended']},
 tshirt:{name:'T-Shirts',one:'T-Shirt',base:1290,kind:'top',hem:255,days:5,blurb:'Everyday essentials',fab:['Supima jersey','Organic cotton jersey','Linen jersey','Open-weave knit'],collarLabel:'Neckline',collars:['Crew','Henley','V-neck','Polo'],sleeves:['Half','Full','Sleeveless'],buttons:['None','Two-button placket'],pockets:['None','One chest pocket'],lengths:['Regular','Cropped','Extended']},
 kurta:{name:'Kurtas',one:'Kurta',base:3290,kind:'top',hem:340,days:9,blurb:'Pathani, angrakha, short kurtas',fab:['Cotton','Mul cotton','Khadi','Linen','Chanderi','Kota Doria','Silk','Mashru silk'],collarLabel:'Collar',collars:['Mandarin','Pathani','Angrakha wrap','Round','V-neck'],sleeves:['Full','Three-quarter'],buttons:['Visible placket','Hidden placket','Contrast buttons','Wooden buttons'],pockets:['None','Side seam pockets'],lengths:['Knee length','Mid-calf','Short kurta','Asymmetric hem'],fits:['Slim','Tailored','Regular','Relaxed']},
 sherwani:Object.assign({name:'Sherwanis',one:'Sherwani',base:16990,hem:362,days:21,blurb:'For the wedding day',sleeves:['Full'],pockets:['None','Jetted pockets'],lengths:['Knee length','Mid-calf']},ETH_JACKET),
 bandhgala:Object.assign({name:'Bandhgalas',one:'Bandhgala',base:8990,hem:285,days:14,blurb:'Sharp Jodhpuri tailoring',sleeves:['Full'],pockets:['Jetted pockets','Flap pockets','None'],lengths:['Regular','Extended']},ETH_JACKET),
 bundi:Object.assign({name:'Bundis',one:'Bundi',base:3490,hem:252,days:8,blurb:'Nehru jacket over a kurta',sleeves:['Sleeveless'],pockets:['Jetted pockets','None','Two chest pockets'],lengths:['Regular','Extended']},ETH_JACKET),
 coord:{name:'Co-ord Sets',one:'Co-ord set',base:4790,kind:'top',hem:262,days:10,blurb:'Matching top and trousers',fab:['Linen','Cotton-linen','Seersucker','Kota Doria','Mul cotton','Open-weave knit','Silk'],collarLabel:'Collar',collars:['Cuban','Mandarin','Spread','Round'],sleeves:['Half','Full','Three-quarter','Sleeveless'],buttons:['Visible placket','Hidden placket','Wooden buttons'],pockets:['None','One chest pocket','Two chest pockets'],lengths:['Regular','Cropped','Extended']},
 trousers:{name:'Trousers & Shorts',one:'Trousers',base:2790,kind:'bottom',days:7,blurb:'Wide-leg, cargo, Bermudas',fab:['Cotton twill','Linen','Tropical wool','Wool blend','Stretch cotton','Ripstop','Seersucker'],collars:null,sleeves:null,buttonsLabel:'Front',buttons:['Flat front','Pleated front','Drawstring'],pockets:['Slant pockets','Jetted pockets','Cargo pockets','Side seam pockets'],lengths:['Full length','Ankle','Cropped','Bermuda'],fits:['Slim','Tailored','Regular','Relaxed','Wide-leg']},
 suit:Object.assign({name:'Suits',one:'Suit',base:14990,kind:'top',hem:282,days:18,blurb:'Two-piece, made to measure'},SUITISH),
 blazer:Object.assign({name:'Blazers',one:'Blazer',base:9990,kind:'top',hem:282,days:14,blurb:'Structured or unstructured'},SUITISH),
 jacket:{name:'Jackets & Overshirts',one:'Jacket',base:5990,kind:'top',hem:262,days:12,blurb:'Overshirts, shells, bombers',fab:['Washed cotton','Cotton twill','Ripstop','Denim','Wool blend'],collarLabel:'Collar',collars:['Spread','Stand collar','Mandarin','Cuban'],sleeves:['Full'],buttonsLabel:'Closure',buttons:['Visible placket','Front zip','Snap buttons'],pockets:['Two chest pockets','None','Flap pockets'],lengths:['Regular','Cropped','Extended']},
 dress:{name:'Dresses',one:'Dress',base:4490,kind:'dress',days:10,blurb:'Shirt dresses to midis',fab:['Crepe','Cotton','Linen','Silk','Organza'],collarLabel:'Neckline',collars:['Round','V-neck','Square','Sweetheart','Spread'],sleeves:['Sleeveless','Puff','Half','Three-quarter','Full'],buttonsLabel:'Closure',buttons:['Back zip','Front buttons'],pockets:['None','Side seam pockets'],lengths:['Knee','Midi','Maxi'],fits:['Slim','Tailored','Regular','Relaxed']},
 anarkali:{name:'Anarkalis',one:'Anarkali',base:6490,kind:'dress',days:14,blurb:'Flared, floor-sweeping',fab:['Silk','Chanderi','Mul cotton','Organza','Velvet'],collarLabel:'Neckline',collars:['Round','V-neck','Sweetheart','Angrakha wrap'],sleeves:['Full','Three-quarter','Puff','Sleeveless'],buttonsLabel:'Closure',buttons:['Back zip','Side zip'],pockets:['None','Side seam pockets'],lengths:['Calf','Ankle','Floor'],fits:['Tailored','Regular','Relaxed']},
 lehenga:{name:'Lehenga Sets',one:'Lehenga set',base:12990,kind:'dress',days:24,blurb:'Blouse and flared skirt',fab:['Silk','Organza','Velvet','Brocade','Chanderi'],collarLabel:'Neckline',collars:['Sweetheart','Square','Boat','V-neck','Round'],sleeves:['Puff','Half','Sleeveless','Three-quarter'],buttonsLabel:'Closure',buttons:['Back hooks','Back zip'],pockets:['None','Side seam pockets'],lengths:['Floor','Ankle'],fits:['Slim','Tailored','Regular']},
 blouse:{name:'Saree Blouses',one:'Saree Blouse',base:1890,kind:'top',hem:165,days:6,blurb:'Fitted to the inch',fab:['Silk','Cotton','Velvet','Brocade','Organza'],collarLabel:'Neckline',collars:['Round','Square','Boat','V-neck','Sweetheart'],sleeves:['Half','Puff','Sleeveless','Three-quarter'],buttonsLabel:'Closure',buttons:['Back hooks','Front hooks','Back zip'],pockets:['None'],lengths:['Regular','Cropped','Extended'],fits:['Slim','Tailored','Regular']},
 custom:{name:'Custom Designs',one:'Custom design',base:3990,kind:'top',hem:270,days:14,blurb:'Start from your idea',fab:Object.keys(FABRIC),collarLabel:'Collar',collars:['Spread','Cuban','Mandarin','Round','V-neck','Notch lapel'],sleeves:['Full','Three-quarter','Half','Puff','Sleeveless'],buttons:['Visible placket','Hidden placket','Wooden buttons'],pockets:['None','One chest pocket','Two chest pockets'],lengths:['Regular','Longer back','Cropped','Extended','Asymmetric hem']}
};
const fitsOf=cat=>CATS[cat].fits||FITS;
const STATUSES=['Design Approved','Measurement Confirmed','Fabric Selected','Production Started','Quality Check','Shipped','Delivered'];
const MEAS=[
 ['height','Height','Body',1,'High'],['shoulder','Shoulder width','Upper body',.262,'High'],['chest','Chest','Upper body',.578,'High'],['upperChest','Upper chest','Upper body',.566,'Medium'],
 ['waist','Waist','Upper body',.497,'Medium'],['abdomen','Abdomen','Upper body',.52,'Medium'],['neck','Neck','Upper body',.221,'Low'],['shirtLen','Shirt length','Upper body',.43,'High'],
 ['arm','Arm length (sleeve)','Arms',.366,'High'],['bicep','Bicep','Arms',.19,'Medium'],['wrist','Wrist','Arms',.1,'Low'],
 ['hip','Hip','Lower body',.56,'High'],['trouserWaist','Trouser waist','Lower body',.48,'Medium'],['thigh','Thigh','Lower body',.32,'Medium'],['knee','Knee','Lower body',.215,'Medium'],['calf','Calf','Lower body',.21,'Low'],['inseam','Inseam','Lower body',.45,'High'],['outseam','Outseam','Lower body',.6,'High']];

/* ---------------- helpers ---------------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const fmtDate=d=>d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shade(hex,a){const n=parseInt(hex.slice(1),16);const f=v=>Math.max(0,Math.min(255,Math.round(a<0?v*(1+a):v+(255-v)*a)));return'#'+[n>>16,n>>8&255,n&255].map(v=>f(v).toString(16).padStart(2,'0')).join('')}
function lum(hex){const n=parseInt(hex.slice(1),16);return(.2126*(n>>16)+.7152*(n>>8&255)+.0722*(n&255))/255}
const cm=v=>(v*2.54).toFixed(1);

function defaultSpec(cat){const c=CATS[cat];return normalize({category:cat,fabric:c.fab[0],color:{suit:'Navy',blazer:'Navy',bandhgala:'Midnight',sherwani:'Ivory',bundi:'Rust',trousers:'Beige',lehenga:'Dusty Rose',anarkali:'Emerald',coord:'Sage'}[cat]||'White',collar:c.collars?c.collars[0]:null,sleeves:c.sleeves?c.sleeves[0]:null,buttons:c.buttons[0],pockets:c.pockets[0],fit:'Tailored',length:c.lengths[0],pattern:'Solid'})}
function normalize(s){const c=CATS[s.category];const pick=(v,list)=>list?(list.includes(v)?v:list[0]):null;
 return {...s,fabric:pick(s.fabric,c.fab),collar:pick(s.collar,c.collars),sleeves:pick(s.sleeves,c.sleeves),buttons:pick(s.buttons,c.buttons),pockets:pick(s.pockets,c.pockets),length:pick(s.length,c.lengths),fit:fitsOf(s.category).includes(s.fit)?s.fit:(fitsOf(s.category).includes('Tailored')?'Tailored':fitsOf(s.category)[0]),pattern:PATTERNS.includes(s.pattern)?s.pattern:'Solid',color:COLORS[s.color]?s.color:'White'}}
function price(s){const c=CATS[s.category];let p=c.base+(FABRIC[s.fabric]||0);if(s.buttons==='Double-breasted')p+=1500;if(s.buttons==='Contrast buttons'||s.buttons==='Wooden buttons')p+=200;if(['Extended','Mid-calf','Maxi','Floor','Asymmetric hem'].includes(s.length))p+=300;if(s.pockets==='Cargo pockets')p+=300;if(s.length==='Bermuda')p-=600;p+=PAT_COST[s.pattern]??250;return p}
function title(s){const c=CATS[s.category];return `${s.color} ${s.fabric.toLowerCase()} ${c.one.toLowerCase()}`}
function describe(s){const c=CATS[s.category];const bits=[s.fit+' fit',s.color.toLowerCase(),s.fabric.toLowerCase(),c.one.toLowerCase()];let t=bits.join(' ');const ex=[];if(s.collar)ex.push(s.collar.toLowerCase()+(c.collarLabel==='Neckline'?' neckline':c.collarLabel==='Lapel'?'':' collar'));if(s.sleeves)ex.push(s.sleeves.toLowerCase()+' sleeves');if(s.buttons&&s.buttons!=='None')ex.push(s.buttons.toLowerCase());if(s.pattern!=='Solid')ex.push(s.pattern.toLowerCase());if(s.length&&!/Regular|Full length/.test(s.length))ex.push(s.length.toLowerCase());return t+(ex.length?' with '+ex.join(', '):'')}

function genM(h,seed){const r=rng(seed);const m={};MEAS.forEach(([k,,,ratio,conf])=>{let v=k==='height'?h:h*ratio*(1+(r()-.5)*.045);let c=conf;if(c==='High'&&k!=='height'&&r()<.15)c='Medium';m[k]={v:Math.round(v*10)/10,c,u:c!=='High'}});return m}

/* ---------------- Fit Lock: how a profile reaches 100% ---------------- */
function uncertain(m){return MEAS.filter(([k])=>m[k].u||m[k].c==='Medium'||m[k].c==='Low')}
function checks(m){const g=k=>m[k].v;return[
 ['Outseam is longer than inseam',g('outseam')>g('inseam')+6],
 ['Upper chest is close to chest',Math.abs(g('upperChest')-g('chest'))<=3],
 ['Trouser waist matches body waist',Math.abs(g('trouserWaist')-g('waist'))<=3],
 ['Shoulder is in proportion to chest',g('shoulder')/g('chest')>=.38&&g('shoulder')/g('chest')<=.52],
 ['Neck is in proportion to chest',g('neck')/g('chest')>=.33&&g('neck')/g('chest')<=.43],
 ['Wrist, knee and calf are in proportion',g('wrist')<g('bicep')&&g('knee')<g('thigh')&&g('calf')<g('thigh')],
 ['Arm length is in proportion to height',g('arm')/g('height')>=.32&&g('arm')/g('height')<=.40]]}
const REF=[['chest','Chest (armpit to armpit × 2)'],['shoulder','Shoulder (seam to seam)'],['sleeve','Sleeve (shoulder seam to cuff)'],['length','Length (collar seam to hem)']];
function refIssues(p){const r=p.ref,m=p.m;if(!r)return null;const n=k=>parseFloat(r[k]);if(REF.some(([k])=>!(n(k)>0)))return null;
 const out=[];const e=n('chest')-m.chest.v;
 if(e<1||e>10)out.push({k:'chest',msg:`Your shirt is ${n('chest')} in at the chest, which leaves ${e.toFixed(1)} in over your scanned chest of ${m.chest.v} in. A shirt that fits usually has 1–10 in.`,fix:+(n('chest')-EASE[p.fit]).toFixed(1)});
 if(Math.abs(n('shoulder')-.3-m.shoulder.v)>1)out.push({k:'shoulder',msg:`Shirt shoulder ${n('shoulder')} in vs scanned ${m.shoulder.v} in.`,fix:+(n('shoulder')-.3).toFixed(1)});
 if(Math.abs(n('sleeve')-m.arm.v)>1)out.push({k:'arm',msg:`Shirt sleeve ${n('sleeve')} in vs scanned arm length ${m.arm.v} in.`,fix:n('sleeve')});
 if(Math.abs(n('length')-m.shirtLen.v)>2)out.push({k:'shirtLen',msg:`Shirt length ${n('length')} in vs scanned ${m.shirtLen.v} in.`,fix:n('length')});
 return out}
function fitScore(p){
 if(!p||!p.m)return{score:0,gates:[['Body scan complete',0,'Not captured yet']],ri:null,ch:[],unc:[]};
 const unc=uncertain(p.m),ver=unc.filter(([k])=>['Verified','Edited'].includes(p.m[k].c)).length,g2=unc.length?ver/unc.length:1;
 const ch=checks(p.m),pass=ch.filter(c=>c[1]).length,g3=pass/ch.length;
 const ri=refIssues(p),g4=ri===null?0:ri.length?.5:1;
 const gates=[['Body scan complete',1,'18 measurements captured'],['Uncertain values verified',g2,`${ver} of ${unc.length} confirmed with a tape`],['Consistency checks',g3,`${pass} of ${ch.length} pass`],['Cross-checked with a shirt that fits',g4,ri===null?'Not added yet':ri.length?`${ri.length} mismatch${ri.length>1?'es':''} to resolve`:'Matches your scan']];
 return{score:Math.floor(gates.reduce((s,g)=>s+g[1]*25,0)+1e-9),gates,ri,ch,unc}}
const locked=p=>fitScore(p).score===100;
const GIRTHS=['neck','upperChest','chest','waist','abdomen','trouserWaist','hip','thigh','knee','calf'];
const TAPE={neck:'Around the base of the neck where a collar sits, one finger inside the tape.',wrist:'Just above the wrist bone. Add your watch side if you wear one.',calf:'Around the widest part of the calf, standing.',waist:'At the navel, relaxed. Don’t hold your breath.',abdomen:'Around the fullest part of the stomach.',upperChest:'High under the armpits, above the chest.',bicep:'Around the fullest part of the upper arm, arm relaxed.',trouserWaist:'Where you wear your trousers, usually 1–2 in below the navel.',thigh:'Around the fullest part of the thigh, just below the crotch.',knee:'Around the middle of the knee, standing straight.',chest:'Around the fullest part of the chest, under the arms.',shoulder:'Across the back, from shoulder bone to shoulder bone.',hip:'Around the fullest part of the seat, feet together.',arm:'From the shoulder bone, over a slightly bent elbow, to the wrist.',shirtLen:'From the base of the collar at the back down to where you want the hem.',inseam:'From the crotch down the inside leg to the floor, barefoot.',outseam:'From the waistband down the outside leg to the floor.'};

/* ---------------- garment renderer ---------------- */
let GID=0;
const GOLD='#C9A227';
function patDef(id,p,col,dt){
 const lt=shade(col,.55);
 if(p==='Pinstripe')return`<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${col}"/><path d="M4.5 0V9" stroke="${dt}" stroke-width=".8"/></pattern>`;
 if(p==='Check')return`<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${col}"/><rect width="18" height="5" fill="${dt}" opacity=".35"/><rect width="5" height="18" fill="${dt}" opacity=".35"/></pattern>`;
 if(p==='Madras check')return`<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${col}"/><rect y="3" width="22" height="6" fill="#C2552E" opacity=".38"/><rect x="12" width="5" height="22" fill="#2F5D8A" opacity=".38"/><path d="M0 15H22M6 0V22" stroke="${GOLD}" stroke-width=".9" opacity=".8"/></pattern>`;
 if(p==='Micro print')return`<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${col}"/><circle cx="3" cy="3" r="1.3" fill="${dt}"/><circle cx="9" cy="9" r="1.3" fill="${dt}"/></pattern>`;
 if(p==='Floral')return`<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${col}"/><g fill="${dt}" opacity=".85">${[0,72,144,216,288].map(r=>`<ellipse cx="7" cy="4.2" rx="1.6" ry="2.6" transform="rotate(${r} 7 7)"/>`).join('')}</g><circle cx="7" cy="7" r="1.3" fill="${GOLD}"/><circle cx="19" cy="19" r="1.4" fill="${dt}"/><path d="M17 17q2-3 5-2" stroke="${dt}" stroke-width=".7" fill="none"/></pattern>`;
 if(p==='Ajrakh print')return`<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${col}"/><path d="M8 1 15 8 8 15 1 8Z" fill="none" stroke="${dt}" stroke-width="1.2"/><circle cx="8" cy="8" r="2" fill="${lum(col)<.4?'#C2552E':'#2C3A6E'}"/><circle cx="0" cy="0" r="1.4" fill="${dt}"/><circle cx="16" cy="16" r="1.4" fill="${dt}"/></pattern>`;
 if(p==='Chikankari')return`<pattern id="${id}" width="15" height="15" patternUnits="userSpaceOnUse"><rect width="15" height="15" fill="${col}"/><g fill="${lt}" opacity=".95">${[0,90,180,270].map(r=>`<ellipse cx="7.5" cy="5" rx="1" ry="2" transform="rotate(${r} 7.5 7.5)"/>`).join('')}</g><circle cx="1" cy="14" r=".8" fill="${lt}"/></pattern>`;
 return'';
}
function mannequin(kind){
 let s=`<circle class="mq" cx="150" cy="40" r="17"/><rect class="mq" x="143" y="50" width="14" height="24" rx="5"/>`;
 s+=`<path class="mqs" stroke-width="13" stroke-linecap="round" d="M93,88 L70,260 M207,88 L230,260"/>`;
 if(kind==='bottom')s+=`<path class="mq" d="M96,82 Q150,70 204,82 L198,176 L102,176 Z"/>`;
 else s+=`<rect class="mq" x="120" y="250" width="26" height="142" rx="12"/><rect class="mq" x="154" y="250" width="26" height="142" rx="12"/>`;
 return s;
}
function sleeve(L,E,fill,mirror,puff){
 const mx=x=>mirror?300-x:x;
 if(puff)return`<path d="M${mx(L)},80 Q${mx(L-36)},94 ${mx(L-24)},134 L${mx(L-4)},138 L${mx(L+4)},120 Z" fill="${fill}"/><path d="M${mx(L-23)},128 L${mx(L-5)},132" fill="none"/>`;
 const ox=L-8-(E-82)*.12,ix=ox+20;const p=[[L,82],[ox,E],[ix,E+3],[L+4,122]];
 let s=`<path d="M${p.map(([x,y])=>mx(x)+','+y).join(' L')} Z" fill="${fill}"/>`;
 if(E>190)s+=`<path d="M${mx(ox+1.5)},${E-12} L${mx(ix+1.5)},${E-9}" fill="none"/>`;
 return s;
}
function neckSeg(col,lap){
 if(lap)return'L150,152 L128,70';
 if(col==='V-neck'||col==='Angrakha wrap')return'L150,106 L128,70';
 if(col==='Cuban')return'L150,110 L128,70';
 if(col==='Round'||col==='Crew'||col==='Henley')return'Q150,94 128,70';
 if(col==='Boat')return'Q150,80 128,70';
 if(col==='Sweetheart')return'Q163,98 150,90 Q137,98 128,70';
 if(col==='Square')return'L168,94 L132,94 L128,70';
 return'Q150,86 128,70';
}
function drawTop(s,back,fill,col,o={}){
 const c=CATS[s.category],k=s.category;
 const sl=s.sleeves==='Sleeveless',L=sl?100:s.fit==='Oversized'?83:90,R=300-L,fi=FIT_IN[s.fit]??8;
 const off={'Cropped':-38,'Extended':28,'Mid-calf':32,'Short kurta':-62,'Asymmetric hem':-14}[s.length]||0;
 const H=o.hem||Math.max(140,c.hem+off+(s.fit==='Boxy'?-16:0));
 const lap=!!(s.collar&&/lapel/.test(s.collar));
 const longEth=k==='kurta'||k==='sherwani',jersey=k==='tshirt';
 const curve=o.hem?2:(k==='shirt'||k==='custom')&&!lap&&s.fit!=='Boxy'?9:3;
 const Hb=back&&s.length==='Longer back'?H+14:H;
 const asym=s.length==='Asymmetric hem',HL=asym?(back?Hb+36:Hb):Hb,HR=asym?(back?Hb:Hb+36):Hb;
 const hx=longEth?L-10:L+fi*.55,hxr=300-hx,wy=Math.min(195,(120+Math.max(HL,HR))/2+12);
 const dark=lum(COLORS[s.color])<.4,C=s.collar||'';
 const zari=s.pattern==='Zari border';
 let out='';
 if(!sl&&s.sleeves){const puff=s.sleeves==='Puff';const E={Full:256,'Three-quarter':205,Half:150}[s.sleeves]||256;out+=sleeve(L,E,fill,false,puff)+sleeve(L,E,fill,true,puff)}
 if(lap&&!back)out+=`<path d="M128,70 L172,70 L150,154 Z" fill="${dark?'#F4F4F0':'#FFFFFF'}"/>`;
 out+=`<path d="M128,70 L${L},82 L${L+4},120 Q${L+fi},${wy} ${hx},${HL} Q150,${(HL+HR)/2+curve} ${hxr},${HR} Q${R-fi},${wy} ${R-4},120 L${R},82 L172,70 ${back?'Q150,76 128,70':neckSeg(C,lap)} Z" fill="${fill}"/>`;
 if(longEth&&!asym)out+=`<path d="M${hx+2},${Hb} L${hx+7},${Hb-42} M${hxr-2},${Hb} L${hxr-7},${Hb-42}" fill="none"/>`;
 if(zari){out+=`<path d="M${hx+3},${HL-7} Q150,${(HL+HR)/2+curve-7} ${hxr-3},${HR-7}" fill="none" stroke="${GOLD}" stroke-width="5"/>`;
  if(!back&&!lap&&C!=='Angrakha wrap')out+=`<path d="M150,84 L150,${Math.min(HL,HR)-12}" fill="none" stroke="${GOLD}" stroke-width="3.5" opacity=".85"/>`;
  if(!sl&&s.sleeves==='Full')out+=`<path d="M64,244 L84,247 M236,244 L216,247" fill="none" stroke="${GOLD}" stroke-width="4"/>`}
 if(back){
  if(!jersey&&!lap&&!o.hem&&!['blouse','bundi','sherwani','bandhgala'].includes(k))out+=`<path d="M${L+3},104 Q150,112 ${R-3},104" fill="none"/>`;
  if(lap)out+=`<path d="M150,${H-56} L150,${H+2}" fill="none"/>`;
  if(/Back/.test(s.buttons||''))out+=`<path d="M150,78 L150,${Math.min(H,200)-6}" fill="none" stroke-dasharray="${/hooks/.test(s.buttons)?'2 5':'0'}"/>`;
 }else{
  const bcol=s.buttons==='Contrast buttons'?GOLD:s.buttons==='Wooden buttons'?'#8A5A2B':shade(COLORS[s.color],dark?.45:-.45);
  if(lap){
   out+=`<path d="M150,154 L150,${H-10} Q150,${H} 162,${H+1}" fill="none"/>`;
   const pts=s.buttons==='One-button'?[[154,206]]:s.buttons==='Double-breasted'?[[138,186],[162,186],[138,214],[162,214]]:[[154,196],[154,224]];
   pts.forEach(([x,y])=>out+=`<circle cx="${x}" cy="${y}" r="3.2" fill="${bcol}"/>`);
  }else if(C==='Angrakha wrap'){
   out+=`<path d="M129,72 Q146,150 182,${Math.min(210,H-30)}" fill="none" stroke-width="1.8"/><circle cx="183" cy="${Math.min(210,H-30)+4}" r="2.2" fill="${GOLD}"/><circle cx="187" cy="${Math.min(210,H-30)+10}" r="2.2" fill="${GOLD}"/>`;
  }else{
   const top=C==='V-neck'?106:C==='Cuban'?110:/Round|Crew|Henley/.test(C)?94:86;
   let end=k==='kurta'?Math.min(H-40,170):k==='coord'&&s.fit==='Boxy'?H-4:H-4;
   if(s.buttons==='Two-button placket'||C==='Polo'||C==='Henley')end=128;
   if(C==='Pathani')end=150;
   const btn=/Visible|Contrast|Wooden|Snap|Front buttons|Two-button placket/.test(s.buttons||'')||C==='Polo'||C==='Henley';
   if(s.buttons==='Front zip'){out+=`<path d="M150,${top} L150,${H-2}" fill="none"/><rect x="147" y="${top+4}" width="6" height="11" rx="2" fill="${bcol}"/>`}
   else if(btn||s.buttons==='Hidden placket'){
    out+=`<path d="M146,${top+2} L146,${end} M154,${top+2} L154,${end}" fill="none" opacity=".75"/>`;
    if(btn)for(let y=top+12;y<end-4;y+=(longEth||k==='bandhgala'?20:24))out+=`<circle cx="150" cy="${y}" r="2.5" fill="${bcol}" stroke="none"/>`;
   }
  }
  const p=s.pockets||'';
  if(/chest/.test(p)){out+=`<path d="M165,112 L187,112 L187,136 Q176,140 165,136 Z" fill="none"/>`;if(/Two/.test(p))out+=`<path d="M135,112 L113,112 L113,136 Q124,140 135,136 Z" fill="none"/>`}
  if(lap||k==='bandhgala'||k==='bundi')out+=`<path d="M164,131 L185,127" fill="none" stroke-width="2"/>`;
  if(/Flap/.test(p))out+=`<path d="M104,${H-46} L136,${H-48} L136,${H-37} L104,${H-35} Z M196,${H-46} L164,${H-48} L164,${H-37} L196,${H-35} Z" fill="${fill}"/>`;
  if(/Jetted/.test(p))out+=`<path d="M106,${H-44} L136,${H-46} M194,${H-44} L164,${H-46}" fill="none" stroke-width="2"/>`;
  if(/Patch/.test(p))out+=`<path d="M104,${H-50} L136,${H-52} L137,${H-18} L105,${H-16} Z M196,${H-50} L164,${H-52} L163,${H-18} L195,${H-16} Z" fill="none"/>`;
 }
 if(lap){
  if(back)out+=`<path d="M128,70 Q150,63 172,70 L172,80 Q150,75 128,80 Z" fill="${fill}"/>`;
  else{const left=C==='Peak lapel'?'M128,70 L150,152 L116,104 L104,84 L122,94 Z':C==='Shawl lapel'?'M128,70 L150,152 Q110,116 128,70 Z':'M128,70 L150,152 L116,104 L123,96 L114,90 Z';
   out+=`<path d="${left}" fill="${fill}"/><path d="${left}" fill="${fill}" transform="translate(300,0) scale(-1,1)"/>`}
 }else if(C==='Cuban'){
  if(back)out+=`<path d="M128,70 Q150,66 172,70 L172,77 Q150,74 128,77 Z" fill="${fill}"/>`;
  else{const l='M128,70 L148,108 L120,98 L115,82 Z';out+=`<path d="${l}" fill="${fill}"/><path d="${l}" fill="${fill}" transform="translate(300,0) scale(-1,1)"/>`}
 }else if(/Spread|Cutaway|Button-down|Polo|Pathani/.test(C)){
  if(back)out+=`<path d="M128,70 Q150,64 172,70 L172,80 Q150,76 128,80 Z" fill="${fill}"/>`;
  else{const tip=C==='Cutaway'?'117,82':C==='Button-down'?'131,99':C==='Polo'||C==='Pathani'?'127,93':'121,91';
   out+=`<path d="M128,70 Q150,62 172,70 L172,74 Q150,68 128,74 Z" fill="${fill}"/><path d="M150,87 L127,68 L${tip} Z" fill="${fill}"/><path d="M150,87 L127,68 L${tip} Z" fill="${fill}" transform="translate(300,0) scale(-1,1)"/>`;
   if(C==='Button-down')out+=`<circle cx="133" cy="94" r="1.6" fill="${shade(COLORS[s.color],dark?.45:-.45)}"/><circle cx="167" cy="94" r="1.6" fill="${shade(COLORS[s.color],dark?.45:-.45)}"/>`}
 }else if(C==='Mandarin'||C==='Stand collar'){
  const t=C==='Stand collar'?58:63;
  out+=`<path d="M128,70 Q150,${t} 172,70 L171,${t+16} Q150,${back?t+12:t+22} 129,${t+16} Z" fill="${fill}"/>`;
  if(zari)out+=`<path d="M129,${t+14} Q150,${back?t+10:t+20} 171,${t+14}" fill="none" stroke="${GOLD}" stroke-width="2.5"/>`;
 }else if(!back&&/Round|Crew|Henley/.test(C))out+=`<path d="M132,74 Q150,96 168,74" fill="none" opacity=".7"/>`;
 else if(!back&&C==='V-neck')out+=`<path d="M133,74 L150,101 L167,74" fill="none" opacity=".7"/>`;
 return out;
}
function drawBottom(s,back,fill){
 const fw={Slim:17,Tailored:19,Regular:22,Relaxed:26,'Wide-leg':32}[s.fit]||20;
 const E={'Full length':388,'Ankle':372,'Cropped':345,'Bermuda':292}[s.length]||388;
 let o=`<path d="M106,168 L194,168 L198,218 L${154+2*fw},${E} L154,${E} L150,232 L146,${E} L${146-2*fw},${E} L102,218 Z" fill="${fill}"/>`;
 const ds=s.buttons==='Drawstring';
 o+=`<path d="M106,168 L194,168 L194.6,179 L105.4,179 Z" fill="${fill}"/>${ds?'':'<path d="M120,167 L120,180 M180,167 L180,180" fill="none"/>'}`;
 if(back){o+=`<path d="M150,179 L150,232" fill="none"/>`;if(!/Side|Cargo/.test(s.pockets))o+=`<path d="M114,196 L136,196 M164,196 L186,196" fill="none" stroke-width="2"/>`}
 else{o+=ds?`<path d="M146,180 Q140,196 136,200 M154,180 Q160,196 164,200" fill="none"/><circle cx="150" cy="178" r="2.6" fill="none"/>`:`<path d="M150,179 L150,222 Q156,222 158,212" fill="none"/>`;
  o+=`<path d="M125,182 L${146-fw},${E-2} M175,182 L${154+fw},${E-2}" fill="none" opacity=".45"/>`;
  if(s.buttons==='Pleated front')o+=`<path d="M131,180 L132,210 M138,180 L139,200 M169,180 L168,210 M162,180 L161,200" fill="none"/>`;
  if(s.pockets==='Slant pockets'||s.pockets==='Cargo pockets')o+=`<path d="M110,181 L121,207 M190,181 L179,207" fill="none"/>`;
  if(s.pockets==='Jetted pockets')o+=`<path d="M108,190 L128,190 M172,190 L192,190" fill="none" stroke-width="2"/>`}
 if(s.pockets==='Cargo pockets'&&E>290){const y=Math.min(252,E-44);o+=`<path d="M${104-fw*.3},${y} L${128-fw*.3},${y} L${129-fw*.3},${y+32} L${105-fw*.3},${y+32} Z M${196+fw*.3},${y} L${172+fw*.3},${y} L${171+fw*.3},${y+32} L${195+fw*.3},${y+32} Z" fill="${fill}"/><path d="M${104-fw*.3},${y+7} L${128-fw*.3},${y+7} M${196+fw*.3},${y+7} L${172+fw*.3},${y+7}" fill="none"/>`}
 return o;
}
function drawDress(s,back,fill,col){
 const k=s.category,leh=k==='lehenga',an=k==='anarkali';
 const E={Knee:318,Midi:352,Maxi:388,Calf:356,Ankle:384,Floor:392}[s.length]||330,fi=FIT_IN[s.fit]??8;
 const fl=({Slim:14,Tailored:22,Regular:30,Relaxed:40}[s.fit]||24)+(an?28:leh?44:0);
 const wy=leh?204:an?176:186,L=90,R=210;
 let o='';
 if(leh)o+=`<rect class="mq" x="${L+fi+3}" y="150" width="${R-L-2*fi-6}" height="60" rx="6"/>`;
 o+=`<path d="M${L+fi+2},${wy} L${R-fi-2},${wy} L${R+fl-10},${E} Q150,${E+8} ${L-fl+10},${E} Z" fill="${fill}"/>`;
 if(an||leh)o+=`<path d="M${120},${wy+10} L${104-fl*.5},${E-2} M150,${wy+10} L150,${E+6} M${180},${wy+10} L${196+fl*.5},${E-2}" fill="none" opacity=".35"/>`;
 if(s.pattern==='Zari border')o+=`<path d="M${L-fl+16},${E-9} Q150,${E-1} ${R+fl-16},${E-9}" fill="none" stroke="${GOLD}" stroke-width="6"/>`;
 o+=drawTop({...s,pattern:s.pattern==='Zari border'&&!leh?'Zari border':s.pattern},back,fill,col,{hem:leh?156:wy+6});
 o+=`<path d="M${L+fi+1},${(leh?156:wy+4)} Q150,${(leh?160:wy+8)} ${R-fi-1},${(leh?156:wy+4)}" fill="none"/>`;
 return o;
}
function garmentSVG(s,view='front',cls=''){
 const id='g'+(++GID),c=CATS[s.category]||CATS.shirt,col=COLORS[s.color]||'#ccc',dk=lum(col)<.4;
 const st=shade(col,dk?.42:-.4),dt=shade(col,dk?.22:-.17),back=view==='back';
 const solid=s.pattern==='Solid'||s.pattern==='Zari border';
 const fill=solid?col:`url(#${id})`;
 let o=mannequin(c.kind);
 const k=s.category;
 if(c.kind==='bottom')o+=drawBottom(s,back,fill);
 else if(c.kind==='dress')o+=drawDress(s,back,fill,col);
 else{
  if(k==='suit')o+=drawBottom({...s,length:'Full length',buttons:'Flat front',pockets:'Slant pockets'},back,fill);
  if(k==='coord')o+=drawBottom({...s,length:'Full length',fit:['Oversized','Boxy','Relaxed'].includes(s.fit)?'Wide-leg':'Tailored',buttons:s.fit==='Relaxed'||s.fit==='Oversized'?'Drawstring':'Flat front',pockets:'Slant pockets'},back,fill);
  if(k==='sherwani'||k==='bandhgala'){const iv=lum(col)>.7?'#DCCFB2':'#EDE3CC';o+=`<g stroke="${shade(iv,-.35)}">${drawBottom({...s,fit:'Slim',length:'Full length',buttons:'Flat front',pockets:'Side seam pockets'},back,iv)}</g>`}
  if(k==='bundi'){const ik=normalize({category:'kurta',color:lum(col)>.65?'Sage':'Ivory',fabric:'Linen',collar:'Mandarin',sleeves:'Full',buttons:'Hidden placket',fit:'Regular',length:'Knee length',pattern:'Solid'});const ic=COLORS[ik.color];o+=`<g stroke="${shade(ic,-.35)}">${drawTop(ik,back,ic,ic)}</g>`}
  o+=drawTop(s,back,fill,col);
 }
 return`<svg class="${cls}" viewBox="0 0 300 400" role="img" aria-label="${esc(describe(s))}, ${view} view"><defs>${patDef(id,s.pattern,col,dt)}</defs><g stroke="${st}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">${o}</g></svg>`;
}

/* ---------------- catalogue ---------------- */
function mk(name,cat,o,occ,why){const spec=normalize({...defaultSpec(cat),...o});return{id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,spec,price:price(spec),occ,trend:!!why,why:why||''}}
const CATALOG=[
 // Latest · 2026
 mk('Embroidered Camp-Collar Shirt','shirt',{color:'Butter',fabric:'Linen',collar:'Cuban',fit:'Relaxed',sleeves:'Half',pattern:'Chikankari'},['casual','party'],'Embroidered camp collars lead summer shirting'),
 mk('Madras Check Cuban Shirt','shirt',{color:'Sky',fabric:'Seersucker',collar:'Cuban',fit:'Boxy',sleeves:'Half',pattern:'Madras check'},['casual'],'Madras checks are back, cut boxy'),
 mk('Open-Weave Knit Shirt','shirt',{color:'Sage',fabric:'Open-weave knit',collar:'Cuban',fit:'Relaxed',sleeves:'Half',buttons:'Wooden buttons'},['casual','party'],'Open-weave knits for warm evenings'),
 mk('Pleated Wide-Leg Linen Trousers','trousers',{color:'Beige',fabric:'Linen',fit:'Wide-leg',buttons:'Pleated front'},['office','casual'],'Wide-leg pleats replace skinny cuts'),
 mk('Tailored Linen Bermudas','trousers',{color:'Olive',fabric:'Linen',fit:'Tailored',length:'Bermuda',buttons:'Drawstring',pockets:'Side seam pockets'},['casual'],'Smarter, longer shorts'),
 mk('Ripstop Cargo Trousers','trousers',{color:'Chocolate',fabric:'Ripstop',fit:'Relaxed',pockets:'Cargo pockets'},['casual'],'Technical fabrics worn with tailoring'),
 mk('Espresso Overshirt','jacket',{color:'Chocolate',fabric:'Washed cotton',collar:'Spread',buttons:'Visible placket',pockets:'Two chest pockets',fit:'Relaxed'},['casual','office'],'Brown is the new black'),
 mk('Unstructured Linen Blazer','blazer',{color:'Sage',fabric:'Linen',collar:'Notch lapel',buttons:'One-button',pockets:'Patch pockets',fit:'Relaxed'},['wedding','office','party'],'Softer, unstructured tailoring'),
 mk('Terracotta Linen Co-ord','coord',{color:'Terracotta',fabric:'Linen',collar:'Cuban',fit:'Relaxed',sleeves:'Half'},['casual','party'],'Co-ord sets for holidays and brunches'),
 mk('Oversized Henley Tee','tshirt',{color:'Mint',fabric:'Supima jersey',collar:'Henley',fit:'Oversized'},['casual'],'Relaxed, roomy jersey'),
 mk('Midnight Pathani Set','kurta',{color:'Midnight',fabric:'Cotton',collar:'Pathani',fit:'Regular',sleeves:'Full'},['festive','casual'],'Pathani sets for festive and Eid'),
 mk('Sage Short Kurta','kurta',{color:'Sage',fabric:'Linen',collar:'Mandarin',length:'Short kurta',buttons:'Wooden buttons',fit:'Relaxed'},['casual','festive'],'Short kurtas as relaxed separates'),
 mk('Asymmetric Indo-Western Kurta','kurta',{color:'Wine',fabric:'Silk',collar:'Mandarin',length:'Asymmetric hem',buttons:'Hidden placket',fit:'Slim'},['wedding','party'],'Asymmetric hems for Indo-Western looks'),
 mk('Modern Midnight Bandhgala','bandhgala',{color:'Midnight',fabric:'Wool blend',fit:'Slim',buttons:'Contrast buttons'},['wedding','party'],'Sharper bandhgala tailoring'),
 mk('Ivory Zari Sherwani','sherwani',{color:'Ivory',fabric:'Silk',pattern:'Zari border',buttons:'Contrast buttons'},['wedding'],'Ivory with fine zari highlights'),
 mk('Rust Ajrakh Bundi','bundi',{color:'Rust',fabric:'Mashru silk',pattern:'Ajrakh print'},['festive','wedding'],'Bundis for easy festive layering'),
 mk('Ajrakh Angrakha Kurta','kurta',{color:'Indigo',fabric:'Mul cotton',collar:'Angrakha wrap',sleeves:'Three-quarter',pattern:'Ajrakh print',fit:'Regular'},['casual','festive'],'Angrakha wraps in natural-dye prints'),
 mk('Mint Chikankari Kurta','kurta',{color:'Mint',fabric:'Mul cotton',collar:'Round',pattern:'Chikankari',fit:'Regular',sleeves:'Three-quarter'},['casual','festive'],'Pastel chikankari for summer'),
 mk('Lavender Kota Co-ord','coord',{color:'Lavender',fabric:'Kota Doria',collar:'Mandarin',fit:'Relaxed',sleeves:'Three-quarter'},['festive','casual'],'Lavender is a summer 2026 colour'),
 mk('Emerald Zari Anarkali','anarkali',{color:'Emerald',fabric:'Silk',collar:'V-neck',sleeves:'Full',length:'Floor',pattern:'Zari border'},['wedding','festive'],'Jewel tones for evening functions'),
 mk('Dusty Rose Floral Lehenga','lehenga',{color:'Dusty Rose',fabric:'Organza',collar:'Sweetheart',sleeves:'Puff',pattern:'Floral'},['wedding'],'Soft blush and romantic florals'),
 mk('Champagne Zari Lehenga','lehenga',{color:'Champagne',fabric:'Silk',collar:'Square',sleeves:'Sleeveless',pattern:'Zari border'},['wedding'],'Champagne and gold for receptions'),
 mk('Puff-Sleeve Square-Neck Blouse','blouse',{color:'Terracotta',fabric:'Silk',collar:'Square',sleeves:'Puff'},['wedding','festive'],'Puff sleeves on saree blouses'),
 mk('Cobalt Shirt Dress','dress',{color:'Cobalt',fabric:'Cotton',collar:'Spread',buttons:'Front buttons',length:'Midi',sleeves:'Half'},['office','casual'],'Cobalt is a bold summer pick'),
 mk('Butter-Yellow Puff Midi','dress',{color:'Butter',fabric:'Linen',collar:'Square',sleeves:'Puff',length:'Midi',fit:'Relaxed'},['party','casual'],'Butter yellow across the season'),
 // Classics
 mk('Office Oxford Shirt','shirt',{color:'Sky',fabric:'Oxford cotton',collar:'Button-down',fit:'Slim',pockets:'One chest pocket'},['office']),
 mk('Black Slim Office Shirt','shirt',{color:'Black',collar:'Cutaway',fit:'Slim',buttons:'Hidden placket'},['office','party']),
 mk('Linen Weekend Shirt','shirt',{color:'Beige',fabric:'Linen',collar:'Mandarin',fit:'Relaxed',sleeves:'Half'},['casual']),
 mk('Rose Linen Shirt','shirt',{color:'Pink',fabric:'Linen',collar:'Spread',fit:'Tailored'},['casual','party']),
 mk('Ivory Silk Wedding Kurta','kurta',{color:'Ivory',fabric:'Silk',collar:'Mandarin',buttons:'Contrast buttons'},['wedding','festive']),
 mk('Maroon Chanderi Kurta','kurta',{color:'Maroon',fabric:'Chanderi',collar:'Mandarin',pattern:'Micro print'},['wedding','festive']),
 mk('Mustard Khadi Kurta','kurta',{color:'Mustard',fabric:'Khadi',collar:'Round',sleeves:'Three-quarter',buttons:'Wooden buttons'},['festive','casual']),
 mk('Navy Peak-Lapel Blazer','blazer',{color:'Navy',collar:'Peak lapel',fit:'Slim'},['wedding','party']),
 mk('Blue Linen Blazer','blazer',{color:'Blue',fabric:'Linen',buttons:'One-button',pockets:'Patch pockets'},['wedding','casual']),
 mk('Charcoal Pinstripe Suit','suit',{color:'Charcoal',pattern:'Pinstripe',fit:'Tailored'},['office','wedding']),
 mk('Everyday Tailored Chinos','trousers',{color:'Beige',fabric:'Stretch cotton',fit:'Tailored'},['office','casual']),
 mk('Black Formal Trousers','trousers',{color:'Black',fabric:'Wool blend',pockets:'Jetted pockets',fit:'Slim'},['office','wedding']),
 mk('Green Crepe Midi Dress','dress',{color:'Green',collar:'V-neck',sleeves:'Half',length:'Midi'},['party','wedding']),
 mk('Maroon Silk Saree Blouse','blouse',{color:'Maroon',fabric:'Silk',collar:'Boat',sleeves:'Half'},['wedding','festive']),
 mk('Olive Stand-Collar Jacket','jacket',{color:'Olive',collar:'Stand collar',buttons:'Front zip',pockets:'Flap pockets'},['casual']),
 mk('Everyday Crew T-Shirt','tshirt',{color:'White',collar:'Crew'},['casual'])
];
const TRENDS=CATALOG.filter(i=>i.trend);
const byId=id=>CATALOG.find(i=>i.id===id);

const today=new Date();
function lockSeed(p){Object.values(p.m).forEach(x=>{if(x.u)x.c='Verified'});const m=p.m;p.ref={chest:(m.chest.v+EASE[p.fit]).toFixed(1),shoulder:(m.shoulder.v+.3).toFixed(1),sleeve:m.arm.v.toFixed(1),length:m.shirtLen.v.toFixed(1)};return p}
/* ---------------- AI: prompt parsing, recommendations, search ---------------- */
const CAT_WORDS=[['lehenga',/lehenga|ghagra/],['anarkali',/anarkali/],['sherwani',/sherwani|achkan/],['bundi',/bundi|nehru jacket|waistcoat|koti/],['bandhgala',/bandhgala|bandgala|jodhpuri/],['coord',/co-?ords?\b|matching set/],['tshirt',/\bt-?shirts?\b|\btees?\b|henley/],['blouse',/blouse/],['kurta',/kurta|kurti|pathani|angrakha/],['trousers',/trouser|pants|chino|cargo|shorts|bermuda/],['suit',/\bsuit\b/],['blazer',/blazer/],['dress',/\bdress/],['jacket',/jacket|bomber|overshirt|shacket/],['shirt',/\bshirts?\b/]];
function matchFit(t){if(/wide.?leg|palazzo/.test(t))return'Wide-leg';if(/oversi[sz]ed|baggy/.test(t))return'Oversized';if(/boxy/.test(t))return'Boxy';if(/loose|relaxed/.test(t))return'Relaxed';for(const f of ['Slim','Tailored','Regular'])if(t.includes(f.toLowerCase()))return f;return null}
function parsePrompt(t){
 t=t.toLowerCase();const ch={},u=[];
 for(const[k,re]of CAT_WORDS)if(re.test(t)){ch.category=k;u.push(CATS[k].one);break}
 const fit=matchFit(t);if(fit){ch.fit=fit;u.push(fit)}
 for(const c of Object.keys(COLORS).sort((x,y)=>y.length-x.length))if(new RegExp('\\b'+c.toLowerCase()+'\\b').test(t)){ch.color=c;u.push(c);break}
 if(!ch.color){const al=[['Sky',/light blue/],['Butter',/butter|pastel yellow/],['Dusty Rose',/blush|rose/],['Wine',/burgundy/],['Chocolate',/brown|espresso|mocha/],['Midnight',/midnight|dark blue/],['Champagne',/gold(en)?/],['Sage',/sage/]];for(const[c,re]of al)if(re.test(t)){ch.color=c;u.push(c);break}}
 for(const f of Object.keys(FABRIC).sort((x,y)=>y.length-x.length)){if(t.includes(f.toLowerCase())){ch.fabric=f;u.push(f);break}}
 if(!ch.fabric)for(const[f,re]of[['Linen',/linen/],['Silk',/silk/],['Khadi',/khadi/],['Wool blend',/wool/],['Velvet',/velvet/],['Oxford cotton',/oxford/],['Organza',/organza/],['Mul cotton',/\bmul\b/],['Open-weave knit',/crochet|knit/]])if(re.test(t)){ch.fabric=f;u.push(f);break}
 const col=[['Cuban',/cuban|camp collar|resort collar/],['Pathani',/pathani/],['Angrakha wrap',/angrakha|wrap/],['Henley',/henley/],['Mandarin',/mandarin|band collar|nehru collar|chinese collar/],['Button-down',/button.?down/],['Cutaway',/cutaway/],['Spread',/spread/],['Polo',/polo/],['Stand collar',/stand collar/],['Peak lapel',/peak/],['Shawl lapel',/shawl/],['Notch lapel',/notch/],['V-neck',/v.?neck/],['Boat',/boat/],['Sweetheart',/sweetheart/],['Square',/square neck/],['Round',/round neck/],['Crew',/crew/]];
 for(const[v,re]of col)if(re.test(t)){ch.collar=v;u.push(v+(/lapel|neck|wrap|Henley/i.test(v)?'':' collar'));break}
 if(/puff/.test(t)){ch.sleeves='Puff';u.push('Puff sleeves')}else if(/full.?sleeve|long.?sleeve/.test(t)){ch.sleeves='Full';u.push('Full sleeves')}else if(/half.?sleeve|short.?sleeve/.test(t)){ch.sleeves='Half';u.push('Half sleeves')}else if(/three.?quarter|3\/4/.test(t)){ch.sleeves='Three-quarter';u.push('¾ sleeves')}else if(/sleeveless/.test(t)){ch.sleeves='Sleeveless';u.push('Sleeveless')}
 if(/hidden|concealed/.test(t)){ch.buttons='Hidden placket';u.push('Hidden placket')}else if(/wooden/.test(t)){ch.buttons='Wooden buttons';u.push('Wooden buttons')}else if(/contrast|gold button/.test(t)){ch.buttons='Contrast buttons';u.push('Contrast buttons')}else if(/double.?breasted/.test(t)){ch.buttons='Double-breasted';u.push('Double-breasted')}else if(/pleat/.test(t)){ch.buttons='Pleated front';u.push('Pleated front')}else if(/drawstring|elastic/.test(t)){ch.buttons='Drawstring';u.push('Drawstring')}else if(/zip/.test(t)){ch.buttons='Front zip';u.push('Zip')}
 if(/cargo/.test(t)){ch.pockets='Cargo pockets';u.push('Cargo pockets')}else if(/two pockets|2 pockets|two chest/.test(t)){ch.pockets='Two chest pockets';u.push('Two pockets')}else if(/no pocket|without pocket/.test(t)){ch.pockets='None';u.push('No pocket')}else if(/pocket/.test(t)){ch.pockets='One chest pocket';u.push('Chest pocket')}
 if(/longer back|long back|curved hem/.test(t)){ch.length='Longer back';u.push('Longer back')}else if(/asymmetric|high.?low/.test(t)){ch.length='Asymmetric hem';u.push('Asymmetric hem')}else if(/short kurta|kurti/.test(t)){ch.length='Short kurta';u.push('Short kurta')}else if(/bermuda|shorts/.test(t)){ch.length='Bermuda';u.push('Bermuda')}else if(/crop/.test(t)){ch.length='Cropped';u.push('Cropped')}else if(/floor/.test(t)){ch.length='Floor';u.push('Floor length')}else if(/midi/.test(t)){ch.length='Midi';u.push('Midi')}else if(/maxi/.test(t)){ch.length='Maxi';u.push('Maxi')}else if(/mid.?calf|long kurta/.test(t)){ch.length='Mid-calf';u.push('Mid-calf')}
 const pats=[['Zari border',/zari|zardozi|gota|gold border/],['Chikankari',/chikan|embroider/],['Ajrakh print',/ajrakh|block.?print/],['Madras check',/madras/],['Floral',/floral|flower/],['Pinstripe',/stripe/],['Check',/check|plaid/],['Micro print',/print|motif/],['Solid',/plain|solid/]];
 for(const[v,re]of pats)if(re.test(t)){ch.pattern=v;u.push(v);break}
 return{ch,u};
}
const OCC_SETS={
 Office:[['shirt',{color:'Sky',fabric:'Oxford cotton',collar:'Spread',pockets:'One chest pocket'},'Spread collar frames a tie or open neck'],['trousers',{color:'Beige',fabric:'Linen',fit:'Wide-leg',buttons:'Pleated front'},'Pleated wide-leg is the 2026 office trouser'],['blazer',{color:'Sage',fabric:'Linen',collar:'Notch lapel',buttons:'One-button',pockets:'Patch pockets'},'Unstructured blazer over a shirt or tee']],
 Wedding:[['sherwani',{color:'Ivory',fabric:'Silk',pattern:'Zari border',buttons:'Contrast buttons'},'Ivory with fine zari for the main ceremony'],['bandhgala',{color:'Midnight',fabric:'Wool blend',buttons:'Contrast buttons'},'Sharp bandhgala for the reception'],['anarkali',{color:'Emerald',fabric:'Silk',length:'Floor',pattern:'Zari border'},'Jewel tones for evening functions']],
 Casual:[['coord',{color:'Terracotta',fabric:'Linen',collar:'Cuban',sleeves:'Half'},'Linen co-ord: one decision, whole outfit'],['shirt',{color:'Butter',fabric:'Linen',collar:'Cuban',sleeves:'Half',pattern:'Chikankari'},'Embroidered camp collar for weekends'],['trousers',{color:'Olive',fabric:'Linen',length:'Bermuda',buttons:'Drawstring'},'Tailored Bermudas for hot days']],
 Festive:[['bundi',{color:'Rust',fabric:'Mashru silk',pattern:'Ajrakh print'},'Bundi over a kurta for easy layering'],['kurta',{color:'Midnight',collar:'Pathani'},'Pathani set for Diwali and Eid'],['kurta',{color:'Mint',fabric:'Mul cotton',collar:'Round',pattern:'Chikankari'},'Pastel chikankari for daytime puja']]};
function recommend(occ,p){
 const m=p&&p.m;const drop=m?m.chest.v-m.waist.v:null;const h=m?m.height.v:null;
 const fit=drop==null?'Tailored':drop>=6?'Slim':drop>=3.5?'Tailored':'Regular';
 return OCC_SETS[occ].map(([cat,o,why],i)=>{const spec=normalize({...defaultSpec(cat),...o,fit});let reason=why;if(i===0&&drop!=null)reason=`${drop.toFixed(1)} in chest-to-waist drop suits a ${fit.toLowerCase()} cut`;if(i===1&&h&&h<67&&cat!=='kurta'){spec.pattern='Pinstripe';reason='Vertical stripes add visual height'}return{spec,reason}});
}
function parseSearch(q){
 const t=q.toLowerCase(),f={},u=[];
 for(const[k,re]of CAT_WORDS)if(re.test(t)){f.cat=k;u.push(CATS[k].one);break}
 for(const c of Object.keys(COLORS).sort((x,y)=>y.length-x.length))if(new RegExp('\\b'+c.toLowerCase()+'\\b').test(t)){f.color=c;u.push(c);break}
 {const ft=matchFit(t);if(ft){f.fit=ft;u.push(ft+' fit')}}
 if(/latest|trend|new\b|2026/.test(t)){f.trend=true;u.push('Latest 2026')}
 for(const p of ['Zari border','Chikankari','Ajrakh print','Madras check','Floral'])if(t.includes(p.split(' ')[0].toLowerCase())){f.pat=p;u.push(p)}
 for(const fb of ['linen','silk','khadi','wool','velvet','oxford','chanderi','crepe','organza','mul','kota','ripstop','knit','seersucker'])if(t.includes(fb)){f.fabric=fb;u.push(fb[0].toUpperCase()+fb.slice(1))}
 const occ=[['office',/office|work|formal|meeting/],['wedding',/wedding|shaadi|sangeet|reception/],['casual',/casual|weekend|everyday/],['festive',/festive|diwali|puja|eid|festival/],['party',/party|evening|cocktail/]];
 for(const[o,re]of occ)if(re.test(t)){f.occ=o;u.push(o[0].toUpperCase()+o.slice(1))}
 const pm=t.match(/(?:under|below|less than|within|upto|up to)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)\s*(k)?/);
 if(pm){f.max=parseInt(pm[1].replace(/,/g,''))*(pm[2]?1000:1);u.push('Under '+inr(f.max))}
 let res=CATALOG.filter(it=>(!f.cat||it.spec.category===f.cat)&&(!f.max||it.price<=f.max)&&(!f.trend||it.trend)).map(it=>{let sc=1+(it.trend?.5:0);if(f.pat&&it.spec.pattern===f.pat)sc+=3;if(f.color&&it.spec.color===f.color)sc+=3;if(f.fit&&it.spec.fit===f.fit)sc+=2;if(f.fabric&&it.spec.fabric.toLowerCase().includes(f.fabric))sc+=2;if(f.occ&&it.occ.includes(f.occ))sc+=3;return{it,sc}});
 const strict=f.color||f.occ||f.fabric||f.pat;if(strict)res=res.filter(r=>r.sc>=3);
 return{u,items:res.sort((a,b)=>b.sc-a.sc).map(r=>r.it)};
}
function finished(d,m,adj){return finished0(d,m).map(([l,v])=>[l,v+((adj||{})[l]||0)])}
function finished0(d,m){const e=EASE[d.fit];const lenAdj={'Extended':2,'Cropped':-2.5,'Mid-calf':4,'Short kurta':-6,'Knee length':0}[d.length]||0;const base=d.category==='kurta'?m.shirtLen.v+9:d.category==='blouse'?m.shirtLen.v*.5:m.shirtLen.v;
 const sl={Full:m.arm.v,'Three-quarter':m.arm.v*.72,Half:m.arm.v*.4,Sleeveless:0}[d.sleeves]??m.arm.v;
 const kind=CATS[d.category].kind;
 if(kind==='bottom')return[['Waist',m.trouserWaist.v+1],['Hip',m.hip.v+e],['Thigh',m.thigh.v+2.5],['Inseam',m.inseam.v-(d.length==='Ankle'?1.5:d.length==='Cropped'?4:0)]];
 return[['Chest',m.chest.v+e],['Waist',m.waist.v+e+.5],['Shoulder',m.shoulder.v+.3],['Length',base+lenAdj],...(sl?[['Sleeve',sl]]:[])].concat(d.length==='Longer back'?[['Back length',base+1]]:[]);
}
function estimateM(hIn,kg,shape,size,seed){
 const m=genM(hIn,seed);const bmi=kg>0?kg/Math.pow(hIn*.0254,2):22.5;
 const f=Math.max(.84,Math.min(1.34,1+(bmi-22.5)*.022));
 const G=['chest','upperChest','waist','abdomen','hip','neck','bicep','wrist','trouserWaist','thigh','knee','calf'];
 G.forEach(k=>m[k].v*=f);
 const mul=(ks,x)=>ks.forEach(k=>m[k].v*=x);
 if(shape==='Athletic'){mul(['chest','upperChest','shoulder','bicep'],1.035);mul(['waist','abdomen','trouserWaist'],.96)}
 if(shape==='Slim')mul(G,.97);
 if(shape==='Fuller middle')mul(['waist','abdomen','trouserWaist'],1.07);
 const T={S:37.5,M:40,L:42.5,XL:45,XXL:47.5}[size];
 if(T){const ratio=(m.chest.v*.4+T*.6)/m.chest.v;mul(['chest','upperChest'],ratio)}
 Object.entries(m).forEach(([k,x])=>{x.v=Math.round(x.v*10)/10;if(k!=='height'){x.c=G.includes(k)?'Medium':'High';x.u=x.c!=='High'}});
 ['neck','calf','wrist'].forEach(k=>{m[k].c='Low';m[k].u=true});
 return m;
}
export { COLORS, FABRIC, FITS, FIT_IN, EASE, PATTERNS, PAT_COST, CATS, fitsOf, STATUSES, MEAS, esc, inr, cm, rng, shade, lum,
  defaultSpec, normalize, price, title, describe, genM, uncertain, checks, REF, refIssues, fitScore, GIRTHS, TAPE,
  garmentSVG, CATALOG, TRENDS, byId, lockSeed, CAT_WORDS, matchFit, parsePrompt, OCC_SETS, recommend, parseSearch, finished, finished0, estimateM };
