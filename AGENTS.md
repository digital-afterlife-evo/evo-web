# 数字余生 · web 开发约定

本仓库是黑客松项目的展览首页与对话网页。相邻的 `evo-backend/` 负责会话、模型、ASR 和打印编排；`board/` 负责实体打字机。先读本仓库 README 和相关交互代码，再按实际接口修改，不把页面演示效果写成后端或硬件已经完成的事实。

- 页面入口和切换在 `src/App.jsx`，会话事件在 `src/useConversation.js`、`src/chat.js`，语音在 `src/useSpeech.js`，设备和打印状态在 `src/useStatus.js`、`src/StatusPanel.jsx`。优先复用现有状态和组件，保持改动简短。
- 浏览器只请求同源 `/api/v1`；访问令牌由 `server/gateway.js` 在服务端附加。不要使用 `VITE_` 暴露令牌或模型/ASR 密钥，也不要绕过网关直接在浏览器请求供应商。
- 状态卡必须反映实际事件：录音、转写、模型处理、设备连接和打印各有独立来源。未知交付或纸面结果保持待确认；不得用定时动画或 HTTP 成功假装已打印。
- 语音转写先进入可编辑草稿，用户确认后发送；保留文字输入在麦克风或设备不可用时的完整路径。注意键盘、焦点、窄屏及减少动态效果偏好。
- 保留用户未提交的修改；仅在相关范围运行 `npm.cmd test`、`npm.cmd run test:integration`、`npm.cmd run build`。代码注释沿用现有英文风格；未要求时不推送或改写 Git 历史。
