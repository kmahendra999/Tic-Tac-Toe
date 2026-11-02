# Builds dist/TicTacToe.apk (direct install) and dist/TicTacToy.aab (Google Play upload)
# without Gradle, straight from the Android SDK tools.
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
$linkArgs = @('-I', $jar,
    '--manifest', 'android\AndroidManifest.xml', '-A', 'build\assets',
    '--min-sdk-version', "$MinSdk", '--target-sdk-version', "$TargetSdk",
    '--version-code', "$VersionCode", '--version-name', $VersionName,
    'build\res.zip')
Run "$bt\aapt2.exe" (@('link', '-o', 'build\app-unsigned.apk') + $linkArgs)

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

# ---- 7. signing key ----
# The key and its password live only on this PC (both git-ignored). Back up BOTH files:
# every Play Store update must be signed with this same upload key.
$props = 'android\keystore.properties'
if (-not (Test-Path $props)) {
    if (Test-Path 'android\upload.keystore') { throw "android\upload.keystore exists but $props is missing - restore it from your backup" }
    $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $env:TTT_KS_PASS = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    Run 'keytool' @('-genkeypair', '-keystore', 'android\upload.keystore', '-alias', 'upload', '-keyalg', 'RSA',
        '-keysize', '2048', '-validity', '10000', '-storepass:env', 'TTT_KS_PASS', '-keypass:env', 'TTT_KS_PASS',
        '-dname', 'CN=Tic-Tac-Toy, C=IN')
    Set-Content $props "storeFile=upload.keystore`r`nkeyAlias=upload`r`npassword=$env:TTT_KS_PASS" -Encoding ASCII
    Write-Host "`nNew upload key: android\upload.keystore (password in $props). BACK UP BOTH FILES.`n"
}
$cfg = ConvertFrom-StringData (Get-Content -Raw $props)
$ks = Join-Path 'android' $cfg.storeFile
$alias = $cfg.keyAlias
$env:TTT_KS_PASS = $cfg.password

# ---- 8. sign the APK (for direct installs) ----
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-key-alias', $alias, '--ks-pass', 'env:TTT_KS_PASS',
    '--key-pass', 'env:TTT_KS_PASS', '--out', 'dist\TicTacToe.apk', 'build\app-aligned.apk')
Run "$bt\apksigner.bat" @('verify', '--verbose', 'dist\TicTacToe.apk')

# ---- 9. app bundle (.aab) for Google Play ----
# bundletool: https://github.com/google/bundletool/releases -> tools\bin\bundletool-all-<version>.jar
$bundletool = Get-ChildItem tools\bin\bundletool-all-*.jar -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
if ($bundletool) {
    Run "$bt\aapt2.exe" (@('link', '--proto-format', '-o', 'build\proto.zip') + $linkArgs)
    Expand-Archive build\proto.zip build\proto -Force
    # module layout bundletool expects: manifest/, dex/, res/, assets/, resources.pb
    New-Item -ItemType Directory -Force build\module\manifest, build\module\dex | Out-Null
    Move-Item build\proto\AndroidManifest.xml build\module\manifest\
    Move-Item build\proto\resources.pb, build\proto\res, build\proto\assets build\module\
    Copy-Item build\dex\classes.dex build\module\dex\
    Run 'jar' @('cMf', 'build\base.zip', '-C', 'build\module', '.')
    Run 'java' @('-jar', $bundletool.FullName, 'build-bundle', '--modules=build\base.zip', '--output=build\app-unsigned.aab')
    Run 'jarsigner' @('-keystore', $ks, '-storepass:env', 'TTT_KS_PASS', '-keypass:env', 'TTT_KS_PASS',
        '-signedjar', 'dist\TicTacToy.aab', 'build\app-unsigned.aab', $alias)
} else {
    Write-Warning 'bundletool not found in tools\bin - skipped the .aab (Google Play upload file)'
}
Remove-Item Env:TTT_KS_PASS

$size = [math]::Round((Get-Item dist\TicTacToe.apk).Length / 1KB, 1)
Write-Host "`nAPK ready: $PSScriptRoot\dist\TicTacToe.apk ($size KB)"
if ($bundletool) {
    $size = [math]::Round((Get-Item dist\TicTacToy.aab).Length / 1KB, 1)
    Write-Host "AAB ready: $PSScriptRoot\dist\TicTacToy.aab ($size KB) - upload this one to Google Play"
}
