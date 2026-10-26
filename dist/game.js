export const SAVE_KEY = 'farm-zone-garden-v1';
export const PLANTS = Object.freeze([
  { id:'strawberry', name:'Клубника', icon:'🍓', category:'Ягоды', time:45, yield:5, price:12, water:.12, cost:40, level:1, trait:'Быстрый урожай' },
  { id:'golden', name:'Золотая малина', icon:'🫐', category:'Ягоды', time:60, yield:6, price:18, water:.16, cost:75, level:2, trait:'Обильный сорт' },
  { id:'mint', name:'Садовая мята', icon:'🌿', category:'Травы', time:35, yield:4, price:10, water:.07, cost:30, level:1, trait:'Экономит воду' },
  { id:'basil', name:'Базилик', icon:'🌱', category:'Травы', time:50, yield:6, price:11, water:.09, cost:45, level:3, trait:'Для заказов' },
  { id:'tomato', name:'Черри', icon:'🍅', category:'Овощи', time:75, yield:8, price:16, water:.15, cost:95, level:5, trait:'Большая корзина' },
  { id:'lemon', name:'Карликовый лимон', icon:'🍋', category:'Фрукты', time:120, yield:5, price:35, water:.10, cost:160, level:6, trait:'Для редких заходов' },
  { id:'lavender', name:'Лаванда', icon:'🪻', category:'Цветы', time:150, yield:4, price:45, water:.06, cost:180, level:7, trait:'Коллекционный сорт' },
  { id:'blueberry', name:'Голубика', icon:'🫐', category:'Ягоды', time:90, yield:7, price:24, water:.11, cost:125, level:6, trait:'Универсальный сорт' }
]);
export const plantById = id => PLANTS.find(p => p.id === id);
export const capacity = s => 160 + s.upgrades.storage * 100;
export const waterCapacity = s => 120 + s.upgrades.tank * 60;
export const plantYield = (s, p) => plantById(p.plant).yield + s.upgrades.yield * 2;
export const plantCapacity = s => 1 + s.upgrades.retention;
export const readyCount = s => s.plots.reduce((n,p) => n + (!p.locked && p.plant && p.ready > 0 ? 1 : 0), 0);
export const storedCount = s => Object.values(s.inventory).reduce((a,b) => a+b, 0);
export const saleValue = s => PLANTS.reduce((n,p) => n + (s.inventory[p.id] || 0)*p.price, 0);
export const nextLevelXP = s => 100 + (s.level-5)*35;
export const UPGRADE_INFO = {
  tank:{ name:'Большой резервуар', icon:'💧', description:'Ещё 60 единиц воды в запасе', base:180 },
  recovery:{ name:'Сбор дождевой воды', icon:'🌧️', description:'Восстановление воды +0,04 в секунду', base:230 },
  yield:{ name:'Урожайные растения', icon:'🌾', description:'Каждый сбор даёт на 2 плода больше', base:200 },
  retention:{ name:'Крепкие ветви', icon:'🧺', description:'Растения сохраняют ещё один урожай', base:220 },
  storage:{ name:'Вместительный склад', icon:'📦', description:'Ещё 100 мест для собранных плодов', base:190 },
  irrigation:{ name:'Капельный полив', icon:'🚿', description:'Все растения расходуют на 25% меньше воды', base:260, max:1 },
  autoCollect:{ name:'Автоматический сбор', icon:'⚙️', description:'Созревшие плоды сами поступают на склад', base:600, max:1 }
};
export const upgradePrice = (s,key) => Math.round(UPGRADE_INFO[key].base * (1.65 ** s.upgrades[key]));

export function createGame(now=Date.now()) {
  return {
    version:1, lastAt:now, coins:1240, cr:45, level:5, xp:40, water:100,
    inventory:{}, upgrades:{tank:0,recovery:0,yield:0,retention:0,storage:0,irrigation:0,autoCollect:0},
    plots:[
      {id:0,plant:'mint',ready:1,elapsed:0,adult:true,watered:true,locked:false},
      {id:1,plant:'strawberry',ready:0,elapsed:12,adult:false,watered:true,locked:false},
      {id:2,plant:'golden',ready:1,elapsed:0,adult:true,watered:true,locked:false},
      {id:3,plant:null,ready:0,elapsed:0,adult:false,watered:true,locked:false},
      {id:4,plant:'basil',ready:1,elapsed:0,adult:true,watered:true,locked:false},
      {id:5,plant:null,ready:0,elapsed:0,adult:false,watered:true,locked:true}
    ],
    collection:{mint:3,strawberry:1,golden:3,basil:3}, harvests:0, fruitsHarvested:0,
    questDone:false, questClaimed:false, taskClaims:[], orderDone:false, greenhouse:false,
    wellAt:0, helpDay:'', dailyGiftDay:'', visualChanges:[]
  };
}

function addXP(s,n) {
  s.xp += n;
  while(s.xp >= nextLevelXP(s)) { s.xp -= nextLevelXP(s); s.level++; }
}

function collectPlot(s,p) {
  if(!p.plant || p.ready < 1) return 0;
  const yieldSize = plantYield(s,p);
  const batches = Math.min(p.ready, Math.floor((capacity(s)-storedCount(s))/yieldSize));
  if(!batches) return 0;
  const total = batches * yieldSize;
  s.inventory[p.plant] = (s.inventory[p.plant] || 0) + total;
  p.ready -= batches; p.adult = true;
  s.harvests += batches; s.fruitsHarvested += total;
  s.collection[p.plant] = Math.max(3,s.collection[p.plant] || 0);
  if(plantById(p.plant).category === 'Ягоды') s.questDone = true;
  if(!s.visualChanges.includes(p.id)) s.visualChanges.push(p.id);
  addXP(s,batches*12);
  return total;
}

// The same simulation advances both online and offline. Once every plant is
// full, remaining idle time is resolved in one step, independent of absence length.
export function advance(s, now=Date.now()) {
  let remaining = Math.max(0,(now-s.lastAt)/1000);
  const report = {seconds:remaining, produced:0, collected:0, waterBefore:s.water};
  const regeneration = .08 + s.upgrades.recovery*.04;
  if(now < s.lastAt) return report;
  while(remaining > .00001) {
    if(s.upgrades.autoCollect) {
      for(const p of s.plots) if(!p.locked) report.collected += collectPlot(s,p);
    }
    const active = s.plots.filter(p => !p.locked && p.plant && p.watered && p.ready < plantCapacity(s));
    if(!active.length) { s.water = Math.min(waterCapacity(s),s.water+remaining*regeneration); break; }
    const dt = Math.min(1,remaining);
    s.water = Math.min(waterCapacity(s),s.water+dt*regeneration);
    const cost = active.reduce((n,p) => n+plantById(p.plant).water*dt*(s.upgrades.irrigation ? .75 : 1),0);
    if(s.water+1e-9 >= cost) {
      s.water = Math.max(0,s.water-cost);
      for(const p of active) {
        const type = plantById(p.plant);
        p.elapsed += dt;
        while(p.elapsed+1e-8 >= type.time && p.ready < plantCapacity(s)) {
          p.elapsed = Math.max(0,p.elapsed-type.time); p.ready++; p.adult = true;
          s.collection[p.plant] = Math.max(2,s.collection[p.plant] || 0);
          report.produced += plantYield(s,p);
        }
      }
    }
    remaining -= dt;
  }
  // Collect the final harvest even when absence ends exactly at a growth boundary.
  if(s.upgrades.autoCollect) for(const p of s.plots) if(!p.locked) report.collected += collectPlot(s,p);
  s.lastAt = now;
  return report;
}

export function plant(s,plotId,typeId) {
  const plot = s.plots.find(p => p.id === plotId), type = plantById(typeId);
  if(!plot || plot.locked || plot.plant || !type) return {ok:false,message:'Эта грядка недоступна'};
  if(s.level < type.level) return {ok:false,message:`Сорт откроется на уровне ${type.level}`};
  if(s.coins < type.cost) return {ok:false,message:'Не хватает монет. Продайте урожай на складе'};
  s.coins -= type.cost; plot.plant = type.id; plot.elapsed = 0; plot.ready = 0; plot.adult = false;
  s.collection[type.id] = Math.max(1,s.collection[type.id] || 0);
  if(!s.visualChanges.includes(plotId)) s.visualChanges.push(plotId);
  return {ok:true,message:`${type.name}: посажено!`};
}
export function harvest(s,id=null) {
  let count=0;
  for(const p of s.plots) if(!p.locked && (id===null || p.id===id)) count += collectPlot(s,p);
  return count;
}
export function sell(s) {
  const amount=saleValue(s), count=storedCount(s);
  if(count) { s.coins += amount; s.inventory={}; }
  return {amount,count};
}
export function buyUpgrade(s,key) {
  const info = UPGRADE_INFO[key];
  if(!info) return {ok:false,message:'Улучшение недоступно'};
  if(info.max && s.upgrades[key]>=info.max) return {ok:false,message:'Уже установлено'};
  const price=upgradePrice(s,key);
  if(s.coins < price) return {ok:false,message:'Не хватает монет. Продайте урожай'};
  s.coins-=price; s.upgrades[key]++;
  if(key==='tank') s.water = Math.min(waterCapacity(s),s.water+60);
  addXP(s,20);
  return {ok:true,message:`${info.name}: улучшено!`};
}
export function claimQuest(s) {
  if(!s.questDone || s.questClaimed) return false;
  s.questClaimed = true; s.coins += 150; addXP(s,30); return true;
}
export function unlockPlot(s) {
  const p=s.plots.find(p=>p.locked);
  if(!p) return {ok:false,message:'Все участки уже открыты'};
  if(!s.questDone) return {ok:false,message:'Сначала соберите первый ягодный урожай'};
  if(s.coins<450) return {ok:false,message:'Для расширения нужно 450 монет'};
  s.coins-=450; p.locked=false; s.visualChanges.push(p.id); addXP(s,25);
  return {ok:true,message:'Новая грядка открыта!',id:p.id};
}
export function buildGreenhouse(s) {
  if(s.greenhouse) return {ok:false,message:'Теплица уже построена'};
  if(s.level<6) return {ok:false,message:'Теплица откроется на уровне 6'};
  if(s.coins<900) return {ok:false,message:'Для теплицы нужно 900 монет'};
  s.coins-=900; s.greenhouse=true;
  for(let id=6;id<9;id++) s.plots.push({id,plant:null,ready:0,elapsed:0,adult:false,watered:true,locked:false});
  addXP(s,40); return {ok:true,message:'В теплице появились три новые грядки!'};
}
export function fulfillOrder(s) {
  if(s.orderDone || (s.inventory.golden||0)<6 || (s.inventory.mint||0)<4) return false;
  s.inventory.golden-=6; s.inventory.mint-=4; s.coins+=220; s.orderDone=true; addXP(s,25); return true;
}
export function claimTask(s,id) {
  if(s.taskClaims.includes(id)) return false;
  const eligible = {harvest:s.fruitsHarvested>=15,upgrade:Object.values(s.upgrades).some(n=>n>0),collection:Object.keys(s.collection).length>=5};
  if(!eligible[id]) return false;
  s.taskClaims.push(id); s.coins+=100; addXP(s,20); return true;
}
export function refillWell(s,now=Date.now()) {
  if(now-s.wellAt < 60000) return {ok:false,message:'Колодец наполняется. Подождите немного'};
  if(s.water>=waterCapacity(s)) return {ok:false,message:'Резервуар уже полный'};
  const amount=Math.min(25,waterCapacity(s)-s.water);
  s.water+=amount; s.wellAt=now; return {ok:true,message:`В резервуаре +${Math.round(amount)} воды`};
}
export function loadGame(raw, now=Date.now()) {
  if(!raw) return createGame(now);
  try {
    const s=JSON.parse(raw);
    if(s.version!==1 || !Array.isArray(s.plots) || s.plots.length<6 || s.plots.length>9) throw new Error('invalid save');
    for(const key of ['lastAt','coins','cr','level','xp','water','harvests','fruitsHarvested']) if(!Number.isFinite(s[key]) || s[key]<0) throw new Error('invalid field');
    if(s.level<5 || !s.inventory || typeof s.inventory!=='object' || !s.upgrades || !s.collection) throw new Error('invalid data');
    if(!Array.isArray(s.visualChanges)||!Array.isArray(s.taskClaims)) throw new Error('invalid flags');
    const ids=new Set();
    for(const p of s.plots) {
      if(!Number.isInteger(p.id)||p.id<0||p.id>8||ids.has(p.id)) throw new Error('invalid plot');
      ids.add(p.id);
      if(p.plant!==null&&!plantById(p.plant)) throw new Error('invalid plant');
      if(!Number.isFinite(p.elapsed)||p.elapsed<0||!Number.isInteger(p.ready)||p.ready<0||p.ready>100) throw new Error('invalid progress');
    }
    for(const key of Object.keys(UPGRADE_INFO)) if(!Number.isInteger(s.upgrades[key])||s.upgrades[key]<0||s.upgrades[key]>100) throw new Error('invalid upgrade');
    for(const [key,value] of Object.entries(s.inventory)) if(!plantById(key)||!Number.isInteger(value)||value<0) throw new Error('invalid inventory');
    return s;
  } catch { return createGame(now); }
}
