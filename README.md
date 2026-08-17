# 穿搭助手手机网页

当前已经实现一套可真实使用的手机网页流程：

- 搜索真实城市或使用当前位置，并读取当地天气。
- 添加衣物时可选传水洗标、购买吊牌或两者；标签文字在浏览器端读取，用户可以修改结果。
- 首页保留最近使用的三个场景，并可从完整场景列表切换后立即更新搭配。
- 衣橱按上衣、下装、外套、鞋和袜子分类展示，衣物详情可以修改照片、材质、标签信息和当前状态。
- 穿后将衣物拖回衣架或脏衣篓；待洗衣物不会进入下一次推荐。

## 发布方式

网站使用 GitHub Pages 独立发布，不依赖 OpenAI Sites 或 Cloudflare。

- 源代码继续保存在当前文件夹，可以由 Codex 修改。
- 推送到 GitHub 的 `main` 分支后，GitHub Actions 会自动测试并发布。
- 页面使用 Hash 路由，分享 `/#/today` 等地址时不会因刷新出现 404。
- 衣服照片、城市和穿搭记录只保存在当前浏览器，不上传到 GitHub。
- 首次读取标签时需要联网下载文字识别模型，之后浏览器会复用已缓存的模型。

## 本地千问衣物识别

公开 GitHub Pages 不保存 API Key，因此线上页面暂不显示千问识别入口。本地验证时，密钥只保存在被 Git 忽略的 `.env.ai.local` 中，由本机后台代为调用千问。

```bash
cp .env.ai.example .env.ai.local
# 在 .env.ai.local 中填写 DASHSCOPE_API_KEY
pnpm run dev:ai
```

然后打开 `http://127.0.0.1:5173/#/wardrobe/add`。选择衣物照片后，可以让千问预填具体类别、主颜色以及图片中能确认的信息；所有结果都需要用户检查后才会保存。

- 衣物主图及用户主动添加的标签图会发送到阿里云完成本次识别。
- 本机后台不保存上传图片。
- 不得把 `.env.ai.local`、API Key 或服务端密钥写入前端代码或上传 GitHub。

## 本地运行

```bash
pnpm install
pnpm run dev
```

## 发布新版

```bash
git add .
git commit -m "Update wardrobe app"
git push
```

GitHub Pages 会自动更新。首版不建立用户账号，也不跨设备同步。
