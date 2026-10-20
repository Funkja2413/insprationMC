const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {summarize}=require('../presentation.js');
const cases=require('../data/cases.json').cases;
const find=id=>{
  const c=cases.find(c=>c.id===id);
  assert.ok(c,'Existing regression case: '+id);
  return c;
};
const summary=id=>summarize(find(id));

test('CoCo summarizes the actual cooking task and restaurant industry',()=>{
  assert.deepEqual(summary('coco-ichibanya-curry-gokko-2026'),{mechanic:'烹饪模拟玩法',industry:'餐饮品牌'});
});
test('Specific puzzle, memory and card mechanics remain distinguishable',()=>{
  for(const [id,mechanic] of [
    ['google-io-prism-shift-2025','光路解谜玩法'],
    ['nisshin-oillio-draw-magic-2026','画线解谜玩法'],
    ['ogawa-tent-memory-2026','翻牌记忆玩法'],
    ['google-gemini-escape-room-2024','密室逃脱玩法'],
    ['firefox-data-war-card-game','卡牌对战玩法'],
    ['bandai-chousenshi-wafer-kaifu','集卡收集玩法']
  ])assert.equal(summary(id).mechanic,mechanic,id);
});
test('One game is not a collection, and unlock passwords do not override its mechanic',()=>{
  assert.equal(summary('twst-evolve-racer').mechanic,'跑酷避障玩法');
  assert.equal(summary('zepto-matki-phod').mechanic,'时机反应玩法');
  assert.equal(summary('tenten-malatang-game').mechanic,'滚动竞速玩法');
  assert.equal(summary('kayac-osechi-games-2026').mechanic,'小游戏合集玩法');
  assert.equal(summarize({format:'一个网页小游戏',why_zh:'在三车道跑酷，后来能用密码解锁赛车外观。'}).mechanic,'跑酷避障玩法');
});
test('Generic platforms defer to the concrete interaction in the existing description',()=>{
  for(const [id,mechanic] of [
    ['durex-pull-out-game-game','拦截防守玩法'],
    ['lacoste-polo-factory','机关互动玩法'],
    ['philips-oneblade-body-royale','生存战斗玩法'],
    ['samsung-galaxy-store-catch-the-drop','收集装扮玩法'],
    ['dg-velvet-installation','AI创作玩法']
  ])assert.equal(summary(id).mechanic,mechanic,id);
});
test('Product lines and leading brands outrank collaborators and brand-name collisions',()=>{
  for(const [id,industry] of [
    ['fantasanremo-odyssey-2025','音乐品牌'],
    ['hyundai-steel-alchemist-2024','工业品牌'],
    ['toyota-lf-hakohako-puzzle-2026','工业品牌'],
    ['mini-finance-ni-mini-beat','金融品牌'],
    ['omniscient-reader-ar-survival-2025','影视品牌'],
    ['clevo-hardest-farming','食品品牌'],
    ['bandai-chousenshi-wafer-kaifu','食品品牌'],
    ['google-play-zedd-playground','科技品牌'],
    ['oreo-oboy-cookie-downhill-2025','食品品牌'],
    ['just-eat-eliminate-2024','餐饮品牌'],
    ['la-revoltosa-burbuja-iberica','饮料品牌'],
    ['caloriemate-liquid-for-game-creators','食品品牌'],
    ['redbull-racing-full-send','体育品牌'],
    ['redbull-final-quest','饮料品牌'],
    ['hermes-tutti-twilly','美妆品牌'],
    ['hermes-horse-jump','时尚品牌'],
    ['bicqlo-vader-2012','零售品牌']
  ])assert.equal(summary(id).industry,industry,id);
});
test('Mechanic text, game platforms and prizes cannot change a known brand industry',()=>{
  assert.equal(summarize({brand:'Google',format:'食品烹饪与餐厅经营',tags:['食品品牌'],why_zh:'玩家赢得麦当劳奖励，在Roblox体验。'}).industry,'科技品牌');
  assert.equal(summarize({brand:'Unknown',why_zh:'奖品为Nike鞋和LEGO玩具，使用Google平台。'}).industry,'综合品牌');
});
test('All existing cases produce concise labels without altering case data',()=>{
  assert.ok(cases.length>=314,'Review includes all 314 baseline cases');
  const original=JSON.stringify(cases);
  for(const c of cases){
    const result=summarize(c);
    assert.deepEqual(Object.keys(result).sort(),['industry','mechanic']);
    assert.match(result.mechanic,/玩法$/u,c.id);
    assert.match(result.industry,/品牌$/u,c.id);
    assert.ok(result.mechanic.length<=12&&result.industry.length<=12,c.id);
    assert.notEqual(result.industry,'综合品牌','Existing brand has a reviewed classification: '+c.id);
    assert.deepEqual(summarize(c),result,'Deterministic summary: '+c.id);
  }
  assert.equal(JSON.stringify(cases),original);
});
test('Missing and malformed optional inputs use honest fallbacks',()=>{
  for(const c of [null,undefined,{},42,{brand:[],format:null,tags:'not-an-array',why_zh:{}}])
    assert.deepEqual(summarize(c),{mechanic:'互动探索玩法',industry:'综合品牌'});
  const c=Object.freeze({brand:'KFC',format:'',tags:Object.freeze(['接物',null]),why_zh:''});
  assert.deepEqual(summarize(c),{mechanic:'接物收集玩法',industry:'餐饮品牌'});
});
test('The browser global and CommonJS export return the same summaries',()=>{
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../presentation.js'),'utf8'),context);
  assert.equal(typeof context.window.InspoPresentation.summarize,'function');
  for(const c of cases)assert.equal(JSON.stringify(context.window.InspoPresentation.summarize(c)),JSON.stringify(summarize(c)));
});
