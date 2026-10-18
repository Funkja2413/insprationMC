const test=require('node:test');
const assert=require('node:assert/strict');
const Store=require('../favorites.js');
const encode=s=>Buffer.from(s).toString('base64'), decode=s=>Buffer.from(s,'base64').toString();
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}}
function setup(t,{ids=[],storage=memory(),authorized=true}={}){
  const server={ids:new Set(ids),sha:1,puts:0,fail:0,conflict:false,beforePut:null};
  const fetch=async(url,options={})=>{
    if(server.fail)return {ok:false,status:server.fail};
    if(options.method==='PUT'){
      server.puts++; const data=JSON.parse(options.body);
      if(server.beforePut)await server.beforePut();
      if(server.conflict){server.conflict=false;server.ids.add('other-device');server.sha++;return {ok:false,status:409}}
      if(data.sha!==String(server.sha))return {ok:false,status:409};
      server.ids=new Set(JSON.parse(decode(data.content)));server.sha++;return {ok:true,status:200};
    }
    return {ok:true,status:200,json:async()=>({sha:String(server.sha),content:encode(JSON.stringify([...server.ids]))})};
  };
  const store=new Store({storage,fetch,token:()=>authorized?'test-only-credential':'',encode,decode,api:'api',raw:'raw',path:'static'});
  t.after(()=>clearTimeout(store.timer));return {store,server,storage};
}
test('no authorization: favorite and unfavorite persist immediately across reload',async t=>{
  const {store,server,storage}=setup(t,{authorized:false});store.set('alpha',true);
  const reload=setup(t,{authorized:false,storage}).store;assert.equal(reload.has('alpha'),true);
  reload.set('alpha',false);assert.equal(setup(t,{authorized:false,storage}).store.has('alpha'),false);
  await store.sync();assert.equal(server.puts,0);
});
test('latest remote favorites survive a conflicting write',async t=>{
  const {store,server}=setup(t,{ids:['remote']});server.conflict=true;
  store.set('mine',true);await store.sync();
  assert.deepEqual([...server.ids].sort(),['mine','other-device','remote']);assert.equal(store.pending.size,0);
});
test('cancel and another favorite during an in-flight PUT are not acknowledged away',async t=>{
  const {store,server}=setup(t);let started,release;
  const seen=new Promise(r=>started=r), gate=new Promise(r=>release=r);
  server.beforePut=async()=>{server.beforePut=null;started();await gate};
  store.set('alpha',true);const syncing=store.sync();await seen;
  store.set('alpha',false);store.set('beta',true);release();await syncing;
  assert.deepEqual([...server.ids],['beta']);assert.equal(store.has('alpha'),false);assert.equal(store.pending.size,0);
});
test('failed authorization keeps pending preferences usable and persistent',async t=>{
  const {store,server,storage}=setup(t);server.fail=403;store.set('alpha',true);await store.sync();
  assert.equal(store.status().error,'auth');assert.equal(store.has('alpha'),true);
  assert.equal(setup(t,{storage,authorized:false}).store.has('alpha'),true);assert.equal(server.puts,0);
});
test('unreadable remote data cannot be overwritten by a local write',async t=>{
  const {store,server}=setup(t);store.options.fetch=async()=>({ok:true,status:200,json:async()=>({sha:'1',content:encode('{broken')})});
  store.set('alpha',true);await store.sync();assert.equal(store.status().error,'network');assert.equal(store.pending.size,1);assert.equal(server.puts,0);
});
test('storage failures retain an in-memory favorite and expose persistence limitation',t=>{
  const {store}=setup(t,{authorized:false,storage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}});
  store.set('alpha',true);assert.equal(store.has('alpha'),true);assert.equal(store.status().persistent,false);
});
test('two tabs merge pending edits and react to storage updates',async t=>{
  const storage=memory(),one=setup(t,{storage,authorized:false}).store,two=setup(t,{storage,authorized:false}).store;
  one.set('alpha',true);two.set('beta',true);one.onStorage('inspo-pending-favorites');
  assert.equal(one.has('alpha'),true);assert.equal(one.has('beta'),true);
  two.set('alpha',false);one.onStorage('inspo-pending-favorites');assert.equal(one.has('alpha'),false);assert.equal(one.has('beta'),true);
});
test('a delayed initial refresh cannot roll back a completed write',async t=>{
  const {store,server}=setup(t);let release;const gate=new Promise(r=>release=r);const real=store.options.fetch;let first=true;
  store.options.fetch=async(...args)=>{if(first){first=false;await gate;return {ok:true,status:200,json:async()=>({sha:'1',content:encode('[]')})}}return real(...args)};
  const refreshing=store.refresh();store.set('alpha',true);await store.sync();release();await refreshing;
  assert.equal(store.has('alpha'),true);assert.equal(server.ids.has('alpha'),true);
});
test('exhausted conflicts in a second batch do not acknowledge unsaved changes',async t=>{
  const {store,server}=setup(t);const real=store.options.fetch;let writes=0;
  store.options.fetch=async(url,options={})=>{
    if(options.method==='PUT'){
      writes++;
      if(writes>1)return {ok:false,status:409};
      const result=await real(url,options);store.set('beta',true);return result;
    }
    return real(url,options);
  };
  store.set('alpha',true);await store.sync();
  assert.equal(server.ids.has('alpha'),true);assert.equal(server.ids.has('beta'),false);
  assert.equal(store.pending.has('beta'),true);assert.equal(store.has('beta'),true);assert.equal(store.status().error,'network');
});
