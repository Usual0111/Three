import { SAVE_KEY, PLANTS, plantById, createGame, loadGame, advance, plant, harvest, sell, buyUpgrade, claimQuest, unlockPlot, buildGreenhouse, fulfillOrder, claimTask, refillWell, capacity, waterCapacity, plantYield, plantCapacity, readyCount, storedCount, saleValue, nextLevelXP, UPGRADE_INFO, upgradePrice } from './game.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const time = seconds => seconds < 60 ? `${Math.ceil(seconds)} сек` : `${Math.floor(seconds/60)} мин ${Math.ceil(seconds%60)} сек`;
const day = () => new Date().toISOString().slice(0,10);
let raw;
try { raw = localStorage.getItem(SAVE_KEY); } catch {}
let game = loadGame(raw);
const offline = advance(game);
let storageFailed = false, route = null, lastFocus = null, toastTimer, adDeadline = 0, adClaimed = true;
let telegram, lastSavedAt = 0;

function save() {
  try { localStorage.setItem(SAVE_KEY,JSON.stringify(game)); lastSavedAt=Date.now(); } catch { storageFailed = true; }
}
save();

function fit() {
  const viewport = $('viewport');
  const style = getComputedStyle(viewport);
  const w = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const h = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.min(w/768,h/1376,480/768);
  $('frame').style.width = `${768*scale}px`;
  $('frame').style.height = `${1376*scale}px`;
  $('garden').style.transform = `scale(${scale})`;
}
new ResizeObserver(fit).observe($('viewport'));
fit();

function initTelegram() {
  telegram = window.Telegram?.WebApp;
  if(!telegram?.initData) return;
  try {
    telegram.ready(); telegram.expand();
    telegram.setHeaderColor('#799b49'); telegram.setBackgroundColor('#31502b');
    const setSafeArea = () => {
      const a=telegram.safeAreaInset||{},b=telegram.contentSafeAreaInset||{};
      for(const side of ['top','right','bottom','left']) document.documentElement.style.setProperty(`--safe-${side}`,`${Math.max(a[side]||0,b[side]||0)}px`);
      fit();
    };
    setSafeArea();
    telegram.onEvent('safeAreaChanged',setSafeArea);
    telegram.onEvent('contentSafeAreaChanged',setSafeArea);
    telegram.onEvent('viewportChanged',fit);
    telegram.BackButton.onClick(close);
    telegram.onEvent('deactivated',save);
    telegram.onEvent('activated',resume);
  } catch {}
}
window.addEventListener('load',initTelegram,{once:true});
function haptic(type='light') { try { telegram?.HapticFeedback?.impactOccurred(type); } catch {} }
function toast(message) {
  $('toast').textContent=message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800);
}
function reward(text,x=385,y=640) {
  const el=document.createElement('span'); el.className='float-reward'; el.textContent=text;
  el.style.left=`${x}px`;el.style.top=`${y}px`;$('particles').append(el);
  setTimeout(()=>el.remove(),1150);
}
function button(label,action,extra='',kind='') { return `<button class="game-button ${kind}" data-action="${action}" ${extra}>${label}</button>`; }
function heading(title,subtitle='',eyebrow='Ваш уютный сад') { return `<span class="eyebrow">${eyebrow}</span><h1 id="sheet-title">${title}</h1>${subtitle?`<p class="subtitle">${subtitle}</p>`:''}`; }
function stats(entries) { return `<div class="stat-grid">${entries.map(([value,label])=>`<div class="stat"><b>${value}</b><small>${label}</small></div>`).join('')}</div>`; }
function progress(percent,water=false) { return `<div class="progress-track"><div class="progress-fill ${water?'water':''}" style="width:${Math.max(0,Math.min(100,percent))}%"></div></div>`; }
function refresh() {
  render(); save();
  if(route) {
    const active=document.activeElement;
    const action=active?.dataset.action,key=active?.dataset.key,id=active?.dataset.id;
    const hadFocus=$('sheet').contains(active);
    const scroll=$('sheet-content').scrollTop;
    renderSheet();
    $('sheet-content').scrollTop=scroll;
    if(hadFocus) {
      const replacement=[...$('sheet').querySelectorAll('button:not(:disabled)')].find(el=>el.dataset.action===action&&el.dataset.key===key&&el.dataset.id===id);
      (replacement||$('sheet')).focus({preventScroll:true});
    }
  }
}

function render() {
  const coin=$('coin-count'); coin.hidden=game.coins===1240; coin.textContent=fmt(game.coins);
  const cr=$('cr-count'); cr.hidden=game.cr===45; cr.textContent=fmt(game.cr);
  $('level-count').hidden=game.level===5; $('level-count').textContent=game.level;
  const xp=$('xp-fill'); xp.hidden=game.level===5&&game.xp===40;
  const percent=Math.min(100,game.xp/nextLevelXP(game)*100);
  xp.style.width='151px'; xp.style.background=`linear-gradient(to right,#ffd453 ${percent}%,#b48254 ${percent}%)`;
  document.querySelector('.coins-hit').setAttribute('aria-label',`Монеты: ${game.coins}. Открыть склад`);
  document.querySelector('.profile-hit').setAttribute('aria-label',`Профиль садовода, уровень ${game.level}`);
  const count=readyCount(game), ready=$('ready-caption');
  ready.hidden=count===3;
  ready.textContent=count ? `Готово к сбору · ${count} ${count===1?'растение':count<5?'растения':'растений'}` : 'Сад растёт · скоро новый урожай';
  $('quest-progress').hidden=!game.questDone; $('quest-progress').textContent='1/1';
  $('quest-complete').hidden=!game.questDone;
  $('quest-complete').textContent=game.questClaimed?'Первый урожай — выполнено!':'Первый урожай · награда!';
  document.querySelector('.quest-hit').setAttribute('aria-label',`Задание: первый ягодный урожай, ${game.questDone?'1':'0'} из 1`);
  const p3=game.plots[3]; $('plant-button-state').hidden=!p3.plant;
  $('plant-button-state').textContent=p3.ready?'Собрать':'Растёт';
  document.querySelectorAll('.plot-hit').forEach(el=>{
    const p=game.plots[Number(el.dataset.id)],type=plantById(p.plant);
    el.setAttribute('aria-label',p.locked?'Закрытая грядка':!type?'Свободная грядка, посадить':`${type.name}, ${p.ready?'готово к сбору':`до урожая ${time(type.time-p.elapsed)}`}`);
    el.classList.toggle('selected',route?.type==='plot'&&route.id===p.id);
  });
  const positions=[[289,573],[123,662],[465,647],[356,743],[630,727],[466,836]];
  let effects='';
  if(game.visualChanges.includes(2)&&!game.plots[2].ready) effects+='<div class="harvest-canopy"></div>';
  if(game.plots[3].plant) effects+=`<div class="new-plant" style="transform:scale(${.8+Math.min(1,game.plots[3].elapsed/plantById(game.plots[3].plant).time)*.8})"></div>`;
  if(!game.plots[5].locked) effects+='<div class="plot-lock-open">🌱</div>';
  for(const id of game.visualChanges) {
    const p=game.plots[id]; if(!p?.plant||id>5) continue;
    const type=plantById(p.plant),[x,y]=positions[id];
    effects+=`<div class="plot-badge ${p.ready?'ready':''}" style="left:${x}px;top:${y}px">${p.ready?'🧺 Готово':!p.watered?'Пауза':time(type.time-p.elapsed)}</div>`;
  }
  if(game.visualChanges.includes(4)&&!game.plots[4].ready) effects+='<div style="position:absolute;left:645px;top:561px;width:47px;height:47px;border-radius:50%;background:#fff3d5;font-size:34px;text-align:center">🌱</div>';
  if(game.upgrades.irrigation) effects+='<div class="plot-badge" style="left:348px;top:407px">💧 Авто</div>';
  if(game.greenhouse) effects+='<div class="plot-badge" style="left:611px;top:482px">🏡 Открыта</div>';
  $('plant-effects').innerHTML=effects;
}

function open(type,params={}) {
  if($('modal-root').hidden) lastFocus=document.activeElement;
  route={type,...params}; $('modal-root').hidden=false;
  renderSheet(); render();
  $('sheet').focus({preventScroll:true});
  try { telegram?.BackButton?.show(); } catch {}
}
function close() {
  route=null; $('modal-root').hidden=true;
  document.querySelectorAll('.nav-hit').forEach((el,i)=>{if(i===0)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  render();
  try {telegram?.BackButton?.hide();} catch {}
  if(lastFocus?.isConnected) lastFocus.focus({preventScroll:true});
}

function seedCard(p,plotId) {
  const locked=game.level<p.level;
  return `<button class="plant-card ${locked?'locked':''}" data-action="seed" data-id="${plotId}" data-plant="${p.id}" ${locked?'disabled':''}><span class="plant-emoji">${p.icon}</span><strong>${p.name}</strong><small>${p.trait}</small><small>⏱ ${time(p.time)} · 🧺 ${p.yield+game.upgrades.yield*2} плодов</small><small>💧 ${p.water}/сек · ${p.price} монет за плод</small><span class="price">${locked?`🔒 Уровень ${p.level}`:`🪙 ${p.cost} · посадить`}</span></button>`;
}
function renderSheet() {
  if(!route) return;
  let html='';
  switch(route.type) {
    case 'seeds': {
      html=heading('Что посадим?','Многолетние растения остаются в саду после сбора.','Новая жизнь на грядке');
      html+=`<div class="resource-line">🪙 ${fmt(game.coins)} монет · 💧 ${Math.floor(game.water)} / ${waterCapacity(game)} воды</div><div class="plant-grid">${PLANTS.map(p=>seedCard(p,route.id)).join('')}</div>`;
      break;
    }
    case 'plants': {
      html=heading('Коллекция растений',`Открыто ${Object.keys(game.collection).length} из ${PLANTS.length} сортов. У каждого — свой характер.`,'Альбом садовода');
      html+=`<div class="plant-grid">${PLANTS.map(p=>{const stage=game.collection[p.id]||0;return `<button class="plant-card ${!stage?'locked':''}" data-action="plant-info" data-plant="${p.id}"><span class="plant-emoji">${stage?p.icon:'🔒'}</span><strong>${p.name}</strong><small>${p.trait}</small><small>${['Не открыт', '✓ Посажен · растёт', '✓ Выращен до взрослого', '✓ Первый урожай собран'][stage]||'Первый урожай собран'}</small><span class="price">${stage?'О сорте →':`Уровень ${p.level}`}</span></button>`;}).join('')}</div>`;
      break;
    }
    case 'plant-info': {
      const p=plantById(route.plant);
      html=heading(p.name,p.trait,'Коллекция растений')+`<div class="plant-hero">${p.icon}</div>`+stats([[time(p.time),'до урожая'],[p.yield+game.upgrades.yield*2,'плодов за сбор'],[p.price,'монет за плод']]);
      html+=`<div class="panel"><strong>${p.category}</strong><p>Расход воды: ${p.water}/сек. Стоимость посадки: ${p.cost} монет. Доступно с уровня ${p.level}.</p><small>После сбора растение сохраняется и начинает новый цикл. Плоды не пропадают, если вы долго не заходите.</small></div>`;
      html+=button('Посадить на свободную грядку','plant','','full');
      break;
    }
    case 'plot': {
      const p=game.plots[route.id],type=plantById(p.plant);
      html=heading(type.name,p.adult?'Многолетнее растение · новый урожай впереди':'Маленький росток становится большим растением',`Грядка ${p.id+1}`);
      html+=`<div class="plant-hero">${type.icon}</div><div id="plot-live">${plotLive(p)}</div>`;
      html+=stats([[plantYield(game,p),'плодов за сбор'],[plantCapacity(game),'хранится урожаев'],[type.water,'воды / сек']]);
      html+=button(p.watered?'Приостановить полив':'Включить полив','toggle-water',`data-id="${p.id}"`,'secondary full');
      html+=button('Улучшить растения','upgrades','','full');
      break;
    }
    case 'storage': {
      const total=storedCount(game),value=saleValue(game);
      html=heading('Корзина урожая','Продавайте плоды или сохраняйте их для заказов.','Собрано с любовью');
      html+=`<div class="row resource-line"><span>📦 ${total} / ${capacity(game)} мест</span><span>🪙 ${fmt(game.coins)}</span></div>${progress(total/capacity(game)*100)}`;
      if(total) html+=PLANTS.filter(p=>game.inventory[p.id]>0).map(p=>`<div class="panel row"><span class="icon">${p.icon}</span><div style="flex:1"><strong>${p.name}</strong><p>${game.inventory[p.id]} плодов × ${p.price} монет</p></div><strong>${fmt(game.inventory[p.id]*p.price)} 🪙</strong></div>`).join('');
      else html+='<div class="empty-state"><span class="plant-emoji">🧺</span><p>Корзина пока пуста</p><small>Нажмите на зрелое растение или «Собрать урожай» в саду.</small></div>';
      html+=button(`Продать всё · ${fmt(value)} 🪙`,'sell',total?'':'disabled','full');
      html+=button('Заказы пекарни','tasks','','secondary full');
      break;
    }
    case 'upgrades': {
      html=heading('Сад становится лучше','Больше урожая, больше запаса и меньше забот.','Мастерская садовода');
      html+=`<div class="resource-line">Доступно ${fmt(game.coins)} 🪙</div>`;
      html+=Object.entries(UPGRADE_INFO).map(([key,u])=>{const installed=u.max&&game.upgrades[key]>=u.max;return `<div class="panel"><div class="row"><span class="icon">${u.icon}</span><div style="flex:1"><strong>${u.name}</strong><p>${u.description}</p><small>${installed?'✓ Работает и пока вас нет':`Уровень ${game.upgrades[key]} → ${game.upgrades[key]+1}`}</small></div></div>${button(installed?'Установлено':`Улучшить · ${fmt(upgradePrice(game,key))} 🪙`,'buy-upgrade',`data-key="${key}" ${installed?'disabled':''}`,'full')}</div>`;}).join('');
      break;
    }
    case 'water': {
      const cap=waterCapacity(game),cool=Math.max(0,60-(Date.now()-game.wellAt)/1000);
      html=heading('Вода для вашего сада','Вода поступает в общий резервуар и питает растения.','Каждая капля — новая жизнь');
      html+='<div class="plant-hero">💧</div>';
      html+=`<div id="water-live">${waterLive()}</div><div class="panel"><strong>Свежая вода из колодца</strong><p>Бесплатно +25 воды. Колодец наполняется раз в минуту.</p>${button(cool>0?`Наполняется · ${time(cool)}`:'Набрать воду · +25 💧','well',cool>0||game.water>=cap?'disabled':'','full')}</div>`;
      html+=`<div class="panel"><span class="pill">Демонстрация рекламы</span><p>Дополнительные 60 воды за добровольный просмотр. В прототипе — трёхсекундная имитация, без рекламной сети.</p>${button('Демо просмотра · +60 💧','ad-start',game.water>=cap?'disabled':'','gold full')}</div>`;
      html+=button('Улучшить резервуар','upgrades','','secondary full');
      break;
    }
    case 'ad': {
      const remaining=Math.max(0,(adDeadline-Date.now())/1000);
      html=heading('Короткая пауза для сада','Это демонстрация добровольного рекламного предложения.','Демо · без настоящей рекламы');
      html+='<div class="plant-hero">🌦️</div><p style="text-align:center">После завершения — 60 единиц воды.</p>';
      html+=`<div id="ad-live">${adLive(remaining)}</div><small>Можно закрыть окно в любой момент. Основная игра доступна без просмотра.</small>`;
      break;
    }
    case 'quest': {
      html=heading('Первый ягодный урожай','Вырастите ягодный куст и соберите с него плоды.','Маленькая цель — большой сад');
      html+='<div class="plant-hero">🫐</div>';
      html+=`<div class="panel"><div class="row"><strong>Собрать первый ягодный урожай</strong><span class="task-check">${game.questDone?'✓':'0/1'}</span></div>${progress(game.questDone?100:0)}<p>Награда: 150 монет и 30 опыта.</p>${button(game.questClaimed?'Награда получена':game.questDone?'Забрать награду · 150 🪙':'Перейти в сад',game.questDone?'claim-quest':'garden',game.questClaimed?'disabled':'','full')}</div>`;
      break;
    }
    case 'tasks': {
      html=heading('Задания и заказы','Небольшие цели для большого и красивого сада.','Есть чем заняться');
      html+=`<div class="panel"><strong>🫐 Первый ягодный урожай</strong><p>${game.questClaimed?'✓ Награда получена':game.questDone?'Всё готово — заберите награду!':'Соберите плоды с ягодного куста.'}</p>${button(game.questClaimed?'Выполнено':game.questDone?'Забрать · 150 🪙':'Подробнее',game.questDone?'claim-quest':'quest',game.questClaimed?'disabled':'','full')}</div>`;
      const tasks=[['harvest','Собрать 15 плодов',Math.min(15,game.fruitsHarvested),15],['upgrade','Купить первое улучшение',Object.values(game.upgrades).some(n=>n>0)?1:0,1],['collection','Посадить 5 разных сортов',Object.keys(game.collection).length,5]];
      html+='<h2>Достижения сада</h2>'+tasks.map(([id,title,n,total])=>`<div class="panel"><div class="row"><strong>${title}</strong><span class="pill">${n}/${total}</span></div>${progress(n/total*100)}${button(game.taskClaims.includes(id)?'Награда получена':'Забрать · 100 🪙','claim-task',`data-key="${id}" ${n<total||game.taskClaims.includes(id)?'disabled':''}`,'full')}</div>`).join('');
      html+=`<h2>Заказ от пекарни</h2><div class="panel"><strong>🥧 Ягодный пирог к чаепитию</strong><p>Золотая малина: ${game.inventory.golden||0}/6<br>Мята: ${game.inventory.mint||0}/4</p><small>Без ограничения по времени. Награда: 220 монет и 25 опыта.</small>${button(game.orderDone?'Заказ доставлен':'Передать урожай · 220 🪙','fulfill-order',game.orderDone||(game.inventory.golden||0)<6||(game.inventory.mint||0)<4?'disabled':'','gold full')}</div>`;
      break;
    }
    case 'expand': {
      html=heading('Ещё место для зелени','Откройте шестую грядку и посадите новый сорт.','Расширение сада');
      html+='<div class="plant-hero">🌱</div>';
      html+=`<div class="panel"><strong>Новая просторная грядка</strong><p>${game.questDone?'✓ Первый ягодный урожай собран':'Сначала соберите первый ягодный урожай.'}</p><small>Стоимость открытия: 450 монет.</small>${button('Открыть грядку · 450 🪙','unlock',!game.questDone?'disabled':'','full')}</div>`;
      break;
    }
    case 'greenhouse': {
      html=heading('Солнечная теплица',game.greenhouse?'Три уютные грядки для вашей коллекции.':'Больше места для любимых растений.','Тёплый уголок сада');
      html+='<div class="plant-hero">🏡</div>';
      if(game.greenhouse) html+=game.plots.filter(p=>p.id>=6).map(p=>{const type=plantById(p.plant);return `<div class="panel row"><span class="icon">${type?.icon||'🌱'}</span><div style="flex:1"><strong>${type?.name||`Грядка ${p.id-5}`}</strong><p>${type?(p.ready?'Урожай готов':`Растёт · ${time(type.time-p.elapsed)}`):'Здесь может вырасти что-то прекрасное'}</p></div>${button(type?(p.ready?'Собрать':'Уход'):'Посадить','plot',`data-id="${p.id}"`)}</div>`;}).join('');
      else html+=`<div class="panel"><strong>Три новые посадочные грядки</strong><p>Открывается на уровне 6. Уже развитый сад сохраняется.</p>${button('Построить · 900 🪙','build-greenhouse',game.level<6?'disabled':'','full')}</div>`;
      break;
    }
    case 'wallet': {
      html=heading('Кошелёк садовода','Ресурсы вашего маленького мира.','Всё на своих местах');
      html+=`<div class="panel"><div class="row"><span class="icon">🪙</span><strong>Игровые монеты</strong></div><div class="balance">${fmt(game.coins)}</div><p style="text-align:center">Для растений, улучшений и новых грядок</p>${button('Открыть склад и продать урожай','storage','','full')}</div>`;
      html+=`<div class="panel"><div class="row"><span class="icon">🔵</span><strong>Наградная валюта CR</strong></div><div class="balance" style="color:#51869c">${fmt(game.cr)} CR</div><small>Демонстрационный баланс из референса. Урожай и игровые монеты не превращаются в CR. Пополнение и вывод в прототипе не подключены.</small></div>`;
      break;
    }
    case 'friends': {
      html=heading('Сад расцветает с друзьями','Посмотрите, каким может быть соседский сад.','Друзья и добрые дела');
      html+='<span class="pill">Демонстрационный раздел</span><div class="plant-hero">🧑‍🌾</div>';
      html+=`<div class="panel row"><span class="icon">👩‍🌾</span><div style="flex:1"><strong>Сад Ани</strong><p>Уровень 7 · 6 сортов</p></div>${button('В гости','visit')}</div>`;
      html+=`<div class="panel"><strong>Маленькая помощь</strong><p>Один добрый поступок в день — и сад становится теплее. В демо за помощь вы получите 30 монет.</p>${button(game.helpDay===day()?'Сегодня уже помогли':'Помочь соседскому саду · +30 🪙','help',game.helpDay===day()?'disabled':'','full')}</div><p class="note">Подключение настоящих друзей и приглашений через Telegram — следующий этап.</p>`;
      break;
    }
    case 'visit': {
      html=heading('В гостях у Ани','Знакомство с будущими соседскими садами.','Демонстрационный сад');
      html+='<div class="plant-hero">🏡</div><div style="font-size:65px;line-height:1.6;text-align:center">🍓 🌿 🍋<br>🪻 🍅 🫐</div><p style="text-align:center">Солнечный уголок с лавандой и лимонным деревом.</p>';
      html+=button(game.helpDay===day()?'Вы уже помогли сегодня':'Помочь саду · +30 🪙','help',game.helpDay===day()?'disabled':'','full');
      break;
    }
    case 'profile': {
      html=heading('Хранитель маленького сада','Каждая посадка — новый шаг вперёд.','Профиль садовода');
      html+='<div class="avatar"></div>';
      html+=stats([[game.level,'уровень'],[Object.keys(game.collection).length,'сортов открыто'],[game.fruitsHarvested,'плодов собрано']]);
      html+=`<div class="panel"><div class="row"><strong>До уровня ${game.level+1}</strong><span class="pill">${game.xp} / ${nextLevelXP(game)} XP</span></div>${progress(game.xp/nextLevelXP(game)*100)}<p>Опыт дают сбор урожая, улучшения и задания.</p></div>`;
      html+=button(game.dailyGiftDay===day()?'Подарок сегодня получен':'Ежедневный подарок · +50 🪙','daily-gift',game.dailyGiftDay===day()?'disabled':'','gold full');
      html+='<p class="note">Прогресс этого прототипа сохраняется на данном устройстве. Начальный сад — демонстрация пятого уровня.</p>';
      break;
    }
    case 'offline': {
      const r=route.report;
      html=heading('Пока вас не было','Сад продолжал жить в своём спокойном ритме.','Рады видеть вас снова');
      html+='<div class="plant-hero">🌤️</div>';
      html+=stats([[time(r.seconds),'вы отсутствовали'],[r.produced,'плодов созрело'],[r.collected,'собрано автоматически']]);
      const full=storedCount(game)>=capacity(game),water=game.water<1;
      html+=`<p>${full?'Склад заполнился. Продайте плоды, чтобы освободить место.':water?'Воды осталось мало. Пополните резервуар для дальнейшего роста.':readyCount(game)?'Урожай ждёт вас на грядках. Созревшие плоды никуда не пропадают.':'Растения подросли. Скоро появится новый урожай.'}</p>`;
      html+=button('Вернуться в сад','garden','','full');
      break;
    }
  }
  $('sheet-content').innerHTML=html;
}
function plotLive(p) {
  const type=plantById(p.plant),pct=p.ready?100:p.elapsed/type.time*100;
  return `<div class="panel"><div class="row"><strong>${p.ready?'Урожай готов':!p.watered?'Полив приостановлен':game.water<.5?'Ожидает поступления воды':'Растёт с каждой минутой'}</strong><span class="pill">${p.ready?`${p.ready} 🧺`:time(type.time-p.elapsed)}</span></div>${progress(pct)}${p.ready?button('Собрать урожай','harvest-plot',`data-id="${p.id}"`,'full'):'<small>Собирать можно нажатием на растение в саду.</small>'}</div>`;
}
function waterLive() { return `<div class="row"><strong style="font-size:34px">${Math.floor(game.water)} / ${waterCapacity(game)}</strong><small>+${(.08+game.upgrades.recovery*.04).toFixed(2)} воды / сек</small></div>${progress(game.water/waterCapacity(game)*100,true)}`; }
function adLive(remaining) { return `${progress((1-remaining/3)*100)}${button(remaining>0?`Дождик собирается · ${Math.ceil(remaining)} сек`:'Забрать 60 воды','ad-claim',remaining>0?'disabled':'','gold full')}<p style="text-align:center;font-size:21px;color:#9c794f">CR за это предложение не начисляются</p>`; }

function performHarvest(id=null) {
  const wasReady=readyCount(game),n=harvest(game,id);
  if(n) { haptic('medium'); reward(`+${n} 🧺`); toast(`В корзине +${n} плодов. Продать можно на складе`); }
  else toast(wasReady?'Корзина не вмещает урожай. Освободите место на складе':'Растения ещё растут. Урожай скоро будет готов');
  refresh();
}
function showPlanting(preferred=null) {
  const p=game.plots.find(p=>!p.locked&&!p.plant&&(preferred===null||p.id===preferred));
  if(p) open('seeds',{id:p.id});
  else { toast('Свободных грядок нет. Откройте новый участок или теплицу'); open('greenhouse'); }
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]'); if(!target||target.disabled) return;
  const action=target.dataset.action,id=Number(target.dataset.id),key=target.dataset.key;
  advance(game); haptic();
  if(target.classList.contains('nav-hit')) document.querySelectorAll('.nav-hit').forEach(el=>{if(el===target)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  switch(action) {
    case 'close':case 'garden': close();break;
    case 'profile':case 'plants':case 'tasks':case 'friends':case 'wallet':case 'storage':case 'upgrades':case 'water':case 'quest':case 'greenhouse':case 'visit': open(action);break;
    case 'plant-info':open('plant-info',{plant:target.dataset.plant});break;
    case 'plot': {
      const p=game.plots[id]; if(!p)break;
      if(p.locked)open('expand');else if(!p.plant)showPlanting(id);else if(p.ready)performHarvest(id);else open('plot',{id});
      break;
    }
    case 'plant':showPlanting();break;
    case 'seed': {
      const result=plant(game,id,target.dataset.plant); if(result.ok) {close();reward('🌱',330,700);}toast(result.message);break;
    }
    case 'harvest':performHarvest();break;
    case 'harvest-plot':performHarvest(id);break;
    case 'sell': {const result=sell(game);if(result.count){reward(`+${result.amount} 🪙`,370,550);toast(`Продано ${result.count} плодов за ${result.amount} монет`);}else toast('Сначала соберите урожай');break;}
    case 'buy-upgrade': {const result=buyUpgrade(game,key);toast(result.message);if(result.ok)reward('✓ Улучшено',340,600);break;}
    case 'claim-quest':if(claimQuest(game)){reward('+150 🪙',350,460);toast('Первый урожай! +150 монет и 30 опыта');}break;
    case 'claim-task':if(claimTask(game,key)){reward('+100 🪙',350,460);toast('Достижение выполнено! +100 монет');}break;
    case 'fulfill-order':if(fulfillOrder(game)){reward('+220 🪙',350,460);toast('Пекарня благодарит за свежий урожай!');}break;
    case 'unlock':{const r=unlockPlot(game);toast(r.message);if(r.ok)open('seeds',{id:r.id});break;}
    case 'build-greenhouse':{const r=buildGreenhouse(game);toast(r.message);if(r.ok)open('greenhouse');break;}
    case 'toggle-water':game.plots[id].watered=!game.plots[id].watered;toast(game.plots[id].watered?'Полив включён':'Полив приостановлен');break;
    case 'well':toast(refillWell(game).message);break;
    case 'ad-start':adDeadline=Date.now()+3000;adClaimed=false;open('ad');break;
    case 'ad-claim':if(!adClaimed&&Date.now()>=adDeadline){adClaimed=true;const n=Math.min(60,waterCapacity(game)-game.water);game.water+=n;toast(`Демо завершено: +${Math.round(n)} воды`);open('water');}break;
    case 'help':if(game.helpDay!==day()){game.helpDay=day();game.coins+=30;toast('Сад полит! Спасибо за заботу · +30 монет');}break;
    case 'daily-gift':if(game.dailyGiftDay!==day()){game.dailyGiftDay=day();game.coins+=50;toast('Хорошего дня в саду! +50 монет');}break;
  }
  refresh();
});

document.addEventListener('keydown',event=>{
  if($('modal-root').hidden)return;
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.key!=='Tab')return;
  const buttons=[...$('sheet').querySelectorAll('button:not(:disabled),[tabindex="0"]')];
  if(!buttons.length){event.preventDefault();$('sheet').focus();return;}
  const first=buttons[0],last=buttons.at(-1);
  const outside=!$('sheet').contains(document.activeElement);
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===$('sheet')||outside)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===$('sheet')||outside)){event.preventDefault();first.focus();}
});

function tick() {
  if(document.hidden)return;
  const before=readyCount(game); advance(game); render();
  if(route?.type==='plot'&&$('plot-live')&&!$('plot-live').contains(document.activeElement)) $('plot-live').innerHTML=plotLive(game.plots[route.id]);
  if(route?.type==='water') {
    if($('water-live'))$('water-live').innerHTML=waterLive();
    const well=document.querySelector('[data-action="well"]'),cool=Math.max(0,60-(Date.now()-game.wellAt)/1000);
    if(well){well.disabled=cool>0||game.water>=waterCapacity(game);well.textContent=cool>0?`Наполняется · ${time(cool)}`:'Набрать воду · +25 💧';}
  }
  if(route?.type==='ad'&&$('ad-live'))$('ad-live').innerHTML=adLive(Math.max(0,(adDeadline-Date.now())/1000));
  if(route?.type==='greenhouse'&&before!==readyCount(game))renderSheet();
  if(Date.now()-lastSavedAt>=5000)save();
}
function resume() {
  const report=advance(game);render();save();
  if(report.seconds>30&&(report.produced||report.collected))open('offline',{report});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){advance(game);save();}else resume();});
window.addEventListener('pagehide',()=>{advance(game);save();});
setInterval(tick,1000);
window.addEventListener('storage',event=>{
  if(event.key===SAVE_KEY&&event.newValue){game=loadGame(event.newValue);advance(game);render();if(route)renderSheet();}
});
render();
if(offline.seconds>30&&(offline.produced||offline.collected))open('offline',{report:offline});
if(storageFailed)setTimeout(()=>toast('Браузер не разрешил сохранение. Прогресс доступен до закрытия этой страницы'),1500);
