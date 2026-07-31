import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stagePortableApplication } from "./runtime-release.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(projectRoot, "..", "..");
const artifactRoot = join(repositoryRoot, "artifacts", "local");
const stagingRoot = join(repositoryRoot, "artifacts", `.staging-local-package-${randomUUID()}`);
const packageFolderName = "Week-UP-local";
const packageRoot = join(stagingRoot, packageFolderName);
const appRoot = join(packageRoot, "app");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const archivePath = join(artifactRoot, `Week-UP-local-${packageJson.version}.zip`);

const launcher = `param()
$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Join-Path $packageRoot "app"
$installer = Join-Path $appRoot "scripts\\install-week-up-autostart.ps1"
if (-not (Test-Path -LiteralPath $installer)) { throw "Week UP installer is incomplete: $installer" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -ProjectRoot $appRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Week UP is available at http://127.0.0.1:4173/"
`;

const instructions = `Week UP 本地部署包

要求：Windows 10/11，Node.js 22.13.0 或更高版本。

安装：
1. 完整解压本压缩包。
2. 右键“安装 Week UP.ps1”，选择“使用 PowerShell 运行”；或在 PowerShell 中执行：
   powershell -NoProfile -ExecutionPolicy Bypass -File ".\\安装 Week UP.ps1"
3. 安装完成后访问 http://127.0.0.1:4173/

应用文件默认安装到：%LOCALAPPDATA%\\Programs\\Week UP
用户数据单独保存到：%LOCALAPPDATA%\\Week UP
升级应用不会把用户数据库、备份或密钥打进安装包。
`;

try {
  await mkdir(packageRoot, { recursive: true });
  await stagePortableApplication({ projectRoot, targetRoot: appRoot });
  await Promise.all([
    writeFile(join(packageRoot, "安装 Week UP.ps1"), launcher, "utf8"),
    writeFile(join(packageRoot, "README-本地部署.txt"), instructions, "utf8"),
  ]);
  await mkdir(artifactRoot, { recursive: true });
  await rm(archivePath, { force: true });
  execFileSync("tar.exe", ["-a", "-c", "-f", archivePath, "-C", stagingRoot, packageFolderName], {
    stdio: "inherit",
    windowsHide: true,
  });
  const archive = await stat(archivePath);
  process.stdout.write(`${JSON.stringify({ archivePath, bytes: archive.size, megabytes: Number((archive.size / 1024 / 1024).toFixed(2)) })}\n`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
