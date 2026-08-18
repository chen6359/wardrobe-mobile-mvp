# 穿搭助手手机网页

当前已经实现一套可真实使用的手机网页流程：

- 搜索真实城市或使用当前位置，并读取当地天气。
- 添加衣物时可选传水洗标、购买吊牌或两者；标签文字在浏览器端读取，用户可以修改结果。
- 上传主图后自动整理衣物主体和背景，确认前可以在整理图与原图之间切换。
- 千问可以预填衣物类别、颜色、图案和图片中能够确认的信息，最终仍由用户检查。
- 首页保留最近使用的三个场景，并可从完整场景列表切换后立即更新搭配。
- 衣橱按上衣、下装、外套、鞋和袜子分类展示，衣物详情可以修改照片、材质、标签信息和当前状态。
- 穿后将衣物拖回衣架或脏衣篓；待洗衣物不会进入下一次推荐。

## 发布方式

网站使用 GitHub Pages 独立发布，不依赖 OpenAI Sites 或 Cloudflare。

- 源代码继续保存在当前文件夹，可以由 Codex 修改。
- 推送到 GitHub 的 `main` 分支后，GitHub Actions 会自动测试并发布。
- 页面使用 Hash 路由，分享 `/#/today` 等地址时不会因刷新出现 404。
- 衣服照片、城市和穿搭记录只保存在当前浏览器，不上传到 GitHub。
- 复杂背景首次整理时需要联网下载浏览器端分割模型，之后浏览器会复用已缓存的模型；干净商品图不需要等待模型。

## 千问衣物识别

公开网页只保存识别服务地址，不保存 API Key。阿里云密钥必须由函数计算或本机后台通过环境变量读取，不得写入 GitHub Pages。

本地验证时，密钥只保存在被 Git 忽略的 `.env.ai.local` 中：

```bash
cp .env.ai.example .env.ai.local
# 在 .env.ai.local 中填写 DASHSCOPE_API_KEY
pnpm run dev:ai
```

然后打开 `http://127.0.0.1:5173/#/wardrobe/add`。选择衣物照片后，可以让千问预填具体类别、主颜色以及图片中能确认的信息；所有结果都需要用户检查后才会保存。

- 衣物主图及用户主动添加的标签图会发送到阿里云完成本次识别。
- 识别后台不保存上传图片；衣物抠图在用户设备上完成。
- 不得把 `.env.ai.local`、API Key 或服务端密钥写入前端代码或上传 GitHub。

生产环境可以使用 `server/fc-web-server.mjs` 作为阿里云函数计算 Web 函数启动文件，并配置：

- 环境变量 `DASHSCOPE_API_KEY` 和可选的 `QWEN_VISION_MODEL`。
- Node.js 20 或更新运行环境，启动命令 `node server/fc-web-server.mjs`，监听端口 `9000`。
- 公网访问允许 `GET`、`POST`、`OPTIONS`。
- 前端构建变量 `VITE_AI_RECOGNITION_ENDPOINT` 指向函数的 `/api/recognize` 地址。

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
