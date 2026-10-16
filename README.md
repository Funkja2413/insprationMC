# 互动营销灵感库

https://funkja2413.github.io/insprationMC/

静态案例库：`index.html` 展示 `data/cases.json`，`images/` 保存案例图片。网站的「删除」按钮将排除记录写入 `data/removed.json`；发布时必须保留它，已删除的案例不能重新加入。

## 追加案例

使用 Python 3，无需安装依赖。开始前确认工作区干净，并同步最新 `main`，以免覆盖用户刚刚删除的记录或其他更新：

```bash
git switch main
git pull --ff-only origin main
python3 publish.py --check
```

先核实官方或制作方来源，将真实案例图片保存到 `images/`，并在批次记录或提交说明中注明图片来源。不要用合成图冒充项目实机画面。新批次可放在仓库外，格式为案例数组，或 `{"cases": [...]}`。

每条案例保留以下必需字段：`id`、`title_zh`、`brand`、`agency`、`region`、`format`、`date`、`why_zh`、`style_zh`、`live_url`、`source_url`、`image`、`mobile`、`tags`。`tags` 是字符串数组，其余必需字段是字符串。`id` 必须唯一、稳定；`image` 推荐使用 `images/案例名.webp` 等本地相对路径。日期按来源支持的精度填写，未知时可留空，不推测日期或当前可玩状态。

可选兼容字段：

- `demo_url`：真实实机演示视频或演示页面，单独展示为「实机演示」，不要放进试玩入口。
- `availability_zh`：核验事实，例如「活动已结束」「入口可访问，未完整试玩」「原试玩返回 403」。
- `live_label`：体验链接的准确标签；没有完成试玩核验时可写「活动入口」，不应暗示已经确认可玩。
- `mobile: "historical"`：历史手机互动案例；用于活动已结束或当前可玩性未确认的项目。`mobile: "yes"` 应有当前手机试玩依据。旧字段值与已有案例继续保留。

```bash
python3 publish.py /path/new-cases.json --date YYYY-MM-DD
python3 publish.py --check
git diff --stat
git diff -- data/cases.json data/removed.json
```

将 `YYYY-MM-DD` 替换为实际库更新日期；它只更新文件顶层 `updated`，不会更改各案例的 `date`。脚本按批次顺序前置新增案例，保留所有已有案例对象、顺序及其他顶层字段。相同 `id` 且内容完全相同会跳过；相同 `id` 但内容不同会报错，整批不写入。排除清单中的 `id` 会跳过。没有新增时不会改写数据文件，重复运行不会制造重复案例。脚本永不改写 `data/removed.json`。

`--check` 仅检查：案例条数与 `count` 一致、必需字段及类型、唯一 `id`、本地图片存在，以及案例未命中排除清单。它不会联网核实链接、图片内容或可玩性；历史 `live_url` 中的非 URL 文本仍可保留。提交前另行检查图片清晰度、入口和演示视频，确认案例卡片、筛选和删除功能正常。

## 发布与核验

脚本只准备数据，不提交、不推送、不处理凭据，也不创建自动任务。确认变更后，使用本机已配置的 GitHub 访问方式提交到 `main` 并推送。若远端在此期间有更新，先同步并重新检查排除清单和数据，不要强制推送或覆盖远端删除记录。

推送后在 GitHub Actions / Pages 中确认对应提交的部署成功，再打开[线上案例库](https://funkja2413.github.io/insprationMC/)核验新增条数、图片、实机演示和体验入口，并确认已删除案例仍然隐藏。仅提交或推送成功，不代表 Pages 已完成部署。
