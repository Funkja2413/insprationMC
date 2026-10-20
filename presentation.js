(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.InspoPresentation=factory();
})(typeof window!=="undefined"?window:this,function(){
  "use strict";

  function text(value){return typeof value==="string"?value:""}
  function rule(label,pattern){return {label:label,pattern:pattern}}
  function match(rules,value){
    for(var i=0;i<rules.length;i++)if(rules[i].pattern.test(value))return rules[i].label;
    return "";
  }
  function firstMention(rules,value){
    var label="", position=Infinity;
    rules.forEach(function(entry){
      var found=entry.pattern.exec(value);
      if(found&&found.index<position){label=entry.label;position=found.index}
    });
    return label;
  }

  // Product lines and co-branded projects come first. A sponsor's sector is
  // taken from the brand field, never from a reward, platform or game prop.
  var industryRules=[
    rule("科技品牌",/^Google\b|^NVIDIA\b|^Meta\b/i),
    rule("食品品牌",/^Oreo\b|CalorieMate/i),
    rule("零售品牌",/African & Eastern|JD Sports|^ビックカメラ/i),
    rule("联名品牌",/^SEGA.*广岛/),
    rule("音乐品牌",/FantaSanremo/i),
    rule("工业品牌",/Hyundai Steel|现代制铁|丰田自动织机|Toyota L&F|JTEKT|捷太格特/i),
    rule("金融品牌",/MINI\s*金融|汽车金融|Cash App|Klarna|Coastal Community Bank|Sparkasse|Garance/i),
    rule("影视品牌",/Lotte Entertainment/i),
    rule("食品品牌",/Bandai Candy|万代.*威化|CLEVO.*GarudaFood/i),
    rule("美妆品牌",/Dolce.?Gabbana Beauty|Miu Miu Twist|Montblanc Legend|Interparfums/i),
    rule("体育品牌",/Alinghi Red Bull Racing|Oracle Red Bull Racing|Haas F1|J 联赛|LaLiga|Basic.Fit/i),
    rule("教育品牌",/仏教伝道協会|Cap Métiers|Grand Canyon University|Kennedy Presidential Library/i),
    rule("公益品牌",/Crop Trust|Live in Color|National Citizen Service|WWF|くるりんペット/i),
    rule("餐饮品牌",/KFC|肯德基|McDonald|麦当劳|CoCo\s*壱番屋|Ichibanya|ED[IＩ]YA|Just Eat|Sushiro|寿司郎|Hopdoddy|Feedy Diner|Domino|达美乐|MOS Burger|Beard Papa|マラサダドーナツ|Raising Cane|Marrybrown|Swiggy|Jack in the Box|転転麻辣湯/i),
    rule("饮料品牌",/Coca.Cola|可口可[乐樂]|Coke Studio|Fanta\b|Qoo\b|smartwater|Red Bull|红牛|Asahi|朝日饮料|Dodecamin|O.?boy|Fibe.Mini|La Revoltosa/i),
    rule("酒类品牌",/Jägermeister|Jagermeister|Tiger Beer|Heineken|喜力|High West|Santioni|Château Oublié/i),
    rule("食品品牌",/Glico|BifiX|日清オイリオ|BOSCO|マルタイ|Marutai|OREO|Pringles|Kanro|Calbee|Maruchan|Toyo Suisan|大塚製薬.*CalorieMate|PRESS BUTTER SAND|Chupa Chups|三幸制菓|井村屋|Binggrae|青森苹果|Twix|Kinder Joy|Laughing Cow|Vache qui rit|Kerrygold|Black Thunder|Pocky|Doritos|Tohato|Chocapic|Nestlé|Lotus Biscoff|ロッテ|Coolish|Heinz|三养食品|Buldak|Mora|森永|Keebler|ハコネーゼ|Snickers|士力架/i),
    rule("医药健康品牌",/Roche|Lipovitan|Taisho|Nutrilite|纽崔莱|Natural Elements|Mucinex|Durex|杜蕾斯|Okamoto|ZEISS|蔡司|Essilor|依视路|Mentholatum|曼秀雷敦/i),
    rule("美妆品牌",/Biore|ANESSA|安耐曬|Clé de Peau|Clinique|IPSA|茵芙莎|Beautyblender|Occitane|欧舒丹|NARS|Jo Malone/i),
    rule("日用品品牌",/Regina|Sofidel|P&G|Bold\b|アース製薬|ダニ捕りラボ|花王|Ecover/i),
    rule("母婴品牌",/POLED|airluv/i),
    rule("文具品牌",/KOKUYO|Campus 笔记本/i),
    rule("家居品牌",/Louis Poulsen|MLILY|夢百合|Pierret|IKEA|Sebach/i),
    rule("能源品牌",/GoodWe|固德威/i),
    rule("家电品牌",/SHARP|KDK|Philips|飞利浦/i),
    rule("汽车品牌",/Toyota|丰田|Volkswagen|Hyundai|YellowHat|Acura|讴歌|Renault|雷诺|Kia|起亚|Lexus|DENSO|电装/i),
    rule("通信品牌",/Orange Belgium|Comcast Business|Spark New Zealand|Proximus|Virgin Media|NTT Docomo|2degrees|^EE$/i),
    rule("出行品牌",/Uber|TADA|OUIGO|SNCF/i),
    rule("文旅品牌",/佐贺县|Saga Prize|Liseberg|Seoul City Tour|新加坡话剧团|Singapore Repertory Theatre/i),
    rule("户外品牌",/ogawa|CAMPAL JAPAN/i),
    rule("运动服饰品牌",/Nike|耐克|adidas|Kappa|JD Sports/i),
    rule("珠宝腕表品牌",/Cartier|卡地亚|Boucheron|宝诗龙|Audemars Piguet|爱彼|4℃|F\.D\.C\. Products/i),
    rule("时尚品牌",/UNIQLO|Psycho Bunny|Victoria.?s Secret|LOEWE|Loro Piana|Diesel|Gentle Monster|45R|Team Vitality|Kenzo|Miu Miu|Hermès|爱马仕|Lacoste|Max Mara|BEAMS|Gucci|Cool Shirtz/i),
    rule("零售品牌",/MediaWorld|CJ OnStyle|Mira Place|美麗華|Galeries Lafayette|老佛爷|E\.Leclerc|Tesco|乐购|ビックカメラ|Carrefour/i),
    rule("园艺品牌",/konae/i),
    rule("电商品牌",/Cdiscount|Zepto/i),
    rule("玩具品牌",/LEGO|Mattel UNO/i),
    rule("游戏品牌",/Netmarble|Bandai Namco Entertainment|Xbox|King.*Candy Crush|日本一软件|GOBBLE|Monster Strike|怪物弹珠|Arknights|明日方舟|SEGA.*ぷよぷよ|Twisted.Wonderland/i),
    rule("音乐品牌",/¥ellow Bucks|Zedd|ACCEPT|Pitbull|Muse\s*\/|Sabaton|Porter Robinson|Spotify|SEVENTEEN|blink.182/i),
    rule("影视品牌",/Big Brother|Network 10|テレビ東京|Sky Original|Netflix|HBO|Hulu|A24|Asmik Ace|岸辺露伴|Paramount|Legendary|JoJo|Steel Ball Run|The Traitors|Universal Pictures|甲上娛樂|Studio Ghibli|鬼滅之刃/i),
    rule("传媒品牌",/Urban Vision|DIRECTV|Audible|talkSPORT|吉本兴业|Vogue Business/i),
    rule("创意服务品牌",/KAYAC|カヤック|Intertrend/i),
    rule("地产品牌",/一建设/i),
    rule("科技品牌",/Google|NVIDIA|ASUS|ROG|Samsung|三星|JBL|Kakao|IBM|MSI|微星|Height|World\s*\/|Tools for Humanity|IDEMIA|Salesforce|Firefox|Mozilla|Cyera|^Meta\b/i)
  ];

  // Recognise the interaction, not its delivery platform. The order resolves
  // overlaps such as rhythm fighting, card combat versus collecting, or
  // cooking versus finding ingredients. Format/tags outrank narrative copy.
  var mechanicRules=[
    rule("社交推理玩法",/社交推理|猜身份|实时换脸|真假任务问答/),
    rule("恋爱模拟玩法",/恋爱模拟|戀愛模擬/),
    rule("经营模拟玩法",/经营|經營|财务决策|育种|种田|農場|農業模擬/),
    rule("烹饪模拟玩法",/烹饪|配餐操作|订单制作|配料选择|配方记忆|披萨制作|订单复刻|互动食谱/),
    rule("卡牌对战玩法",/卡牌.{0,6}(对战|战斗)|卡牌合成|团队 Raid|卡牌对战 War/),
    rule("集卡收集玩法",/集卡|数字收藏册|模拟开包|球星卡|梦幻足球/),
    rule("翻牌测验玩法",/塔罗|角色测验|心理测试/),
    rule("收集装扮玩法",/限时掉落|限量掉落|走秀/),
    rule("装扮创作玩法",/主题装扮|珠宝定制|拼贴|共创设计|产品共创|自由造房|自由创作/),
    rule("AI创作玩法",/提示词创作|创意评分|嗅觉签名/),
    rule("AI对话玩法",/AI\s*对话|生成式 AI 对话|AI 对话驱动/),
    rule("密室逃脱玩法",/密室逃脱|密室逃脫|恐怖解谜|协作逃脱/),
    rule("文字冒险玩法",/文字冒险/),
    rule("分支叙事玩法",/分支情境|分支选择|分支恐怖|分支叙事|道德抉择/),
    rule("潜行冒险玩法",/潜行|潛行/),
    rule("线索解谜玩法",/\bARG\b|密码解谜|密码提交|密码题|密码锁|解码|解謎尋寶/i),
    rule("光路解谜玩法",/光路解谜/),
    rule("画线解谜玩法",/画线|畫線/),
    rule("地图寻宝玩法",/GPS.{0,4}寻宝|地图.{0,5}寻宝|AR尋寶|AR寻宝|星图寻宝|扫码寻物|城市寻宝|橱窗寻宝/),
    rule("空间拼图玩法",/拼图|拼圖|路径益智|仓库拼图|俄罗斯方块/),
    rule("翻牌记忆玩法",/翻牌记忆|记忆翻牌|记忆配对|記憶配對/),
    rule("消除玩法",/三消|消除|噗哟|ぷよぷよ/),
    rule("合成玩法",/物理下落合成|合成/),
    rule("音乐节奏玩法",/节奏|節奏|音游|音樂拼圖|自由演奏/),
    rule("抓娃娃玩法",/抓娃娃/),
    rule("打砖块玩法",/打砖块/),
    rule("弹珠玩法",/弹珠游戏|彈珠遊戲/),
    rule("贪吃蛇玩法",/贪吃蛇|贪食蛇/),
    rule("桌游掷骰玩法",/掷骰|飞行棋|桌游/),
    rule("猜拳玩法",/猜拳/),
    rule("网球竞技玩法",/网球|網球/),
    rule("足球射门玩法",/足球瞄准|点球|足球撞击|足球小游戏/),
    rule("击球竞技玩法",/板球|击球|球拍/),
    rule("落点预测玩法",/落点预测/),
    rule("赛马竞速玩法",/赛马|賽馬/),
    rule("帆船竞速玩法",/帆船/),
    rule("赛车竞速玩法",/赛车|賽車|迷宫驾驶|驾驶游戏|陀螺仪驾驶|汽车配置/),
    rule("驾驶探索玩法",/驾驶式探索|驾驶探索|驾驶小游戏|体感.{0,8}驾驶/),
    rule("滚珠竞速玩法",/滚珠|滾珠/),
    rule("滚动竞速玩法",/往下滚|向下滚/),
    rule("格斗对战玩法",/格斗|格鬥|横版战斗|指令格斗/),
    rule("生存战斗玩法",/幸存者|生存动作|探索猎魔|生存战斗|剃毛才能回血|剃须刀.{0,8}武器/),
    rule("动作射击玩法",/射击|射擊|\bFPS\b|跑跳射击|太空射击/i),
    rule("跑酷避障玩法",/跑酷|跑跳|跑跳收集|横向三车道避障|限时赶车|多轨道|无限赛道|無盡/),
    rule("平台跳跃玩法",/平台跳跃|平台动作|縱向跳躍|纵向跳跃|横向卷轴跳跃|蓄力跳跃|像素平台|一键跳跃|踩着云|蓄力.{0,12}跨越/),
    rule("迷宫收集玩法",/迷宫|迷宮|吃豆人|PAC.MAN/i),
    rule("飞行避障玩法",/飞行游戏|飞行收集/),
    rule("寻物解谜玩法",/寻物|找物|找不同|3D尋物|环境解谜/),
    rule("观察辨认玩法",/观察力|限时识别|产品辨认|视觉辨认|找色|商品辨識|点击分类|色彩观察|目标识别|模拟验证码|歌牌找图/),
    rule("寻词解谜玩法",/寻词|字母排序|文字解谜/),
    rule("知识问答玩法",/问答|答题|知识答题/),
    rule("养成玩法",/养成|養成|电子宠物/),
    rule("接物收集玩法",/接物|接落物|接取|接住飘落/),
    rule("拦截防守玩法",/拦住|守住|拦截/),
    rule("体感切割玩法",/切水果|切块/),
    rule("手势挑战玩法",/手势识别|动作纠错/),
    rule("声控挑战玩法",/声控|声音挑战|声音互动|聲控/),
    rule("体感反应玩法",/面部追踪|凝视|表情控制|人臉控制|头部追踪/),
    rule("时机反应玩法",/时机|時機|反应|反應|颠球|滑动距离|限时点击|限時點擊|限时划卡|避障|躲障碍|点中抓到|一层层往上够/),
    rule("合作冒险玩法",/多人合作冒险|多人协作|集体协作|雙人|双人/),
    rule("多人对战玩法",/多人对战|实时对战|对战式|对战/),
    rule("探索收集玩法",/探索收集|限时收集|采集冒险|图鉴收集|收集|收集圖鑑|扒下整套/),
    rule("角色冒险玩法",/角色扮演|\bRPG\b|角色探索/i),
    rule("手作创作玩法",/手作|数字工匠/),
    rule("叙事探索玩法",/叙事|敘事|交互电影|互动电影|交互报告|立体书/),
    rule("机关互动玩法",/玩具式|机关.{0,8}触发|强烈的视觉反馈/),
    rule("益智解谜玩法",/解谜|解謎|益智/),
    rule("动作闯关玩法",/动作|闯关|跳跃|闖關|跳躍|竞速|競速/),
    rule("体感互动玩法",/体感|體感|传感器/)
  ];
  var collectionPattern=/小游戏合集|微游戏合集|街机合集|游戏合集|多玩法|双小游戏|四种岗位|三颗星球|多种.{0,4}小游戏|[2-9二三四五六七八九十]\s*(款|个|项).{0,8}(小游戏|音乐主题任务)/;

  function summarize(c){
    c=c&&typeof c==="object"?c:{};
    var brand=text(c.brand), format=text(c.format), title=text(c.title_zh);
    var tags=Array.isArray(c.tags)?c.tags.filter(function(t){return typeof t==="string"}).join(" / "):"";
    var signals=format+" / "+tags, description=text(c.why_zh);
    // Explicit collections remain collections instead of being named after
    // whichever of their several component games happens to match first.
    var mechanic=collectionPattern.test(signals)?"小游戏合集玩法":match(mechanicRules,signals);
    // In prose, the described core action generally precedes reward systems
    // and unlocks. Do not let a later "race car reward" or "secret password"
    // rename a running game.
    if(!mechanic)mechanic=collectionPattern.test(description)?"小游戏合集玩法":firstMention(mechanicRules,description)||match(mechanicRules,title);
    if(mechanic==="体感互动玩法")mechanic=firstMention(mechanicRules,description)||mechanic;
    var industry=match(industryRules,brand);
    if(/Hermès|爱马仕/i.test(brand)&&/香氛|香水/.test(signals))industry="美妆品牌";
    return {mechanic:mechanic||"互动探索玩法",industry:industry||"综合品牌"};
  }
  return {summarize:summarize};
});
