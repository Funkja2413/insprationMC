(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.InspoFavorites=factory();
})(typeof window!=="undefined"?window:this,function(){
  "use strict";
  var CACHE="inspo-favorites-cache", PENDING="inspo-pending-favorites";
  function parseIds(value){
    if(!Array.isArray(value)||value.some(function(id){return typeof id!=="string"||!id}))throw new Error("Invalid favorites data");
    return new Set(value);
  }
  function Store(options){
    this.options=options; this.remote=new Set(); this.pending=new Map();
    this.syncing=false; this.error=""; this.persistent=true; this.loaded=false; this.revision=0; this.timer=null;
    try{this.remote=parseIds(JSON.parse(this.read(CACHE)||"[]"))}catch(e){this.error="cache"}
    this.readPending();
  }
  Store.prototype.read=function(key){
    try{return this.options.storage.getItem(key)}catch(e){this.persistent=false;return null}
  };
  Store.prototype.write=function(key,value){
    try{this.options.storage.setItem(key,JSON.stringify(value));return true}catch(e){this.persistent=false;return false}
  };
  Store.prototype.readPending=function(){
    if(!this.persistent)return;
    try{
      var items=JSON.parse(this.read(PENDING)||"[]");
      if(!Array.isArray(items)||items.some(function(p){return !p||typeof p.id!=="string"||typeof p.value!=="boolean"||typeof p.version!=="string"}))throw new Error("Invalid pending data");
      this.pending=new Map(items.map(function(p){return [p.id,p]}));
    }catch(e){this.error="cache"}
  };
  Store.prototype.changed=function(){if(this.options.onChange)this.options.onChange()};
  Store.prototype.has=function(id){var p=this.pending.get(id);return p?p.value:this.remote.has(id)};
  Store.prototype.status=function(){return {pending:this.pending.size,syncing:this.syncing,error:this.error,persistent:this.persistent,loaded:this.loaded,authorized:!!this.options.token()}};
  Store.prototype.set=function(id,value){
    this.readPending();
    this.pending.set(id,{id:id,value:!!value,version:Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)});
    this.write(PENDING,Array.from(this.pending.values())); this.error=""; this.changed();
    clearTimeout(this.timer); var self=this;
    this.timer=setTimeout(function(){self.sync()},700);
  };
  Store.prototype.headers=function(){
    var h={Accept:"application/vnd.github+json"}, token=this.options.token();
    if(token)h.Authorization="Bearer "+token;
    return h;
  };
  Store.prototype.readApi=async function(){
    var response=await this.options.fetch(this.options.api+"?ref=main&t="+Date.now(),{headers:this.headers(),cache:"no-store"});
    if(response.status===404)return {sha:null,ids:new Set()};
    if(!response.ok)throw {auth:response.status===401||response.status===403,status:response.status};
    var data=await response.json();
    return {sha:data.sha,ids:parseIds(JSON.parse(this.options.decode(data.content)))};
  };
  Store.prototype.refresh=async function(){
    var revision=this.revision, result;
    try{result=await this.readApi()}
    catch(error){
      for(var url of [this.options.raw,this.options.path]){
        try{
          var response=await this.options.fetch(url+"?t="+Date.now(),{cache:"no-store"});
          if(!response.ok)throw new Error("Unavailable");
          result={ids:parseIds(await response.json())}; break;
        }catch(e){}
      }
    }
    if(result&&revision===this.revision){
      this.remote=result.ids; this.loaded=true; this.revision++; this.write(CACHE,Array.from(this.remote));
      if(!this.syncing)this.error="";
    }
    if(!result)this.error="network";
    this.readPending(); this.changed();
    if(this.pending.size&&this.options.token())return this.sync();
  };
  Store.prototype.sync=async function(){
    if(this.syncing)return;
    clearTimeout(this.timer); this.readPending();
    if(!this.pending.size||!this.options.token()){this.changed();return}
    this.syncing=true; this.error=""; this.changed();
    try{
      while(this.pending.size&&this.options.token()){
        var sent=Array.from(this.pending.values()), saved=null;
        for(var attempt=0;attempt<5;attempt++){
          var current=await this.readApi(), ids=new Set(current.ids);
          sent.forEach(function(p){if(p.value)ids.add(p.id);else ids.delete(p.id)});
          var same=ids.size===current.ids.size&&Array.from(ids).every(function(id){return current.ids.has(id)});
          if(same){saved=ids;break}
          var body={message:"Update favorite cases",content:this.options.encode(JSON.stringify(Array.from(ids).sort(),null,1)+"\n"),branch:"main"};
          if(current.sha)body.sha=current.sha;
          var response=await this.options.fetch(this.options.api,{method:"PUT",headers:Object.assign({"Content-Type":"application/json"},this.headers()),body:JSON.stringify(body)});
          if(response.ok){saved=ids;break}
          if(response.status===409||response.status===422)continue;
          throw {auth:response.status===401||response.status===403||response.status===404,status:response.status};
        }
        if(!saved)throw new Error("Favorites conflict");
        this.remote=saved; this.loaded=true; this.revision++; this.write(CACHE,Array.from(saved));
        this.readPending();
        sent.forEach(function(p){var latest=this.pending.get(p.id);if(latest&&latest.version===p.version)this.pending.delete(p.id)},this);
        this.write(PENDING,Array.from(this.pending.values())); this.changed();
      }
    }catch(error){this.error=error&&error.auth?"auth":"network"}
    finally{this.syncing=false;this.changed()}
  };
  Store.prototype.onStorage=function(key){
    if(key!==CACHE&&key!==PENDING&&key!==null)return;
    try{this.remote=parseIds(JSON.parse(this.read(CACHE)||"[]"));this.revision++}catch(e){}
    this.readPending();this.changed();
  };
  return Store;
});
