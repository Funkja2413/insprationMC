const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
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
async function checkActionBars(page){
  const bars=await page.locator('.card').evaluateAll(cards=>cards.map(card=>{
    const action=control=>({
      kind:['play','demo','source','fav','del'].find(name=>control.classList.contains(name)),
      href:control.getAttribute('href'),label:control.getAttribute('aria-label'),
      tooltip:control.querySelector('.action-tooltip')?.textContent,
      iconOnly:control.querySelectorAll('svg[aria-hidden="true"]').length===1&&
        [...control.childNodes].every(node=>node.nodeType===Node.TEXT_NODE?!node.textContent.trim():node.matches('svg, .action-tooltip')),
      width:control.getBoundingClientRect().width,height:control.getBoundingClientRect().height
    });
    return {id:card.dataset.id,count:card.querySelectorAll('.acts a,.acts button').length,
      left:[...card.querySelectorAll('.action-group--links > a,.action-group--links > button')].map(action),
      right:[...card.querySelectorAll('.action-group--manage > button')].map(action)};
  }));
  check('Every card has at most five toolbar actions',bars.every(bar=>bar.count<=5));
  check('Management actions are grouped right in favorite/delete order',bars.every(bar=>JSON.stringify(bar.right.map(x=>x.kind))==='["fav","del"]'));
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
    await checkActionBars(page);
    const multi=expected.find(c=>experienceUrls(c).length>1);
    check('Existing multiple-experience case is available for regression coverage',!!multi);
    const multiCard=()=>page.locator('article').filter({has:page.getByRole('heading',{name:multi.title_zh,exact:true})});
    await multiCard().getByRole('button',{name:'体验链接',exact:true}).click();
    const actionDialog=page.getByRole('dialog');
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
    await page.reload();await until(async()=>await page.locator('#favoriteCount').innerText()==='1');
    await page.getByRole('tab',{name:'我喜欢的case',exact:true}).click();
    check('Favorite survives refresh',await page.locator('.card').count()===1);
    await page.getByPlaceholder('搜索品牌 / 关键词').fill('no-matching-case-xyz');
    check('Search within favorites',await page.locator('.card').count()===0&&(await page.locator('#empty').innerText()).includes('没有匹配的收藏'));
    await page.getByPlaceholder('搜索品牌 / 关键词').fill('');
    await card().getByRole('button',{name:'删除',exact:true}).click();
    check('Delete confirmation stays outside the five-action toolbar',await card().locator('.acts a,.acts button').count()<=5&&await actionDialog.getByRole('button',{name:'确认删除',exact:true}).isVisible());
    await actionDialog.getByRole('button',{name:'取消',exact:true}).click();
    await until(async()=>!(await actionDialog.isVisible()));
    check('Cancel preserves the case and restores delete-button focus',await card().isVisible()&&await card().locator('.del').evaluate(button=>document.activeElement===button));
    await card().getByRole('button',{name:'删除',exact:true}).click();await actionDialog.getByRole('button',{name:'确认删除',exact:true}).click();
    await until(async()=>await page.locator('.card').count()===0);
    check('Delete hides favorite and updates count',await page.locator('#favoriteCount').innerText()==='0');
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    check('Undo restores the favorite',await page.locator('.card').count()===1&&await card().locator('.fav').getAttribute('aria-pressed')==='true');
    await card().locator('.fav').click();
    check('Unfavorite removes from tab with empty state',await page.locator('.card').count()===0&&(await page.locator('#empty').innerText()).includes('还没有收藏'));
    await page.reload();await until(async()=>await page.locator('.card').count()===expected.length);
    check('Unfavorite survives refresh',await page.locator('#favoriteCount').innerText()==='0');
    await page.getByRole('button',{name:'实机演示',exact:true}).click();
    check('Existing demo filter retained',await page.locator('.card').count()===expected.filter(c=>/^https?:\/\//.test(c.demo_url||'')&&c.demo_type!=='puzzle_source').length);
    await page.getByRole('button',{name:'全部',exact:true}).click();
    await page.getByRole('button',{name:'📱 手机可玩',exact:true}).click();
    check('Existing mobile filter retained',await page.locator('.card').count()===expected.filter(c=>c.mobile==='yes').length);
    await page.getByRole('button',{name:'全部',exact:true}).click();
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
    await card().getByRole('button',{name:'删除',exact:true}).click();
    await page.waitForTimeout(900);
    check('Background sync preserves delete confirmation',await actionDialog.getByRole('button',{name:'确认删除',exact:true}).isVisible());
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
      check(width+'px viewport has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const mobileLayout=await page.locator('.acts').evaluateAll(bars=>bars.every(bar=>{
        const bounds=bar.getBoundingClientRect(),left=bar.querySelector('.action-group--links').getBoundingClientRect(),right=bar.querySelector('.action-group--manage').getBoundingClientRect();
        const controls=[...bar.querySelectorAll('a,button')].map(button=>button.getBoundingClientRect());
        return left.right<=right.left&&right.right<=bounds.right+1&&controls.every(rect=>rect.width>=44&&rect.height>=44&&Math.abs(rect.top-controls[0].top)<1);
      }));
      check(width+'px actions stay on one line with separate left/right groups and 44px targets',mobileLayout);
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
