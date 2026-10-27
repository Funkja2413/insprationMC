(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./presentation.js"));
  else root.InspoFilters=factory(root.InspoPresentation);
})(typeof window!=="undefined"?window:this,function(presentation){
  "use strict";
  if(!presentation||typeof presentation.summarize!=="function")throw new Error("InspoFilters requires InspoPresentation");

  function groups(entries){
    return Object.freeze(entries.map(function(entry){return Object.freeze({value:entry[0],label:entry[1]})}));
  }
  var gameplayGroups=groups([
    ["runner","跑酷"],["platformer","平台跳跃"],["fighting","格斗"],
    ["racing","竞速"],["shooting","射击"],["survival","生存战斗"],
    ["action","动作闯关"],["driving","驾驶探索"],["flying","飞行避障"],
    ["reaction","反应挑战"],["catching","接物收集"],["motion","体感互动"],
    ["pinball","弹珠"],["brick_breaker","打砖块"],["claw","抓娃娃"],["snake","贪吃蛇"],
    ["match","消除"],["merge","合成"],["puzzle","拼图解谜"],
    ["memory","翻牌记忆"],["hidden_object","寻物找不同"],["observation","观察辨认"],
    ["maze","迷宫"],["escape","密室逃脱"],["logic","逻辑解谜"],["quiz","问答测验"],
    ["simulation","模拟经营"],["cooking","烹饪"],["raising","养成"],["dating","恋爱模拟"],
    ["narrative","互动叙事"],["exploration","探索冒险"],["rpg","RPG / 角色扮演"],
    ["stealth","潜行"],["treasure","实景寻宝"],["card_collection","集卡收集"],
    ["creation","创作装扮"],["ai_dialogue","AI 对话"],["rhythm","音乐节奏"],
    ["sports","体育竞技"],["board_game","桌游休闲"],["card_battle","卡牌对战"],
    ["deduction","社交推理"],["multiplayer","多人对战"],["cooperation","合作冒险"],
    ["collection","小游戏合集"],["mechanism","机关互动"],["other","其他玩法"]
  ]);
  var industryGroups=groups([
    ["food","食品饮料"],["dining","餐饮"],["technology","科技数码"],
    ["fashion","时尚美妆"],["retail","零售电商"],["entertainment","文娱体育"],
    ["mobility","汽车出行"],["home","家居生活"],["health","医疗健康"],
    ["finance","金融服务"],["public","公益教育"],["other","工业与其他"]
  ]);

  // Group the reviewed summary labels; do not infer again from case copy,
  // platform names, prizes or partner brands.
  function lookup(definitions){
    var result=Object.create(null);
    Object.keys(definitions).forEach(function(group){
      definitions[group].split("|").forEach(function(label){result[label]=group});
    });
    return Object.freeze(result);
  }
  var gameplayMap=lookup({
    runner:"跑酷避障玩法",
    platformer:"平台跳跃玩法",
    fighting:"格斗对战玩法",
    racing:"帆船竞速玩法|滚动竞速玩法|滚珠竞速玩法|赛车竞速玩法|赛马竞速玩法",
    shooting:"动作射击玩法",
    survival:"生存战斗玩法",
    action:"动作闯关玩法|拦截防守玩法",
    driving:"驾驶探索玩法",
    flying:"飞行避障玩法",
    reaction:"时机反应玩法",
    catching:"接物收集玩法",
    motion:"体感互动玩法|体感切割玩法|体感反应玩法|手势挑战玩法|声控挑战玩法",
    pinball:"弹珠玩法",
    brick_breaker:"打砖块玩法",
    claw:"抓娃娃玩法",
    snake:"贪吃蛇玩法",
    match:"消除玩法",
    merge:"合成玩法",
    puzzle:"空间拼图玩法",
    memory:"翻牌记忆玩法",
    hidden_object:"寻物解谜玩法",
    observation:"观察辨认玩法",
    maze:"迷宫收集玩法",
    escape:"密室逃脱玩法",
    logic:"光路解谜玩法|画线解谜玩法|线索解谜玩法|寻词解谜玩法|益智解谜玩法",
    quiz:"知识问答玩法|翻牌测验玩法",
    simulation:"经营模拟玩法",
    cooking:"烹饪模拟玩法",
    raising:"养成玩法",
    dating:"恋爱模拟玩法",
    narrative:"分支叙事玩法|叙事探索玩法|文字冒险玩法",
    exploration:"互动探索玩法|探索收集玩法",
    rpg:"角色冒险玩法",
    stealth:"潜行冒险玩法",
    treasure:"地图寻宝玩法",
    card_collection:"集卡收集玩法",
    creation:"AI创作玩法|手作创作玩法|收集装扮玩法|装扮创作玩法",
    ai_dialogue:"AI对话玩法",
    rhythm:"音乐节奏玩法",
    sports:"击球竞技玩法|网球竞技玩法|落点预测玩法|足球射门玩法",
    board_game:"桌游掷骰玩法|猜拳玩法",
    card_battle:"卡牌对战玩法",
    deduction:"社交推理玩法",
    multiplayer:"多人对战玩法",
    cooperation:"合作冒险玩法",
    collection:"小游戏合集玩法",
    mechanism:"机关互动玩法"
  });
  var industryMap=lookup({
    food:"食品品牌|饮料品牌|酒类品牌",
    dining:"餐饮品牌",
    technology:"科技品牌|通信品牌",
    fashion:"时尚品牌|美妆品牌|运动服饰品牌|珠宝腕表品牌",
    retail:"零售品牌|电商品牌",
    entertainment:"传媒品牌|体育品牌|影视品牌|文旅品牌|游戏品牌|玩具品牌|音乐品牌",
    mobility:"汽车品牌|出行品牌",
    home:"园艺品牌|地产品牌|家居品牌|家电品牌|户外品牌|文具品牌|日用品品牌|母婴品牌",
    health:"医药健康品牌",
    finance:"金融品牌",
    public:"公益品牌|教育品牌",
    other:"创意服务品牌|工业品牌|联名品牌|能源品牌|综合品牌"
  });

  function classify(c){
    var summary=presentation.summarize(c);
    return {gameplay:gameplayMap[summary.mechanic]||"other",industry:industryMap[summary.industry]||"other"};
  }
  // Count the supplied view (for example, after hiding removed cases). Case IDs
  // are stable identities: duplicate IDs count once, using their first record.
  // ID-less objects can still be counted independently; malformed entries cannot.
  function gameplayStats(cases){
    var order=Object.create(null), byValue=Object.create(null), seen=new Set();
    var rows=gameplayGroups.map(function(group,index){
      var row={value:group.value,label:group.label,count:0};
      order[group.value]=index;byValue[group.value]=row;return row;
    });
    (Array.isArray(cases)?cases:[]).forEach(function(c){
      if(!c||typeof c!=="object"||Array.isArray(c))return;
      if(typeof c.id==="string"&&c.id){
        if(seen.has(c.id))return;
        seen.add(c.id);
      }
      byValue[classify(c).gameplay].count++;
    });
    return rows.sort(function(a,b){return b.count-a.count||order[a.value]-order[b.value]});
  }
  function matches(c,filters){
    c=c&&typeof c==="object"?c:{};
    filters=filters&&typeof filters==="object"?filters:{};
    if(filters.mobileOnly&&c.mobile!=="yes")return false;
    if(filters.demoOnly&&!(typeof c.demo_url==="string"&&/^https?:\/\//i.test(c.demo_url)&&c.demo_type!=="puzzle_source"))return false;
    var grouped=classify(c);
    return (!filters.gameplay||grouped.gameplay===filters.gameplay)&&(!filters.industry||grouped.industry===filters.industry);
  }
  return {gameplayGroups:gameplayGroups,industryGroups:industryGroups,classify:classify,gameplayStats:gameplayStats,matches:matches};
});
