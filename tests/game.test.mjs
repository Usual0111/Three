import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,plant,harvest,sell,claimQuest,buyUpgrade,unlockPlot,buildGreenhouse,loadGame,capacity,storedCount,waterCapacity,refillWell,fulfillOrder,claimTask} from '../dist/game.js';
const T=1_000_000;

test('the demonstration starts with the three harvestable plants in the reference',()=>{
  const s=createGame(T);
  assert.equal(s.plots.filter(p=>p.ready).length,3);
  assert.equal(s.coins,1240);assert.equal(s.cr,45);assert.equal(s.level,5);
});
test('harvest enters storage, sale produces coins, and plants stay planted',()=>{
  const s=createGame(T),coins=s.coins;
  assert.equal(harvest(s),16);assert.equal(storedCount(s),16);assert.equal(s.coins,coins);
  assert.equal(s.plots[2].plant,'golden');assert.equal(s.plots[2].ready,0);
  assert.equal(harvest(s),0);
  const sale=sell(s);assert.equal(sale.amount,214);assert.equal(s.coins,1454);assert.equal(storedCount(s),0);
  assert.equal(s.cr,45);
});
test('planting charges once and rejects an occupied plot',()=>{
  const s=createGame(T);
  assert.equal(plant(s,3,'strawberry').ok,true);assert.equal(s.coins,1200);
  assert.equal(plant(s,3,'mint').ok,false);assert.equal(s.coins,1200);
  assert.equal(plant(s,5,'mint').ok,false);
  assert.equal(plant(s,3,'invalid').ok,false);
});
test('offline time matures a plant only once when its capacity is one',()=>{
  const s=createGame(T);plant(s,3,'mint');
  const r=advance(s,T+3600_000);
  assert.equal(s.plots[3].ready,1);assert.ok(r.produced>0);
  const snap=JSON.stringify(s);const second=advance(s,T+3600_000);
  assert.equal(second.produced,0);assert.equal(second.collected,0);assert.equal(JSON.stringify(s),snap);
});
test('full plants stop consuming water and keep their fruit during long absence',()=>{
  const s=createGame(T);s.plots[1].ready=1;
  advance(s,T+30*86400_000);
  assert.equal(s.water,waterCapacity(s));assert.equal(s.plots[2].ready,1);
});
test('manual pause preserves growth and resumes after enabling water',()=>{
  const s=createGame(T);const p=s.plots[1];p.watered=false;
  advance(s,T+100_000);assert.equal(p.elapsed,12);assert.equal(p.ready,0);
  p.watered=true;advance(s,T+200_000);assert.equal(p.ready,1);
});
test('full storage cannot destroy or duplicate a harvest',()=>{
  const s=createGame(T);s.inventory.strawberry=capacity(s)-1;
  const before=s.plots[2].ready;assert.equal(harvest(s,2),0);
  assert.equal(s.plots[2].ready,before);assert.equal(storedCount(s),159);
  sell(s);assert.equal(harvest(s,2),6);
});
test('automatic collection runs offline and is bounded by storage',()=>{
  const s=createGame(T);s.upgrades.autoCollect=1;s.upgrades.recovery=3;
  const r=advance(s,T+24*3600_000);
  assert.ok(r.collected>16);assert.ok(storedCount(s)<=capacity(s));
  const count=storedCount(s);advance(s,T+24*3600_000);assert.equal(storedCount(s),count);
});
test('quest and achievement rewards cannot be claimed twice',()=>{
  const s=createGame(T);assert.equal(claimQuest(s),false);
  harvest(s);const coins=s.coins;assert.equal(claimQuest(s),true);assert.equal(s.coins,coins+150);
  assert.equal(claimQuest(s),false);assert.equal(claimTask(s,'harvest'),true);assert.equal(claimTask(s,'harvest'),false);
});
test('upgrades charge the advertised price and single-use automation cannot be repurchased',()=>{
  const s=createGame(T);assert.equal(buyUpgrade(s,'autoCollect').ok,true);assert.equal(s.coins,640);
  assert.equal(buyUpgrade(s,'autoCollect').ok,false);assert.equal(s.coins,640);
  assert.equal(buyUpgrade(s,'tank').ok,true);assert.equal(waterCapacity(s),180);
});
test('expansion checks conditions and greenhouse creates exactly three plots',()=>{
  const s=createGame(T);assert.equal(unlockPlot(s).ok,false);harvest(s,2);
  assert.equal(unlockPlot(s).ok,true);assert.equal(s.plots[5].locked,false);
  s.level=6;s.coins=900;assert.equal(buildGreenhouse(s).ok,true);assert.equal(s.plots.length,9);
  assert.equal(buildGreenhouse(s).ok,false);assert.equal(s.plots.length,9);
});
test('orders consume inventory and grant their reward once',()=>{
  const s=createGame(T);assert.equal(fulfillOrder(s),false);harvest(s);const coins=s.coins;
  assert.equal(fulfillOrder(s),true);assert.equal(s.coins,coins+220);assert.equal(fulfillOrder(s),false);
  assert.equal(s.inventory.golden,0);assert.equal(s.inventory.mint,0);
});
test('well cooldown is enforced and refill respects reservoir capacity',()=>{
  const s=createGame(T);s.water=119;
  assert.equal(refillWell(s,T).ok,true);assert.equal(s.water,120);s.water=50;
  assert.equal(refillWell(s,T+1000).ok,false);assert.equal(refillWell(s,T+60000).ok,true);assert.equal(s.water,75);
});
test('save round-trip preserves progress and malformed saves recover safely',()=>{
  const s=createGame(T);harvest(s,2);const saved=JSON.stringify(s);
  assert.deepEqual(loadGame(saved,T),s);
  assert.deepEqual(loadGame('{invalid',T),createGame(T));
  const bad=JSON.parse(saved);bad.plots[0].plant='not-a-plant';
  assert.deepEqual(loadGame(JSON.stringify(bad),T),createGame(T));
});
test('a clock moving backwards cannot create additional growth',()=>{
  const s=createGame(T),before=JSON.stringify(s);advance(s,T-10000);assert.equal(JSON.stringify(s),before);
});
