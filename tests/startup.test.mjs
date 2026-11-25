import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
const start=source.indexOf('const defaultLayout=');
const end=source.indexOf('function blockedRay(',start);
function harness(saved,w=844,h=390){
 assert.ok(start>=0&&end>start,'HUD input initialization exists');
 const nodes=new Map(),winEvents=new Map(),savedWrites=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{style:{},events:new Map(),addEventListener(type,fn){this.events.set(type,fn)},querySelector(){return this.nub??={style:{}}}});return nodes.get(id)}
 const ctx=vm.createContext({$:node,innerWidth:w,innerHeight:h,localStorage:{getItem(){return saved},setItem(key,value){savedWrites.push([key,value])}},window:{addEventListener(type,fn){winEvents.set(type,fn)}},layout:null});
 vm.runInContext(source.slice(start,end)+'\nglobalThis.controls={positionUI,slots,nub,handle};',ctx);
 return {ctx,nodes,winEvents,savedWrites};
}
test('HUD initialization executes and restores touch, keyboard, resize and layout controls',()=>{
 const {nodes,winEvents,ctx}=harness('{}');
 assert.equal(nodes.get('move').style.left,109.72+'px');
 assert.equal(nodes.get('aim').style.left,717.4+'px');
 for(const id of ['move','aim','skill'])for(const ev of ['pointerdown','pointermove','pointerup','pointercancel'])assert.ok(nodes.get(id).events.has(ev),`${id} ${ev}`);
 assert.ok(winEvents.has('keydown')&&winEvents.has('keyup')&&winEvents.has('resize'));
 assert.equal(typeof nodes.get('edit').onclick,'function');
 assert.equal(typeof ctx.controls.positionUI,'function');
});
test('invalid saved positions fall back; valid saved positions stay within viewport on resize',()=>{
 const {nodes,ctx}=harness('{"move":[-1,2],"aim":[1,1],"skill":null}');
 assert.equal(nodes.get('move').style.left,109.72+'px');
 assert.equal(nodes.get('aim').style.left,'782px');
 assert.equal(nodes.get('aim').style.top,'328px');
 ctx.innerWidth=390;ctx.innerHeight=844;ctx.controls.positionUI();
 assert.equal(nodes.get('aim').style.left,'328px');
 assert.equal(nodes.get('aim').style.top,'782px');
});
test('render loop starts after control setup and resize; map drawing is independent',()=>{
 assert.ok(source.indexOf('function positionUI()')<source.indexOf('function resize()'));
 assert.match(source,/resize\(\);requestAnimationFrame\(frame\)/);
 assert.match(source,/function drawMap\(\)/);
});

test('all eight skill gestures release once or cancel without sending; pointer loss cancels',()=>{
 const nodes=new Map(),messages=[];const roleNames=['flame','phase','shield','twin','sage','vampire','blackhole','engineer'];
 function node(id){if(!nodes.has(id)){const cls=new Set();nodes.set(id,{hidden:id==='cancelSkill'||id==='skillHint',style:{},events:new Map(),classList:{add(x){cls.add(x)},remove(x){cls.delete(x)},contains(x){return cls.has(x)},toggle(x,on){if(on)cls.add(x);else cls.delete(x)}},addEventListener(type,fn){this.events.set(type,fn)},setPointerCapture(){},getBoundingClientRect(){return id==='cancelSkill'?{left:630,top:80,width:74,height:74}:{left:505,top:170,width:76,height:76};}});}return nodes.get(id)}
 const ctx=vm.createContext({$:node,innerWidth:844,innerHeight:390,skillAim:null,skillPending:0,skillPointer:null,groundPointer:null,skillOrigin:null,skillDragged:false,editing:false,held:false,aiming:false,sniperHold:0,aim:{x:1,y:0},skillPreview:{visible:false},dashPreview:{visible:false},skillAvailable:()=>true,skillRole:()=>ctx.role,updateSkill(){},send:o=>messages.push(o),performance:{now:()=>1000},flameOffset:(x,y)=>({x,z:y}),window:{addEventListener(){}}});
 const functions=source.slice(source.indexOf('function cancelSkill()'),source.indexOf('function setGroundSkill'))+source.slice(source.indexOf('function confirmSkill()'),source.indexOf('const anchorMeshes'));
 const handlers=source.slice(source.indexOf("const skillButton=$('skill');"),source.indexOf("$('edit').onclick"));
 vm.runInContext(functions+handlers,ctx);
 const emit=(type,x,y,id=1)=>node('skill').events.get(type)({pointerId:id,button:0,clientX:x,clientY:y,preventDefault(){}});
 for(const role of roleNames){ctx.role=role;ctx.skillPending=0;const n=messages.length;emit('pointerdown',543,208);assert.equal(messages.length,n);assert.equal(node('cancelSkill').hidden,false);emit('pointermove',667,117);emit('pointerup',667,117);assert.equal(messages.length,n);assert.equal(ctx.skillPending,0);assert.equal(node('cancelSkill').hidden,true);emit('pointerdown',543,208);emit('pointermove',560,208);emit('pointerup',560,208);assert.equal(messages.length,n+1);assert.equal(messages.at(-1).type,'skill');assert.equal(node('cancelSkill').hidden,true);ctx.skillPending=0;emit('pointerdown',543,208);emit('pointercancel',543,208);emit('pointerup',543,208);assert.equal(messages.length,n+1);assert.equal(node('cancelSkill').hidden,true);}
});

test('weapon group drag is edit-only, clamps full width and height, and persists through existing HUD save',()=>{
 const {ctx,nodes,savedWrites}=harness('{}');const g=nodes.get('weapons');g.offsetWidth=240;g.offsetHeight=40;g.setPointerCapture=()=>{};g.getBoundingClientRect=()=>({left:500,top:60,width:240,height:40});
 const emit=(type,x,y)=>g.events.get(type)({pointerId:1,button:0,clientX:x,clientY:y,preventDefault(){}});
 ctx.editing=false;const initial=g.style.left;emit('pointerdown',620,80);emit('pointermove',840,380);assert.equal(g.style.left,initial);
 ctx.editing=true;emit('pointerdown',620,80);emit('pointermove',840,380);assert.equal(g.style.left,'718px');assert.equal(g.style.top,'364px');emit('pointerup',840,380);
 ctx.cancelSkill=()=>{};ctx.document={body:{classList:{toggle(){}}}};nodes.get('edit').onclick();assert.equal(savedWrites.length,1);const saved=JSON.parse(savedWrites[0][1]);assert.ok(saved.weapons[0]>.95&&saved.weapons[1]>.9);
 const second=harness(JSON.stringify(saved),390,844);assert.ok(Number.parseFloat(second.nodes.get('weapons').style.left)<=390-56);
});
test('no delayed white bar; actual HP ratio and modal suppression, buff details in bag only',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(source+css,/headLabelDelay|l\.delay\.style|强化 Dmg/);assert.match(source,/Math\.max\(0,Math\.min\(100,a\.hp\/\(a\.maxHp\|\|100\)\*100\)\)/);assert.match(source,/l\.el\.hidden=!\$\('bag'\)\.hidden\|\|!\$\('mapPanel'\)\.hidden/);assert.match(css,/#bag,#mapPanel\{z-index:85/);assert.match(html,/id="performanceDock"><span id="fpsCounter"/);assert.match(html,/id="bagStats"/);assert.match(source,/p\.root\.position\.y=0;p\.root\.rotation\.z=0/);
 const nodes={bagStats:{}};const ctx=vm.createContext({$:id=>nodes[id]});vm.runInContext(source.slice(source.indexOf('function updateBagStats('),source.indexOf('function showBag(')),ctx);ctx.updateBagStats({maxHp:140,buffs:{cd:5,damage:2,defense:1,hp:2}});assert.match(nodes.bagStats.textContent,/140（\+40）/);assert.match(nodes.bagStats.textContent,/\+24%/);assert.match(nodes.bagStats.textContent,/8%/);assert.match(nodes.bagStats.textContent,/40%/);
});

test('game action buttons accept independent pointer presses once and keep nearby nodes stable',()=>{
 const messages=[],nodes=new Map();
 const make=()=>({events:new Map(),hidden:false,disabled:false,children:[],addEventListener(k,fn){this.events.set(k,fn)},append(b){b.parent=this;this.children.push(b)},remove(){this.parent.children=this.parent.children.filter(x=>x!==this)}});
 const node=id=>{if(!nodes.has(id)){const b=make();b.hidden=['perfPanel','bag','mapPanel'].includes(id);nodes.set(id,b);}return nodes.get(id)};
 const me={id:1,alive:true,x:0,z:0,gun:0,owned:[true,true,true,true,true],armor:2,helmet:0};
 const state={actors:[me],chests:[],loot:[{id:1,type:'armor',level:1,x:0,z:0},{id:2,type:'armor',level:3,x:0,z:0}]};
 const ctx=vm.createContext({$:node,document:{createElement:make},state,myId:1,editing:false,selected:0,send:m=>messages.push(m),nameOf:i=>i.type+':'+i.level,slots:{move:17,aim:null},move:{x:1,y:0}});
 vm.runInContext(source.slice(source.indexOf('function bindAction('),source.indexOf('const damageLabels=[];')),ctx);
 const button=make();ctx.bindAction(button,()=>ctx.action('heal'));const ev={button:0,pointerId:18,preventDefault(){},stopPropagation(){}};button.events.get('pointerdown')(ev);button.events.get('click')({detail:1,pointerType:'touch'});assert.equal(messages.length,1);assert.equal(messages[0].type,'heal');assert.equal(ctx.slots.move,17);assert.equal(ctx.move.x,1);
 ctx.updateNearbyButtons(state,me);const first=node('loot').children[0];ctx.updateNearbyButtons(state,me);assert.equal(node('loot').children[0],first);first.events.get('pointerdown')(ev);assert.equal(messages.at(-1).id,1);ctx.pickupNearby();assert.equal(messages.at(-1).id,2);state.loot.pop();ctx.updateNearbyButtons(state,me);assert.equal(node('loot').children.length,1);assert.equal(node('loot').children[0],first);ctx.pickupNearby();assert.equal(messages.at(-1).id,1);state.upgrade={};button.events.get('pointerdown')(ev);assert.equal(messages.at(-1).type,'pickup');
});
test('desktop keys route through shared actions, ignore repeat and typing; mouse enters existing assist state',()=>{
 const calls=[],keys=new Set();let listener;const ctx=vm.createContext({window:{addEventListener(_,fn){listener=fn}},canInteract:()=>true,wasDowned:false,keys,skillAim:null,action:t=>calls.push(t),pickupNearby:()=>calls.push('pickup'),equipWeapon:i=>calls.push(i)});
 const start=source.indexOf("window.addEventListener('keydown',e=>{if(!canInteract()");const end=source.indexOf("window.addEventListener('keyup'",start);vm.runInContext(source.slice(start,end),ctx);for(const key of ['h','1','2','3','4','5','e','r'])listener({key,target:{tagName:'BODY'},repeat:false});assert.deepEqual(calls,['heal',0,1,2,3,4,'pickup','reload']);listener({key:'h',repeat:true});listener({key:'h',target:{tagName:'INPUT'}});assert.equal(calls.length,8);assert.match(source,/e\.pointerType==='mouse'&&e\.button===0&&canInteract\(\)\)\{held=true;aiming=true;/);assert.match(source,/lockedTarget=held&&aiming\?nextLock:null/);
});

test('map, bag and rescue shortcuts toggle and use existing interactions',()=>{const nodes=new Map(),calls=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:id!=='hud'});return nodes.get(id)};const me={id:1,alive:true};const ctx=vm.createContext({$:node,state:{actors:[me]},myId:1,editing:false,clearSpectatorInput:()=>calls.push('clear'),drawMap:()=>calls.push('map'),showBag:()=>calls.push('bag'),requestRevive:()=>calls.push('revive'),stopRevive:()=>calls.push('stop')});vm.runInContext(source.slice(source.indexOf('function panelHotkey('),source.indexOf("window.addEventListener('keydown',panelHotkey)")),ctx);const press=key=>ctx.panelHotkey({key,preventDefault(){}});press('m');assert.equal(node('mapPanel').hidden,false);press('b');assert.equal(node('mapPanel').hidden,true);assert.equal(node('bag').hidden,false);press('b');assert.equal(node('bag').hidden,true);press('f');me.rescueTarget=2;press('f');assert.deepEqual(calls,['clear','map','clear','bag','clear','revive','stop']);assert.match(source,/b\.textContent=i<5\?/);});
