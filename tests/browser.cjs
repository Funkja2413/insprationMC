const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const filters=require('../filters.js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8766';
const output=process.env.TEST_OUTPUT||'/tmp/inspo-favorites-verification';
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/cases.json')));
const removed=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/removed.json')));
const expected=data.cases.filter(c=>!removed.some(r=>r.id===c.id));
const checks=[], errors=[];
function check(name,value=true){assert.ok(value,name);checks.push(name)}
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50))}throw Error('Expected UI state did not arrive')}
const safeUrl=url=>/^https?:\/\//i.test(url||'')?url:'';
const experienceUrls=c=>[...new Set([c.live_url,...(c.additional_live_urls||[])].map(safeUrl).filter(Boolean))];
const hasDemo=c=>!!safeUrl(c.demo_url)&&c.demo_type!=='puzzle_source';
const searchMatches=(c,query)=>[c.title_zh,c.brand,c.agency,c.region,c.format,c.why_zh,c.style_zh,c.availability_zh,(c.tags||[]).join(' ')].join(' ').toLowerCase().includes(query.toLowerCase());
async function checkVisibleCases(page,name,cases){
  const ids=await page.locator('.card').evaluateAll(cards=>cards.map(card=>card.dataset.id));
  assert.deepEqual(ids,cases.map(c=>c.id),name);checks.push(name);
}
async function checkGameplayRanking(page,name,visibleCases=expected){
  const ranked=filters.gameplayStats(visibleCases);
  for(const id of ['gameplayFilter','dialogGameplay']){
    const options=await page.locator('#'+id+' option').evaluateAll(items=>items.slice(1).map(item=>({value:item.value,count:Number(item.dataset.count),disabled:item.disabled,text:item.textContent})));
    assert.deepEqual(options.map(({value,count})=>({value,count})),ranked.map(({value,count})=>({value,count})),name+' '+id+' follows full-library counts and descending rank');
    check(name+' '+id+' displays counts and disables only empty genres',options.every(option=>option.text.includes(option.count+' 个')&&option.disabled===(option.count===0)));
  }
  check(name+' ranking describes the whole library', (await page.locator('#gameplayNote').innerText()).includes('全库 '+visibleCases.length+' 个案例'));
}
async function checkFilters(page){
  const panel=page.locator('#filterDialog'),search=page.getByPlaceholder('搜索品牌 / 关键词');
  const demoCases=expected.filter(hasDemo),mobileCases=expected.filter(c=>c.mobile==='yes');
  await checkGameplayRanking(page,'Initial');
  check('Desktop shows gameplay and industry selects plus more filters',await page.getByRole('combobox',{name:'玩法',exact:true}).isVisible()&&await page.getByRole('combobox',{name:'品牌行业',exact:true}).isVisible()&&await page.locator('#moreFilters').isVisible());
  check('Cards no longer render old tag chips',await page.locator('.card .tags,.card .tag').count()===0);
  await page.locator('#moreFilters').click();await panel.getByLabel('有实机演示',{exact:true}).check();
  await checkVisibleCases(page,'Draft demo selection does not change cards before applying',expected);
  await panel.locator('#applyFilters').click();
  await checkVisibleCases(page,'Demo filter retains valid URLs and excludes puzzle-source footage',demoCases);
  await page.getByRole('button',{name:'移除实机演示筛选',exact:true}).click();
  await checkVisibleCases(page,'Removing the demo condition restores all visible cases',expected);
  await page.locator('#moreFilters').click();await panel.getByLabel('仅手机可玩',{exact:true}).check();await panel.locator('#applyFilters').click();
  await checkVisibleCases(page,'Mobile-playable filter keeps only mobile yes cases',mobileCases);
  await page.locator('#clearFilters').click();
  const seed=expected.find(c=>hasDemo(c)&&filters.classify(c).gameplay&&filters.classify(c).industry);
  check('An existing case supplies the gameplay and industry combination',!!seed);
  const classified=filters.classify(seed),combo={gameplay:classified.gameplay,industry:classified.industry,mobileOnly:true,demoOnly:true};
  await page.locator('#gameplayFilter').selectOption(combo.gameplay);
  await checkVisibleCases(page,'Desktop gameplay selection filters cases immediately',expected.filter(c=>filters.matches(c,{gameplay:combo.gameplay})));
  await page.locator('#industryFilter').selectOption(combo.industry);
  const categorized=expected.filter(c=>filters.matches(c,{gameplay:combo.gameplay,industry:combo.industry}));
  await checkVisibleCases(page,'Gameplay and brand industry combine with AND semantics',categorized);
  await checkGameplayRanking(page,'Industry and gameplay do not narrow the ranking');
  await page.locator('#moreFilters').click();
  await panel.locator('#filterMobile').check();await panel.locator('#filterDemo').check();
  await panel.locator('#closeFilters').click();
  await checkVisibleCases(page,'Closing the filter panel cancels unapplied changes',categorized);
  await page.locator('#moreFilters').click();
  check('Reopening starts from committed filter values',!await panel.locator('#filterMobile').isChecked()&&!await panel.locator('#filterDemo').isChecked());
  await panel.locator('#filterMobile').check();await panel.locator('#filterDemo').check();await page.keyboard.press('Escape');
  await checkVisibleCases(page,'Escape cancels the draft filter selection',categorized);
  await page.locator('#moreFilters').click();await panel.locator('#filterMobile').check();await panel.locator('#filterDemo').check();
  const combined=expected.filter(c=>filters.matches(c,combo));
  check('Apply button previews the draft result count',(await panel.locator('#applyFilters').innerText()).replace(/\s/g,'')==='查看'+combined.length+'个案例');
  await panel.locator('#applyFilters').click();
  await checkVisibleCases(page,'Applying the panel combines gameplay, industry, mobile, and demo',combined);
  check('All four active filter conditions are exposed for removal',await page.locator('#activeFilters button[aria-label^="移除"]').count()===4);
  await page.locator('#moreFilters').click();await panel.locator('#resetFilters').click();
  check('Reset clears the draft controls',await panel.locator('#dialogGameplay').inputValue()===''&&await panel.locator('#dialogIndustry').inputValue()===''&&!await panel.locator('#filterMobile').isChecked()&&!await panel.locator('#filterDemo').isChecked());
  await checkVisibleCases(page,'Reset remains a draft until applying',combined);
  await panel.locator('#closeFilters').click();
  await page.getByRole('button',{name:'移除玩法筛选',exact:true}).click();
  await checkVisibleCases(page,'Removing gameplay preserves the other three conditions',expected.filter(c=>filters.matches(c,{...combo,gameplay:''})));
  await page.getByRole('button',{name:'移除行业筛选',exact:true}).click();
  await checkVisibleCases(page,'Removing industry preserves mobile and demo conditions',expected.filter(c=>c.mobile==='yes'&&hasDemo(c)));
  await page.getByRole('button',{name:'移除手机可玩筛选',exact:true}).click();
  await checkVisibleCases(page,'Removing mobile retains the demo condition',demoCases);
  await page.getByRole('button',{name:'移除实机演示筛选',exact:true}).click();
  check('Active condition strip is hidden when no filters remain',!await page.locator('#activeFilters').isVisible());
  const tagged=expected.find(c=>(c.tags||[]).some(tag=>!searchMatches({...c,tags:[]},tag)));
  check('An existing hidden tag can independently match search',!!tagged);
  const query=tagged.tags.find(tag=>!searchMatches({...tagged,tags:[]},tag)),searched=expected.filter(c=>searchMatches(c,query));
  await search.fill(query);
  await checkVisibleCases(page,'Search still finds original tag text although card tags are hidden',searched);
  await checkGameplayRanking(page,'Search does not narrow the ranking');
  await page.locator('#gameplayFilter').selectOption(filters.classify(tagged).gameplay);
  await page.locator('#clearFilters').click();
  check('Clearing conditions preserves the search text',await search.inputValue()===query);
  await checkVisibleCases(page,'Clearing conditions keeps the existing search results',searched);
  await search.fill('');await checkVisibleCases(page,'All cases return after explicitly clearing search',expected);
}
async function checkMobileFilterPanel(page,width){
  const panel=page.locator('#filterDialog');
  check(width+'px header offers a single mobile filter trigger',await page.locator('#mobileFilters').isVisible()&&!await page.locator('#gameplayFilter').isVisible()&&!await page.locator('#industryFilter').isVisible()&&!await page.locator('#moreFilters').isVisible());
  await page.locator('#mobileFilters').click();
  check(width+'px filter panel is a bottom sheet without horizontal overflow',await panel.evaluate(dialog=>{
    const rect=dialog.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&Math.abs(rect.bottom-innerHeight)<=2&&dialog.scrollWidth<=dialog.clientWidth;
  }));
  await panel.locator('#filterMobile').check();await panel.locator('#filterDemo').check();
  await checkVisibleCases(page,width+'px mobile draft does not change results',expected);
  await page.keyboard.press('Escape');await until(async()=>!await panel.isVisible());
  check(width+'px Escape returns focus to the filter trigger',await page.locator('#mobileFilters').evaluate(button=>document.activeElement===button));
  await page.locator('#mobileFilters').click();await panel.locator('#filterDemo').check();await panel.locator('#applyFilters').click();
  await checkVisibleCases(page,width+'px mobile panel applies the selected condition',expected.filter(hasDemo));
  await page.locator('#clearFilters').click();
  await checkVisibleCases(page,width+'px clear restores unfiltered cases',expected);
}
async function checkCardSummaries(page){
  const cards=await page.locator('.card').evaluateAll(cards=>cards.map(card=>({
    id:card.dataset.id,summaries:card.querySelectorAll('.case-summary').length,
    mechanic:card.querySelector('.summary-mechanic')?.textContent.trim(),
    industry:card.querySelector('.summary-industry')?.textContent.trim(),
    summary:card.querySelector('.case-summary')?.textContent,
    text:card.textContent
  })));
  check('Every visible card has one nonempty gameplay × brand-type summary',cards.every(card=>card.summaries===1&&card.mechanic&&card.industry&&card.summary.includes('×')));
  check('Verification notes are absent from card DOM while remaining in case data',cards.every(card=>{
    const availability=expected.find(c=>c.id===card.id).availability_zh;
    return !availability||!card.text.includes(availability);
  }));
}
async function checkActionBars(page){
  const bars=await page.locator('.card').evaluateAll(cards=>cards.map(card=>{
    const action=control=>({
      kind:['play','demo','source','fav','del'].find(name=>control.classList.contains(name)),
      href:control.getAttribute('href'),label:control.getAttribute('aria-label'),
      tooltip:control.querySelector('.action-tooltip')?.textContent,
      icon:control.querySelector('svg')?.getAttribute('data-icon'),
      iconOnly:control.querySelectorAll('svg[aria-hidden="true"]').length===1&&
        [...control.childNodes].every(node=>node.nodeType===Node.TEXT_NODE?!node.textContent.trim():node.matches('svg, .action-tooltip')),
      width:control.getBoundingClientRect().width,height:control.getBoundingClientRect().height
    });
    return {id:card.dataset.id,count:card.querySelectorAll('.acts a,.acts button').length,
      left:[...card.querySelectorAll('.action-group--links > a,.action-group--links > button')].map(action),
      right:[...card.querySelectorAll('.action-group--manage > button')].map(action)};
  }));
  check('Every card has at most five toolbar actions',bars.every(bar=>bar.count<=5));
  check('Management actions are grouped right in favorite/not-interested order',bars.every(bar=>JSON.stringify(bar.right.map(x=>x.kind))==='["fav","del"]'));
  check('Not-interested action uses the requested Chinese label and tooltip',bars.every(bar=>bar.right[1].label==='不感兴趣'&&bar.right[1].tooltip==='不感兴趣'));
  check('Experience links use a gamepad and not-interested uses a broken heart',bars.every(bar=>bar.left.filter(action=>action.kind==='play').every(action=>action.icon==='gamepad')&&bar.right[1].icon==='heartBroken'));
  check('All toolbar actions are SVG-only with Chinese labels and tooltips',bars.every(bar=>[...bar.left,...bar.right].every(action=>action.iconOnly&&/[\u3400-\u9fff]/.test(action.label)&&/[\u3400-\u9fff]/.test(action.tooltip))));
  check('Every toolbar action has a 44px minimum hit target',bars.every(bar=>[...bar.left,...bar.right].every(action=>action.width>=44&&action.height>=44)));
  for(const bar of bars){
    const c=expected.find(c=>c.id===bar.id),urls=experienceUrls(c),demo=safeUrl(c.demo_url),source=safeUrl(c.source_url);
    const kinds=[urls.length&&'play',demo&&'demo',source&&source!==safeUrl(c.live_url)&&source!==demo&&'source'].filter(Boolean);
    assert.deepEqual(bar.left.map(action=>action.kind),kinds,'Available actions and left-to-right order for '+c.id);
    for(const action of bar.left){
      if(action.kind==='play'){
        assert.equal(action.label,'体验链接','Experience naming stays unified for '+c.id);
        assert.equal(action.href,urls.length===1?urls[0]:null,'Real experience URL or single multi-link trigger for '+c.id);
      }else assert.equal(action.href,action.kind==='demo'?demo:source,'Real '+action.kind+' URL for '+c.id);
    }
  }
  checks.push('All visible cases retain actual URLs and action order; missing links create no controls');
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--disable-client-side-phishing-detection','--disable-popup-blocking','--unsafely-disable-devtools-self-xss-warnings','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    let cloud=[],revision=1, favoriteWrites=0,deleteWrites=0;
    await context.route('https://api.github.com/**',async route=>{
      const request=route.request(),favorite=request.url().includes('/favorites.json');
      if(request.method()==='PUT'){
        if(!favorite){deleteWrites++;return route.fulfill({status:403,json:{}})}
        const body=request.postDataJSON();
        if(body.sha!==String(revision))return route.fulfill({status:409,json:{}});
        cloud=JSON.parse(Buffer.from(body.content,'base64').toString());revision++;favoriteWrites++;
        return route.fulfill({status:200,json:{}});
      }
      return route.fulfill({status:200,json:{sha:String(revision),content:Buffer.from(JSON.stringify(favorite?cloud:removed)).toString('base64')}});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await until(async()=>await page.locator('.card').count()===expected.length);
    check('All existing visible cases retained',await page.locator('.card').count()===expected.length);
    await checkCardSummaries(page);
    await checkActionBars(page);
    const multi=expected.find(c=>experienceUrls(c).length>1);
    check('Existing multiple-experience case is available for regression coverage',!!multi);
    const multiCard=()=>page.locator('article').filter({has:page.getByRole('heading',{name:multi.title_zh,exact:true})});
    await multiCard().getByRole('button',{name:'体验链接',exact:true}).click();
    const actionDialog=page.locator('#actionDialog');
    assert.deepEqual(await actionDialog.locator('.experience-links a').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),experienceUrls(multi));
    check('One experience icon exposes all original and additional URLs',await multiCard().locator('.play').count()===1&&await actionDialog.isVisible());
    check('Multi-link dialog has an accessible name and description',await actionDialog.getAttribute('aria-labelledby')==='actionDialogTitle'&&await actionDialog.getAttribute('aria-describedby')==='actionDialogDescription');
    await page.keyboard.press('Escape');
    await until(async()=>!(await actionDialog.isVisible()));
    check('Escape closes experience links and returns focus to the trigger',await multiCard().locator('.play').evaluate(button=>document.activeElement===button)&&await multiCard().locator('.play').getAttribute('aria-expanded')==='false');
    const first=expected[0],card=()=>page.locator('article').filter({has:page.getByRole('heading',{name:first.title_zh,exact:true})});
    await card().locator('.del').hover();
    check('Hover exposes a Chinese action tooltip',await card().locator('.del .action-tooltip').isVisible());
    await page.mouse.move(0,0);await page.getByPlaceholder('搜索品牌 / 关键词').focus();await page.keyboard.press('Tab');await card().locator('.del').focus();
    check('Keyboard focus exposes a Chinese action tooltip',await card().locator('.del .action-tooltip').isVisible());
    await card().locator('.fav').focus();
    const unlikedStyle=await card().locator('.fav').evaluate(button=>({fill:getComputedStyle(button.querySelector('svg')).fill,background:getComputedStyle(button).backgroundColor}));
    await card().locator('.fav').click();
    check('Favorite toggles immediately',await card().locator('.fav').getAttribute('aria-pressed')==='true');
    const likedStyle=await card().locator('.fav').evaluate(button=>({fill:getComputedStyle(button.querySelector('svg')).fill,background:getComputedStyle(button).backgroundColor}));
    check('Favorite state differs by filled icon and background',likedStyle.fill!=='none'&&likedStyle.fill!==unlikedStyle.fill&&likedStyle.background!==unlikedStyle.background);
    await page.getByRole('tab',{name:'我喜欢的case',exact:true}).click();
    check('Favorite tab and count',await page.locator('.card').count()===1&&await page.locator('#favoriteCount').innerText()==='1');
  await checkGameplayRanking(page,'Favorites do not narrow the ranking');
    await page.reload();await until(async()=>await page.locator('#favoriteCount').innerText()==='1');
    await page.getByRole('tab',{name:'我喜欢的case',exact:true}).click();
    check('Favorite survives refresh',await page.locator('.card').count()===1);
    await page.getByPlaceholder('搜索品牌 / 关键词').fill('no-matching-case-xyz');
    check('Search within favorites',await page.locator('.card').count()===0&&(await page.locator('#empty').innerText()).includes('没有匹配的收藏'));
    await page.getByPlaceholder('搜索品牌 / 关键词').fill('');
    await card().getByRole('button',{name:'不感兴趣',exact:true}).click();
    check('Not-interested confirmation stays outside the five-action toolbar',await card().locator('.acts a,.acts button').count()<=5&&await actionDialog.getByRole('button',{name:'确认不感兴趣',exact:true}).isVisible());
    check('Not-interested dialog has the requested confirmation heading',await actionDialog.getByRole('heading',{name:'不再显示这个案例？',exact:true}).isVisible());
    await actionDialog.getByRole('button',{name:'取消',exact:true}).click();
    await until(async()=>!(await actionDialog.isVisible()));
    check('Cancel preserves the case and restores not-interested-button focus',await card().isVisible()&&await card().locator('.del').evaluate(button=>document.activeElement===button));
    await card().getByRole('button',{name:'不感兴趣',exact:true}).click();await actionDialog.getByRole('button',{name:'确认不感兴趣',exact:true}).click();
    await until(async()=>await page.locator('.card').count()===0);
    check('Not-interested hides favorite and updates count',await page.locator('#favoriteCount').innerText()==='0');
  await checkGameplayRanking(page,'Excluding a case immediately updates ranking',expected.filter(c=>c.id!==first.id));
    check('Not-interested confirmation shows the requested undo message',await page.locator('#toastMsg').innerText()==='已标记为不感兴趣');
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    check('Undo restores the favorite',await page.locator('.card').count()===1&&await card().locator('.fav').getAttribute('aria-pressed')==='true');
  await checkGameplayRanking(page,'Undo restores ranking');
    await card().locator('.fav').click();
    check('Unfavorite removes from tab with empty state',await page.locator('.card').count()===0&&(await page.locator('#empty').innerText()).includes('还没有收藏'));
    await page.reload();await until(async()=>await page.locator('.card').count()===expected.length);
    check('Unfavorite survives refresh',await page.locator('#favoriteCount').innerText()==='0');
    await checkFilters(page);
    await card().locator('.fav').click();
    const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(base);
    await until(async()=>await second.locator('#favoriteCount').innerText()==='1');
    await second.locator('.fav').first().click();
    await until(async()=>await page.locator('#favoriteCount').innerText()==='0');
    check('Same-browser tab updates appear without reload');await second.close();
    await page.getByRole('tab',{name:'我喜欢的case',exact:true}).focus();await page.keyboard.press('ArrowLeft');
    check('Keyboard tab navigation',await page.locator('#allTab').getAttribute('aria-selected')==='true');
    await card().locator('.fav').click();
    await page.getByRole('link',{name:'令牌设置',exact:true}).click();
    await page.locator('#tokIn').fill('ghp_test_only_not_a_real_credential_123456');await page.getByRole('button',{name:'保存',exact:true}).click();
    await until(()=>favoriteWrites>0&&cloud.includes(first.id));
    check('Existing authorization path syncs pending IDs to mocked GitHub');
    await card().getByRole('button',{name:'不感兴趣',exact:true}).click();
    await page.waitForTimeout(900);
    check('Background sync preserves not-interested confirmation',await actionDialog.getByRole('button',{name:'确认不感兴趣',exact:true}).isVisible());
    await actionDialog.getByRole('button',{name:'取消',exact:true}).click();
    await card().locator('.fav').click();await until(()=>!cloud.includes(first.id));
    check('Unfavorite sync removes its ID');check('No real delete was committed',deleteWrites===0);
    await card().locator('.fav').click();await until(()=>cloud.includes(first.id));
    await page.getByRole('tab',{name:'我喜欢的case',exact:true}).click();
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,'favorites-desktop.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    check('Mobile has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('Mobile favorite control is at least 44px high',(await card().locator('.fav').boundingBox()).height>=44);
    await page.screenshot({path:path.join(output,'favorites-mobile.png'),fullPage:false});
    await card().locator('.fav').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'favorites-mobile-actions.png'),fullPage:false});
    await page.getByRole('tab',{name:/全部案例/}).click();
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      await checkMobileFilterPanel(page,width);
      check(width+'px viewport has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const mobileLayout=await page.locator('.acts').evaluateAll(bars=>bars.every(bar=>{
        const bounds=bar.getBoundingClientRect(),left=bar.querySelector('.action-group--links').getBoundingClientRect(),right=bar.querySelector('.action-group--manage').getBoundingClientRect();
        const controls=[...bar.querySelectorAll('a,button')].map(button=>button.getBoundingClientRect());
        return left.right<=right.left&&right.right<=bounds.right+1&&controls.every(rect=>rect.width>=44&&rect.height>=44&&Math.abs(rect.top-controls[0].top)<1);
      }));
      check(width+'px actions stay on one line with separate left/right groups and 44px targets',mobileLayout);
      check(width+'px summary labels stay within their cards',await page.locator('.case-summary').evaluateAll(summaries=>summaries.every(summary=>{
        const bounds=summary.getBoundingClientRect(),card=summary.closest('.card').getBoundingClientRect();
        return bounds.left>=card.left&&bounds.right<=card.right&&summary.scrollWidth<=summary.clientWidth;
      })));
      await multiCard().getByRole('button',{name:'体验链接',exact:true}).click();
      check(width+'px multiple-experience dialog fits the viewport',await actionDialog.evaluate(dialog=>{
        const rect=dialog.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight&&dialog.scrollWidth<=dialog.clientWidth;
      }));
      await page.keyboard.press('Escape');await until(async()=>!(await actionDialog.isVisible()));
    }
    check('No uncaught browser errors',errors.length===0);
    const delayed=await browser.newContext();
    await delayed.addInitScript(id=>localStorage.setItem('inspo-pending-favorites',JSON.stringify([{id,value:true,version:'preexisting'}])),first.id);
    let release;const gate=new Promise(r=>release=r);
    await delayed.route('https://api.github.com/**',async route=>{
      if(route.request().url().includes('/favorites.json'))await gate;
      await route.fulfill({status:200,json:{sha:'1',content:Buffer.from(JSON.stringify(route.request().url().includes('/favorites.json')?[]:removed)).toString('base64')}});
    });
    const delayedPage=await delayed.newPage();await delayedPage.goto(base);await delayedPage.locator('.fav').first().waitFor();
    await delayedPage.getByRole('tab',{name:'我喜欢的case',exact:true}).click();
    await delayedPage.locator('.fav').click();
    check('Unfavorite immediately after reload works before remote hydration',await delayedPage.locator('.card').count()===0);
    release();await delayed.close();
    fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({passed:true,checks,errors,visibleCaseCount:expected.length,favoriteWrites,deleteWrites,network:'GitHub API mocked; no credentials or production data used',screenshots:['favorites-desktop.png','favorites-mobile.png','favorites-mobile-actions.png']},null,2));
    console.log(JSON.stringify({passed:true,checks:checks.length,visibleCases:expected.length,output}));
  }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exit(1)});
