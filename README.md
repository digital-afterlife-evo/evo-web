# 数字余生 · 网页展览与对话

本仓库是黑客松项目「数字余生」的网页入口：用一段展览式首页引导用户进入对话，让用户以文字或语音与数字分身交流，并观察 Agent 与实体打字机的实际状态。对话后端在相邻的 `../evo-backend`；硬件链路在 `../board`。

## 已实现的页面

- 首页 `Landing.jsx` 展示项目叙事和进入对话的入口；`#conversation` 打开对话页。
- 对话页支持文字发送、SSE 流式回复、会话恢复与新建、复制及导出文字；一次只处理一轮活跃请求。
- 麦克风录音经后端 ASR 转成文字，追加到可编辑草稿，用户确认后再发送；录音失败不阻断文字输入。
- 状态面板显示当前 Agent 动作、实体设备连接与英文打印队列；打印结果不确定时提供人工核对操作。

网页不会直接连接模型供应商或读取其密钥。`server/gateway.js` 作为 Vite 开发及预览服务的同源 API 网关，在服务端向后端附加 `BACKEND_WEB_TOKEN`，并只转发允许的 `/api/v1` 路径。

## 本地运行

需要 Node.js 22.12+。先按 [后端说明](../evo-backend/README.md) 启动后端，再在本仓库执行：

```powershell
npm.cmd ci
Copy-Item -LiteralPath ".env.example" -Destination ".env.local"
# 若不使用相邻后端 .env 的令牌，在 .env.local 填写 BACKEND_WEB_TOKEN。
npm.cmd run dev
```

打开 `http://127.0.0.1:5173`。默认后端地址是 `http://127.0.0.1:3000`；前后端分开部署时设置 `BACKEND_URL` 和相同的 `BACKEND_WEB_TOKEN`。前端网关会读取相邻 `evo-backend/.env` 的令牌作为本地便利方式。修改环境变量后重启 Vite。浏览器录音需要麦克风权限和安全上下文，本机 `127.0.0.1` 可用。

打字机是可选实体呈现设备：不接设备时对话可以继续，状态面板应如实显示未连接。网页不会把中文回复直接当成纸面打印完成。

## 目录与检查

- `src/`：React 页面、会话事件、语音、状态和样式。
- `server/gateway.js`：后端代理与服务端令牌。
- `test/`：页面逻辑和跨端集成检查。
- `public/design/`：展览视觉素材。

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
```

跨端集成测试使用相邻后端和本地模拟模型；真实 ASR、模型供应商、麦克风及实体打印仍需现场验证。构建结果在 `dist/`；单独静态托管该目录不会部署 Vite 的 API 网关，正式部署须在服务端另行配置 `/api/v1` 转发并保管令牌。
