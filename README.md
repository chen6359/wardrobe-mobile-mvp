# 穿搭助手手机网页

当前实现首次开始、添加衣物、衣橱准备完成和今日推荐等首期流程。

## 发布方式

网站使用 GitHub Pages 独立发布，不依赖 OpenAI Sites 或 Cloudflare。

- 源代码继续保存在当前文件夹，可以由 Codex 修改。
- 推送到 GitHub 的 `main` 分支后，GitHub Actions 会自动测试并发布。
- 页面使用 Hash 路由，分享 `/#/today` 等地址时不会因刷新出现 404。
- 衣服照片、城市和穿搭记录只保存在当前浏览器，不上传到 GitHub。

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
