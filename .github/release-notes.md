## Windows

Download the **`-setup.exe`** file below (or the `.msi`) and run it. For 64-bit Windows 10 and 11.

- These installers were built by GitHub Actions from the public source in this repository, at the commit this release points to. Nobody built them by hand.
- They are not code-signed. The first time you run one, Windows SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
- To check a file: compare its SHA-256 with `SHA256SUMS.txt`, or run `gh attestation verify <file> --repo zakehowell/squeek-pet`.
- After installing, the hamster sits above the taskbar at the bottom right. Its menu is the Squeek Pet icon in the notification area (click `^` if Windows hides it). Uninstall it from Settings → Apps.
- Read-only: it only reads the public `GET https://api.squeekchain.com/v1/status`. No wallet, no keys, no signatures.

macOS and Linux: build it from source, see the [README](https://github.com/zakehowell/squeek-pet#install-from-source).

## Windows 版

下载下面的 **`-setup.exe`** 文件（或 `.msi`）双击安装，适用于 64 位 Windows 10 和 11。

- 安装包由 GitHub Actions 用本仓库公开的源码、在这个版本对应的提交上自动编译，没有人手动编译过。
- 安装包没有代码签名。第一次运行时 Windows 会提示「Windows 已保护你的电脑」，点「更多信息」，再点「仍要运行」。
- 核对文件：把它的 SHA-256 和 `SHA256SUMS.txt` 对比，或者运行 `gh attestation verify <文件> --repo zakehowell/squeek-pet`。
- 装好后，仓鼠会待在右下角任务栏上方。菜单在通知区域的 Squeek Pet 图标里（如果被收起来了，点 `^`）。卸载：设置 → 应用。
- 只读：只读取公开的 `GET https://api.squeekchain.com/v1/status`，不连钱包、不碰私钥、不签名。

macOS 和 Linux：从源码编译，见 [README](https://github.com/zakehowell/squeek-pet/blob/main/README.zh-CN.md)。
