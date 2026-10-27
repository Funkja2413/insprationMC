const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const filters=require('../filters.js');
const {summarize}=require('../presentation.js');
const cases=require('../data/cases.json').cases;
const caseById=id=>{
  const c=cases.find(c=>c.id===id);
  assert.ok(c,'Existing regression case '+id);
  return c;
};

test('Filter options expose forty-eight specific gameplay groups and twelve unchanged industry groups',()=>{
  assert.equal(filters.gameplayGroups.length,48);
  assert.equal(filters.industryGroups.length,12);
  for(const groups of [filters.gameplayGroups,filters.industryGroups]){
    assert.equal(new Set(groups.map(g=>g.value)).size,groups.length);
    assert.ok(groups.every(g=>typeof g.value==='string'&&g.value&&typeof g.label==='string'&&g.label));
    assert.ok(groups.some(g=>g.value==='other'));
  }
});
test('Representative mechanics preserve meaningful boundaries',()=>{
  for(const [id,gameplay] of [
    ['twst-evolve-racer','runner'],
    ['google-play-diamond-castle-2024','platformer'],
    ['lipovitan-dx-street-fighter-2025','fighting'],
    ['volkswagen-track-day-challenge-2025','racing'],
    ['yellow-bucks-jungle-ops-2024','shooting'],
    ['redbull-final-quest','survival'],
    ['fanta-haunted-fanta-factory','action'],
    ['tesco-delivery-dash','driving'],
    ['cartier-fabulous-journey','flying'],
    ['zepto-matki-phod','reaction'],
    ['kfc-italia-nuggets-game-2025','catching'],
    ['nvidia-asdc-signs-2025','motion'],
    ['ouigo-lets-play','pinball'],
    ['msi-i-want-it-all-breaker','brick_breaker'],
    ['louis-poulsen-panthella-claw-machine','claw'],
    ['intertrend-building-snake-2025','snake'],
    ['glico-bifix-puyo-tansa-2025','match'],
    ['press-butter-sand-summer-merge','merge'],
    ['toyota-lf-hakohako-puzzle-2026','puzzle'],
    ['ogawa-tent-memory-2026','memory'],
    ['google-pixel-escape-2025','hidden_object'],
    ['world-hardest-captcha-2025','observation'],
    ['saga-pacman-tourism-2023','maze'],
    ['google-gemini-escape-room-2024','escape'],
    ['google-io-prism-shift-2025','logic'],
    ['sebach-mind-the-flush-2025','quiz'],
    ['crop-trust-bold-save-hassans-farm-2025','simulation'],
    ['coco-ichibanya-curry-gokko-2026','cooking'],
    ['caudex-days-konae','raising'],
    ['earth-gokilove-dating-sim','dating'],
    ['asus-rog-phone8-unboxing-mission-2024','narrative'],
    ['coastal-world-bank-islands','exploration'],
    ['kanro-candemina-muki-rpg','rpg'],
    ['coke-zero-hide-n-take','stealth'],
    ['kappa-the-quest-les-ardentes-2026','treasure'],
    ['bandai-chousenshi-wafer-kaifu','card_collection'],
    ['samsung-galaxy-store-catch-the-drop','creation'],
    ['monst-santa-jack-reindeer-interview','ai_dialogue'],
    ['maruchan-dekamaru-street-fighter-rhythm-2025','rhythm'],
    ['miumiu-nb-tiebreak','sports'],
    ['maxmara-camel-fabric-game','board_game'],
    ['firefox-data-war-card-game','card_battle'],
    ['netflix-its-whats-inside-game-2024','deduction'],
    ['asahi-dodecamin-roblox','multiplayer'],
    ['mentholatum-monster-mansion','cooperation'],
    ['kayac-osechi-games-2026','collection'],
    ['lacoste-polo-factory','mechanism']
  ])assert.equal(filters.classify(caseById(id)).gameplay,gameplay,id);
});
test('2D and 3D platformers stay separate from runners, and shared IP does not determine gameplay',()=>{
  for(const id of ['regina-net-zero-hero-2025','caloriemate-liquid-for-game-creators','beautyblender-play'])
    assert.equal(filters.classify(caseById(id)).gameplay,'platformer',id);
  for(const id of ['orange-giga-game-2024','cdiscount-jumping-max','twst-evolve-racer'])
    assert.equal(filters.classify(caseById(id)).gameplay,'runner',id);
  for(const [id,gameplay] of [
    ['maruchan-dekamaru-street-fighter-rhythm-2025','rhythm'],
    ['street-fighter-youtube-combo-challenge','rhythm'],
    ['pocky-ko-street-fighter-ii-2022','fighting'],
    ['sushiro-street-fighter-minigame-2024','fighting'],
    ['real-gold-street-fighter-2026','collection'],
    ['uniqlo-ut-adventure-2024','platformer']
  ])assert.equal(filters.classify(caseById(id)).gameplay,gameplay,id);
});
test('Industry groups retain the already reviewed brand and product-line distinctions',()=>{
  for(const [id,industry] of [
    ['oreo-oboy-cookie-downhill-2025','food'],
    ['jagermeister-ice-cold-justice-2025','food'],
    ['coco-ichibanya-curry-gokko-2026','dining'],
    ['google-play-zedd-playground','technology'],
    ['orange-giga-game-2024','technology'],
    ['miumiu-nb-tiebreak','fashion'],
    ['cdiscount-jumping-max','retail'],
    ['redbull-racing-full-send','entertainment'],
    ['redbull-final-quest','food'],
    ['uber-backseat-arcade-2025','mobility'],
    ['ogawa-tent-memory-2026','home'],
    ['durex-pull-out-game-game','health'],
    ['mini-finance-ni-mini-beat','finance'],
    ['crop-trust-bold-save-hassans-farm-2025','public'],
    ['toyota-lf-hakohako-puzzle-2026','other']
  ])assert.equal(filters.classify(caseById(id)).industry,industry,id);
});
test('Gameplay, industry, mobile and demo conditions combine with AND',()=>{
  const c={brand:'KFC',format:'跑酷',mobile:'yes',demo_url:'https://example.com/demo'};
  assert.equal(filters.matches(c),true);
  assert.equal(filters.matches(c,{}),true);
  assert.equal(filters.matches(c,{gameplay:'',industry:'',mobileOnly:false,demoOnly:false}),true);
  assert.equal(filters.matches(c,{gameplay:'runner',industry:'dining',mobileOnly:true,demoOnly:true}),true);
  for(const changes of [{gameplay:'puzzle'},{industry:'food'},{gameplay:'missing'},{industry:'missing'}]){
    assert.equal(filters.matches(c,{gameplay:'runner',industry:'dining',mobileOnly:true,demoOnly:true,...changes}),false);
  }
  assert.equal(filters.matches({...c,mobile:'historical'},{gameplay:'runner',industry:'dining',mobileOnly:true,demoOnly:true}),false);
  assert.equal(filters.matches({...c,demo_type:'puzzle_source'},{gameplay:'runner',industry:'dining',mobileOnly:true,demoOnly:true}),false);
});
test('Mobile remains limited to the exact yes status',()=>{
  for(const mobile of ['yes','partial','historical','no','YES',true,null,undefined]){
    assert.equal(filters.matches({mobile},{mobileOnly:true}),mobile==='yes');
    assert.equal(filters.matches({mobile},{mobileOnly:false}),true);
  }
});
test('Demo retains HTTP(S) entry and puzzle_source exclusion semantics',()=>{
  for(const demo_url of ['https://example.com/demo','http://example.com/demo','HTTPS://example.com/demo']){
    assert.equal(filters.matches({demo_url},{demoOnly:true}),true);
    assert.equal(filters.matches({demo_url,demo_type:'puzzle_source'},{demoOnly:true}),false);
  }
  for(const demo_url of ['',undefined,null,42,'/demo','//example.com/demo','javascript:alert(1)','data:text/html,example','演示待确认']){
    assert.equal(filters.matches({demo_url},{demoOnly:true}),false);
  }
  assert.equal(filters.matches(caseById('kfc-11-secrets-arg'),{demoOnly:true}),false);
});
test('All cases classify once per dimension without modifying existing data or summaries',()=>{
  assert.ok(cases.length>=314);
  const original=JSON.stringify(cases),before=cases.map(summarize);
  const gameplayValues=new Set(filters.gameplayGroups.map(g=>g.value));
  const industryValues=new Set(filters.industryGroups.map(g=>g.value));
  for(const c of cases){
    const result=filters.classify(c);
    const summary=summarize(c);
    assert.ok(gameplayValues.has(result.gameplay),c.id);
    assert.ok(industryValues.has(result.industry),c.id);
    assert.notEqual(result.gameplay,'other','Every existing mechanic has a specific category: '+c.id);
    if(result.industry==='other')assert.ok(['创意服务品牌','工业品牌','联名品牌','能源品牌'].includes(summary.industry),'No existing industry silently falls through: '+c.id);
    assert.equal(filters.gameplayGroups.filter(g=>filters.matches(c,{gameplay:g.value})).length,1,c.id);
    assert.equal(filters.industryGroups.filter(g=>filters.matches(c,{industry:g.value})).length,1,c.id);
    assert.equal(filters.matches(c,{}),true,c.id);
    assert.equal(filters.matches(c,{mobileOnly:true}),c.mobile==='yes',c.id);
    assert.equal(filters.matches(c,{demoOnly:true}),/^https?:\/\//i.test(c.demo_url||'')&&c.demo_type!=='puzzle_source',c.id);
  }
  assert.equal(JSON.stringify(cases),original);
  assert.deepEqual(cases.map(summarize),before);
});
test('Frozen inputs and absent optional arguments work without mutation',()=>{
  const c=Object.freeze({brand:'KFC',format:'跑酷',mobile:'yes',demo_url:'https://example.com/demo'});
  const selected=Object.freeze({gameplay:'runner',industry:'dining',mobileOnly:true,demoOnly:true});
  assert.equal(filters.matches(c,selected),true);
  assert.deepEqual(filters.classify(null),{gameplay:'exploration',industry:'other'});
  assert.equal(filters.matches(null,null),true);
});
test('Browser UMD and CommonJS use the same presentation dependency and decisions',()=>{
  const context={window:{}};
  for(const name of ['presentation.js','filters.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
  const browser=context.window.InspoFilters;
  assert.equal(JSON.stringify(browser.gameplayGroups),JSON.stringify(filters.gameplayGroups));
  assert.equal(JSON.stringify(browser.industryGroups),JSON.stringify(filters.industryGroups));
  assert.equal(JSON.stringify(browser.gameplayStats(cases)),JSON.stringify(filters.gameplayStats(cases)));
  for(const c of cases){
    assert.equal(JSON.stringify(browser.classify(c)),JSON.stringify(filters.classify(c)),c.id);
    assert.equal(browser.matches(c,{gameplay:'runner',mobileOnly:true}),filters.matches(c,{gameplay:'runner',mobileOnly:true}),c.id);
  }
});
test('Future unmapped summary labels safely stay in other groups',()=>{
  const context={window:{InspoPresentation:{summarize:()=>({mechanic:'未来新玩法',industry:'未来新品牌'})}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../filters.js'),'utf8'),context);
  assert.equal(JSON.stringify(context.window.InspoFilters.classify({})),JSON.stringify({gameplay:'other',industry:'other'}));
  const rows=context.window.InspoFilters.gameplayStats([{id:'future'}]);
  assert.equal(rows[0].value,'other');
  assert.equal(rows[0].count,1);
});

test('Gameplay statistics account for the entire supplied library once and sort by descending count',()=>{
  const stats=filters.gameplayStats(cases);
  assert.equal(stats.length,filters.gameplayGroups.length);
  assert.equal(new Set(stats.map(row=>row.value)).size,stats.length);
  assert.equal(stats.reduce((sum,row)=>sum+row.count,0),new Set(cases.map(c=>c.id)).size);
  for(let i=0;i<stats.length;i++){
    const row=stats[i];
    assert.deepEqual(Object.keys(row).sort(),['count','label','value']);
    assert.equal(row.count,cases.filter(c=>filters.classify(c).gameplay===row.value).length,row.value);
    assert.equal(row.label,filters.gameplayGroups.find(group=>group.value===row.value).label);
    if(i)assert.ok(stats[i-1].count>=row.count,'Descending counts');
  }
  assert.equal(stats.find(row=>row.value==='other').count,0);
});
test('All zero-count categories remain available, with taxonomy order for ties',()=>{
  const expected=filters.gameplayGroups.map(group=>({...group,count:0}));
  for(const input of [[],null,undefined,{},[null,undefined,42,'case',[]]])
    assert.deepEqual(filters.gameplayStats(input),expected);
  const tied=[
    {id:'platform-1',format:'平台跳跃'},
    {id:'fight-1',format:'格斗'},
    {id:'runner-1',format:'跑酷'},
    {id:'platform-2',format:'平台跳跃'},
    {id:'runner-2',format:'跑酷'}
  ];
  const stats=filters.gameplayStats(tied);
  assert.deepEqual(stats.slice(0,3).map(row=>[row.value,row.count]),[['runner',2],['platformer',2],['fighting',1]]);
  assert.deepEqual(stats.filter(row=>!row.count).map(row=>row.value),filters.gameplayGroups.map(group=>group.value).filter(value=>!['runner','platformer','fighting'].includes(value)));
  assert.deepEqual(filters.gameplayStats([...tied].reverse()),stats,'Order of distinct case records does not change tie order');
});
test('Duplicate case IDs count once, retaining the first record even if the duplicate disagrees',()=>{
  const runner={id:'repeat',format:'跑酷'};
  const stats=filters.gameplayStats([runner,runner,{...runner},{id:'repeat',format:'格斗'},{id:'__proto__',format:'射击'},{id:'__proto__',format:'射击'},{id:'constructor',format:'格斗'}]);
  assert.equal(stats.reduce((sum,row)=>sum+row.count,0),3);
  assert.equal(stats.find(row=>row.value==='runner').count,1);
  assert.equal(stats.find(row=>row.value==='fighting').count,1);
  assert.equal(stats.find(row=>row.value==='shooting').count,1);
  assert.equal(filters.gameplayStats([{format:'跑酷'},{format:'跑酷'}]).find(row=>row.value==='runner').count,2,'Without a stable ID, distinct supplied records remain independent');
});
test('Statistics are pure, accept frozen inputs, and immediately reflect added or removed cases',()=>{
  const runner=Object.freeze({id:'runner',format:'跑酷',tags:Object.freeze(['手机'])});
  const platformer=Object.freeze({id:'platform',format:'平台跳跃'});
  const input=Object.freeze([runner,platformer]);
  const before=JSON.stringify(input),taxonomy=JSON.stringify(filters.gameplayGroups);
  const first=filters.gameplayStats(input);
  assert.equal(first.find(row=>row.value==='runner').count,1);
  const added=filters.gameplayStats([...input,{id:'runner-2',format:'跑酷'}]);
  assert.equal(added.find(row=>row.value==='runner').count,2);
  const removed=filters.gameplayStats(input.filter(c=>c.id!=='runner'));
  assert.equal(removed.find(row=>row.value==='runner').count,0);
  assert.equal(first.find(row=>row.value==='runner').count,1,'Prior reports are independent snapshots');
  first[0].count=999;
  assert.equal(filters.gameplayStats(input).reduce((sum,row)=>sum+row.count,0),2,'Returned rows do not leak into future calculations');
  assert.equal(JSON.stringify(input),before);
  assert.equal(JSON.stringify(filters.gameplayGroups),taxonomy);
  assert.ok(Object.isFrozen(filters.gameplayGroups)&&filters.gameplayGroups.every(Object.isFrozen));
});
