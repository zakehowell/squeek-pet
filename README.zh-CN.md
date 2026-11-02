# Squeek Pet

[English](README.md)

一只住在你桌面上的仓鼠，和 SqueekChain（Sepolia 测试网）上 **Squeektoshi 的真实跑轮**同步。

真实跑轮转起来，它就醒来，按真实转速奔跑。新测到的工作量会变成蓝色数据豆堆在跑轮旁边，跑完它会把豆子吃掉，再打个嗝报出准确的总数。链上结算出新的 Squeek 区块时，会冒出一个金色方块。数据过期或拿不到时，它会抱着问号等着，不会假装在睡觉。

平时它只是屏幕角落里的一只小仓鼠。鼠标移上去能看状态气泡，双击打开迷你面板。

![Squeektoshi 睡觉、醒来、奔跑、吃豆、庆祝结算区块、被摸头、等数据和生气](docs/screenshots/hamster.png)

> 状态：**MVP，版本 0.1.0。** Windows 可以直接[下载安装包](#windows)；macOS 和 Linux 需要[从源码编译](#从源码安装)，几分钟就好。已经在 Linux、Apple 芯片的 Mac 和 GitHub 的 Windows 机器上编译运行过。

## 安全和隐私

- 只读：只访问一个公开接口 `GET https://api.squeekchain.com/v1/status`。不连钱包，不碰私钥，不签名，不发交易。
- 没有账号、没有统计、不收集个人数据。设置只保存在你自己的电脑上。
- 只会打开 Squeek Pulse、SqueekChain 文档和 Sepolia 区块浏览器的链接。

## Windows

1. 打开[最新版本](https://github.com/zakehowell/squeek-pet/releases/latest)，下载文件名以 `-setup.exe` 结尾的安装包（`.msi` 也可以）。适用于 64 位 Windows 10 和 11。
2. 双击运行。安装包没有代码签名，第一次运行时 Windows 会提示「Windows 已保护你的电脑」，点「更多信息」，再点「仍要运行」。
3. 装好后，仓鼠会出现在右下角任务栏上方。菜单在通知区域的 Squeek Pet 图标里（如果被收起来了，点 `^`）。卸载：设置 → 应用。

安装包由 [GitHub Actions](.github/workflows/release.yml) 用本仓库的源码、在这个版本对应的提交上自动编译，没有人手动编译过。想核对下载的文件，可以和版本页里的 `SHA256SUMS.txt` 对比，或者运行 `gh attestation verify <文件> --repo zakehowell/squeek-pet`。

如果 Windows 11 打开了「智能应用控制」，它会直接拦下没有签名的程序，没有「仍要运行」，这种电脑上暂时装不了。

## 从源码安装

在自己电脑上编译出来的 app 不会被 macOS 拦截，打开时不会提示"无法验证开发者"。

**1. 先装好工具（只需要装一次）**

- [Node.js](https://nodejs.org/) 20.19 或更新版本。
- [Rust](https://www.rust-lang.org/zh-CN/tools/install)（stable 版，用 rustup 安装）。
- macOS：Xcode 命令行工具，在终端运行 `xcode-select --install`。
- Linux：按 [Tauri 环境说明](https://v2.tauri.app/zh-cn/start/prerequisites/) 安装 WebKitGTK 等依赖。
- Windows：按 [Tauri 环境说明](https://v2.tauri.app/zh-cn/start/prerequisites/) 安装 Microsoft C++ 生成工具（勾选「使用 C++ 的桌面开发」）和 WebView2（Windows 11 和更新过的 Windows 10 已自带）。一般人直接用[安装包](#windows)就好。

**2. 下载并编译**

```bash
git clone https://github.com/zakehowell/squeek-pet.git
cd squeek-pet
npm ci
npm run desktop:build
```

第一次编译要下载 Rust 依赖，需要几分钟。在 Apple 芯片的 Mac 上，正式版编译大约 80 秒。在 Mac 上只想要 app、不要 `.dmg` 的话，最后一步改成 `npm run desktop:build -- --bundles app`。

**3. 打开**

- macOS：`src-tauri/target/release/bundle/macos/Squeek Pet.app`，拖进"应用程序"文件夹即可。`src-tauri/target/release/bundle/dmg/` 里还有一个 `.dmg`。
- Linux：安装包在 `src-tauri/target/release/bundle/` 里（deb、rpm、appimage）。
- Windows：安装包在 `src-tauri\target\release\bundle\nsis\` 和 `msi\` 里。

仓鼠会出现在屏幕右下角。从托盘或菜单栏图标可以退出。

以后更新：先运行 `git pull`，再运行一次 `npm ci` 和 `npm run desktop:build`。

所有安装包都没有代码签名。Windows 安装包第一次运行会弹出 SmartScreen 提示，处理方法见[上面](#windows)。如果把自己编译的 Mac app 直接拷给别人，对方第一次打开会被 macOS 拦下（macOS 15 及以后：系统设置 → 隐私与安全性 → 仍要打开；更早的版本：右键 → 打开）。让每个人在自己电脑上从源码编译，就没有这个问题。

## 怎么和它玩

| 你 | 仓鼠 |
| --- | --- |
| 鼠标移上去 | 看着你，显示状态气泡（睡觉时显示 `Zzz…`） |
| 鼠标在附近移动 | 眼睛跟着转 |
| 单击 | 眨眨眼；打开声音时会吱一声 |
| 快速连点四下 | 生一会儿气 |
| 在头上来回蹭 | 眯眼开心，冒出爱心 |
| 拖动 | 换个位置，会记住 |
| 双击 | 迷你面板：跑轮状态、转速、今天的距离、测到的工作量、结算区块和交易链接 |
| 右键 | 菜单：详情、大小、声音、演示模式、Squeek Pulse、设置、隐藏、退出 |

设置里可以改：语言（中文 / English，默认跟随系统）、大小（40% 到 150%，默认 75%）、动画流畅度（省电 15 帧、均衡 30 帧、流畅 60 帧，也决定读取频率）、每颗豆子代表的工作量、置顶、开机启动、声音（默认关闭）、活动通知和演示模式。演示模式始终标着 `DEMO`，不会和真实数据混在一起。

桌面版的状态气泡和详情面板使用独立的透明窗口：上方空间足够时显示在上面，宠物靠近屏幕顶部时自动显示在下面。气泡不再占用宠物窗口的空白区域，因此可以把宠物拖到顶部。卡片会避开当前屏幕的菜单栏和 Dock，空间不足时详情内容可以滚动查看。

## 许可

代码和美术（仓鼠、跑轮、碗、窝和图标）都是原创，按 [MIT](LICENSE) 开源。不包含 SqueekChain 官方美术。SqueekChain 的名称、商标、文档和 API 仍归其所有者，不在本项目的许可范围内。
