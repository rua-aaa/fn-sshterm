# sshterm · SSH xterm

参考 [fnpackup](https://github.com/snltty/fnpackup) 风格的网页 SSH 终端（Vue3 + Element Plus + xterm.js + Node ssh2），含飞牛 fnOS fpk 打包工程。

## 功能

- 连接配置、多标签 SSH、本机 Shell
- WebSocket + ssh2
- fnOS iframe 入口、大圆角 UI、侧栏可收缩

## 开发

```bash
npm install && cd web && npm install && cd ..
npm run build:web && npm start
# http://localhost:1070
```

## fnOS

1. 应用中心安装 Node.js v22  
2. 安装 release 下的 fpk  
3. 启动后访问 `http://NAS-IP:1070/`

接口：`/api/health` `/api/self` `/api/profiles` `WS /ws/ssh`

仅内网使用，勿将 1070 暴露公网。
