# Releases / 安装包

从 [Releases v1.1.0](https://github.com/rua-aaa/fn-sshterm/releases/tag/v1.1.0) 下载 fpk。

## 多架构（1.1.0）

| 文件 | platform | 适用 |
| --- | --- | --- |
| [sshterm-1.1.0-all.fpk](https://github.com/rua-aaa/fn-sshterm/releases/download/v1.1.0/sshterm-1.1.0-all.fpk) | all | 通用，推荐 |
| [sshterm-1.1.0-x86.fpk](https://github.com/rua-aaa/fn-sshterm/releases/download/v1.1.0/sshterm-1.1.0-x86.fpk) | x86 | x86_64 NAS |
| [sshterm-1.1.0-arm.fpk](https://github.com/rua-aaa/fn-sshterm/releases/download/v1.1.0/sshterm-1.1.0-arm.fpk) | arm | arm64 NAS |

## 旧版本

| 文件 | 说明 |
| --- | --- |
| sshterm-1.0.9-ui.fpk | 大圆角 UI、侧栏收缩 |
| sshterm-1.0.8-root.fpk | root 本机 Shell |

## 安装

1. 应用中心安装 **Node.js v22**
2. 手动安装对应架构的 fpk
3. 应用中心 **启动** SSH Terminal
4. 浏览器打开 `http://NAS-IP:1070/`，或桌面图标

依赖为 `ignore-scripts` 纯 JS + 系统 `nodejs_v22`，不依赖 Docker。
