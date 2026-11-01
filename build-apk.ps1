# Builds dist/TicTacToe.apk without Gradle, straight from the Android SDK tools.
# Usage:  powershell -ExecutionPolicy Bypass -File build-apk.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$VersionCode = 1
$VersionName = '1.0'
$MinSdk = 24
$TargetSdk = 36

# ---- locate SDK tools ----
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" }
$bt = Get-ChildItem "$sdk\build-tools" | Where-Object { Test-Path "$($_.FullName)\aapt2.exe" } |
      Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } | Select-Object -Last 1
$platform = Get-ChildItem "$sdk\platforms" | Where-Object { Test-Path "$($_.FullName)\android.jar" } |
      Sort-Object Name | Select-Object -Last 1
if (-not $bt -or -not $platform) { throw "Android SDK build-tools/platform not found under $sdk" }
$bt = $bt.FullName
$jar = "$($platform.FullName)\android.jar"
Write-Host "build-tools: $bt"
Write-Host "platform   : $jar"

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe failed with exit code $LASTEXITCODE" }
}

# ---- clean ----
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force build\assets, build\classes, build\dex, dist | Out-Null

# ---- 1. game files -> assets ----
Copy-Item web\index.html, web\game.js build\assets\

# ---- 2. legacy PNG icons (once) ----
if (-not (Test-Path android\res\mipmap-xxxhdpi\ic_launcher.png)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1
}

# ---- 3. resources + manifest ----
Run "$bt\aapt2.exe" @('compile', '--dir', 'android\res', '-o', 'build\res.zip')
Run "$bt\aapt2.exe" @('link', '-o', 'build\app-unsigned.apk', '-I', $jar,
    '--manifest', 'android\AndroidManifest.xml', '-A', 'build\assets',
    '--min-sdk-version', "$MinSdk", '--target-sdk-version', "$TargetSdk",
    '--version-code', "$VersionCode", '--version-name', $VersionName,
    'build\res.zip')

# ---- 4. Java -> dex ----
$srcs = (Get-ChildItem android\src -Recurse -Filter *.java).FullName
Run 'javac' (@('-source', '1.8', '-target', '1.8', '-Xlint:-options', '-encoding', 'UTF-8',
    '-bootclasspath', $jar, '-d', 'build\classes') + $srcs)
$classes = (Get-ChildItem build\classes -Recurse -Filter *.class).FullName
Run "$bt\d8.bat" (@('--release', '--min-api', "$MinSdk", '--lib', $jar, '--output', 'build\dex') + $classes)

# ---- 5. add classes.dex to the APK ----
$aapt = Get-ChildItem "$sdk\build-tools\*\aapt.exe" | Select-Object -Last 1
Push-Location build\dex
try { Run $aapt.FullName @('add', '..\app-unsigned.apk', 'classes.dex') } finally { Pop-Location }

# ---- 6. align ----
Run "$bt\zipalign.exe" @('-p', '-f', '4', 'build\app-unsigned.apk', 'build\app-aligned.apk')

# ---- 7. sign ----
$ks = 'android\release.keystore'
$alias = 'tictactoe'
$pass = 'tictactoe-byb-2026'
if (-not (Test-Path $ks)) {
    Run 'keytool' @('-genkeypair', '-keystore', $ks, '-alias', $alias, '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-storepass', $pass, '-keypass', $pass, '-dname', 'CN=Tic Tac Toe, O=BYB, C=IN')
}
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-key-alias', $alias, '--ks-pass', "pass:$pass",
    '--key-pass', "pass:$pass", '--out', 'dist\TicTacToe.apk', 'build\app-aligned.apk')
Run "$bt\apksigner.bat" @('verify', '--verbose', 'dist\TicTacToe.apk')

$size = [math]::Round((Get-Item dist\TicTacToe.apk).Length / 1KB, 1)
Write-Host "`nAPK ready: $PSScriptRoot\dist\TicTacToe.apk ($size KB)"
