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
    ["action","动作与竞速"],["puzzle","益智与解谜"],["simulation","经营与养成"],
    ["exploration","探索与叙事"],["creation","创作与装扮"],["rhythm","音乐与节奏"],
    ["social","竞技与社交"],["other","合集与其他"]
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
    action:"体感互动玩法|体感切割玩法|体感反应玩法|动作射击玩法|动作闯关玩法|声控挑战玩法|帆船竞速玩法|平台跳跃玩法|弹珠玩法|手势挑战玩法|打砖块玩法|抓娃娃玩法|拦截防守玩法|接物收集玩法|时机反应玩法|格斗对战玩法|滚动竞速玩法|滚珠竞速玩法|生存战斗玩法|贪吃蛇玩法|赛车竞速玩法|赛马竞速玩法|跑酷避障玩法|飞行避障玩法|驾驶探索玩法",
    puzzle:"光路解谜玩法|合成玩法|密室逃脱玩法|寻物解谜玩法|寻词解谜玩法|消除玩法|画线解谜玩法|益智解谜玩法|知识问答玩法|空间拼图玩法|线索解谜玩法|翻牌测验玩法|翻牌记忆玩法|观察辨认玩法|迷宫收集玩法",
    simulation:"养成玩法|恋爱模拟玩法|烹饪模拟玩法|经营模拟玩法",
    exploration:"AI对话玩法|互动探索玩法|分支叙事玩法|叙事探索玩法|地图寻宝玩法|探索收集玩法|文字冒险玩法|潜行冒险玩法|角色冒险玩法|集卡收集玩法",
    creation:"AI创作玩法|手作创作玩法|收集装扮玩法|装扮创作玩法",
    rhythm:"音乐节奏玩法",
    social:"击球竞技玩法|卡牌对战玩法|合作冒险玩法|多人对战玩法|桌游掷骰玩法|猜拳玩法|社交推理玩法|网球竞技玩法|落点预测玩法|足球射门玩法",
    other:"小游戏合集玩法|机关互动玩法"
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
  function matches(c,filters){
    c=c&&typeof c==="object"?c:{};
    filters=filters&&typeof filters==="object"?filters:{};
    if(filters.mobileOnly&&c.mobile!=="yes")return false;
    if(filters.demoOnly&&!(typeof c.demo_url==="string"&&/^https?:\/\//i.test(c.demo_url)&&c.demo_type!=="puzzle_source"))return false;
    var grouped=classify(c);
    return (!filters.gameplay||grouped.gameplay===filters.gameplay)&&(!filters.industry||grouped.industry===filters.industry);
  }
  return {gameplayGroups:gameplayGroups,industryGroups:industryGroups,classify:classify,matches:matches};
});
