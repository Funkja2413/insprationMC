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

test('Filter options expose exactly eight gameplay groups and twelve industry groups',()=>{
  assert.equal(filters.gameplayGroups.length,8);
  assert.equal(filters.industryGroups.length,12);
  for(const groups of [filters.gameplayGroups,filters.industryGroups]){
    assert.equal(new Set(groups.map(g=>g.value)).size,groups.length);
    assert.ok(groups.every(g=>typeof g.value==='string'&&g.value&&typeof g.label==='string'&&g.label));
    assert.ok(groups.some(g=>g.value==='other'));
  }
});
test('Representative mechanics preserve meaningful boundaries',()=>{
  for(const [id,gameplay] of [
    ['twst-evolve-racer','action'],
    ['google-io-prism-shift-2025','puzzle'],
    ['coco-ichibanya-curry-gokko-2026','simulation'],
    ['coastal-world-bank-islands','exploration'],
    ['samsung-galaxy-store-catch-the-drop','creation'],
    ['maruchan-dekamaru-street-fighter-rhythm-2025','rhythm'],
    ['netflix-its-whats-inside-game-2024','social'],
    ['firefox-data-war-card-game','social'],
    ['bandai-chousenshi-wafer-kaifu','exploration'],
    ['kayac-osechi-games-2026','other']
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
  assert.equal(filters.matches(c,{gameplay:'action',industry:'dining',mobileOnly:true,demoOnly:true}),true);
  for(const changes of [{gameplay:'puzzle'},{industry:'food'},{gameplay:'missing'},{industry:'missing'}]){
    assert.equal(filters.matches(c,{gameplay:'action',industry:'dining',mobileOnly:true,demoOnly:true,...changes}),false);
  }
  assert.equal(filters.matches({...c,mobile:'historical'},{gameplay:'action',industry:'dining',mobileOnly:true,demoOnly:true}),false);
  assert.equal(filters.matches({...c,demo_type:'puzzle_source'},{gameplay:'action',industry:'dining',mobileOnly:true,demoOnly:true}),false);
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
    if(result.gameplay==='other')assert.ok(['小游戏合集玩法','机关互动玩法'].includes(summary.mechanic),'No existing mechanic silently falls through: '+c.id);
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
  const selected=Object.freeze({gameplay:'action',industry:'dining',mobileOnly:true,demoOnly:true});
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
  for(const c of cases){
    assert.equal(JSON.stringify(browser.classify(c)),JSON.stringify(filters.classify(c)),c.id);
    assert.equal(browser.matches(c,{gameplay:'action',mobileOnly:true}),filters.matches(c,{gameplay:'action',mobileOnly:true}),c.id);
  }
});
test('Future unmapped summary labels safely stay in other groups',()=>{
  const context={window:{InspoPresentation:{summarize:()=>({mechanic:'未来新玩法',industry:'未来新品牌'})}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../filters.js'),'utf8'),context);
  assert.equal(JSON.stringify(context.window.InspoFilters.classify({})),JSON.stringify({gameplay:'other',industry:'other'}));
});
