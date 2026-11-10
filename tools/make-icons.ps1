# Builds every app icon: the name TIC TAC TOY in big letters, with Kunal's picture (art/icon-source.jpg)
# as a small round badge in the bottom-right corner.
#   - legacy launcher PNGs (Android 7.x)       -> res/mipmap-*/ic_launcher.png
#   - adaptive icon foreground (Android 8+)     -> res/mipmap-*/ic_launcher_foreground.png (background: @color/icon_bg)
#   - Play Store icon 512x512 + feature graphic -> store/
# Store graphics must not carry price or promo words ("free", "no ads"): Google Play metadata policy.
param(
    [string]$Source = (Join-Path $PSScriptRoot '..\art\icon-source.jpg'),
    [string]$ResDir = (Join-Path $PSScriptRoot '..\android\res'),
    [string]$StoreDir = (Join-Path $PSScriptRoot '..\store'),
    [double]$FgScale = 0.6    # icon art as a share of the 108dp adaptive canvas (keeps the badge inside a round mask)
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
$dark = [System.Drawing.Color]::FromArgb(255, 6, 8, 12)
$blue = [System.Drawing.Color]::FromArgb(255, 46, 134, 255)
$yellow = [System.Drawing.Color]::FromArgb(255, 255, 210, 63)

function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.CompositingQuality = 'HighQuality'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)
    return @($bmp, $g)
}

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc($x, $y, 2 * $r, 2 * $r, 180, 90)
    $p.AddArc($x + $w - 2 * $r, $y, 2 * $r, 2 * $r, 270, 90)
    $p.AddArc($x + $w - 2 * $r, $y + $h - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $p.AddArc($x, $y + $h - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $p.CloseFigure()
    return $p
}

function Save-Png($bmp, [string]$dir, [string]$name) {
    New-Item -ItemType Directory -Force $dir | Out-Null
    $bmp.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
}

# The icon art on a 1024 square, transparent unless -Background is given: TIC / TAC / TOY on three lines,
# Kunal's picture in a yellow ring at the bottom right (kept inside the round launcher mask).
function New-IconArt([switch]$Background) {
    $n = 1024
    $bmp, $g = New-Canvas $n $n
    if ($Background) { $g.Clear($dark) }
    $f = New-Object System.Drawing.Font 'Segoe UI Black', 236, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $x = 66
    $g.DrawString('TIC', $f, (New-Object System.Drawing.SolidBrush $blue), $x, 40)
    $g.DrawString('TAC', $f, (New-Object System.Drawing.SolidBrush $yellow), $x, 300)
    $g.DrawString('TOY', $f, [System.Drawing.Brushes]::White, $x, 560)
    $d = 280; $bx = 664; $by = 664
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $yellow), $bx - 14, $by - 14, $d + 28, $d + 28)
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse($bx, $by, $d, $d)
    $g.SetClip($clip)
    $g.DrawImage($src, $bx, $by, $d, $d)
    $g.Dispose()
    return $bmp
}

$art = New-IconArt -Background
$fg = New-IconArt

$densities = [ordered]@{ 'mipmap-mdpi' = 1.0; 'mipmap-hdpi' = 1.5; 'mipmap-xhdpi' = 2.0; 'mipmap-xxhdpi' = 3.0; 'mipmap-xxxhdpi' = 4.0 }

foreach ($dir in $densities.Keys) {
    $d = $densities[$dir]

    # legacy icon: 48dp art with rounded corners
    $n = [int](48 * $d)
    $bmp, $g = New-Canvas $n $n
    $g.SetClip((RoundRect 0 0 $n $n ($n * 0.2)))
    $g.DrawImage($art, 0, 0, $n, $n)
    Save-Png $bmp (Join-Path $ResDir $dir) 'ic_launcher.png'
    $g.Dispose(); $bmp.Dispose()

    # adaptive foreground: 108dp canvas, art centred; the launcher mask shows the middle 72dp
    $n = [int](108 * $d)
    $s = [int]($n * $FgScale); $o = [int](($n - $s) / 2)
    $bmp, $g = New-Canvas $n $n
    $g.DrawImage($fg, $o, $o, $s, $s)
    Save-Png $bmp (Join-Path $ResDir $dir) 'ic_launcher_foreground.png'
    $g.Dispose(); $bmp.Dispose()
}

# Play Store icon: 512x512, full square (Play applies its own rounding)
$bmp, $g = New-Canvas 512 512
$g.DrawImage($art, 0, 0, 512, 512)
Save-Png $bmp $StoreDir 'play-icon-512.png'
$g.Dispose(); $bmp.Dispose()

# Play Store feature graphic: 1024x500
$bmp, $g = New-Canvas 1024 500
$g.Clear($dark)
$g.SetClip((RoundRect 70 80 340 340 60))
$g.DrawImage($src, 70, 80, 340, 340)
$g.ResetClip()
$f1 = New-Object System.Drawing.Font 'Segoe UI Black', 64, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$f2 = New-Object System.Drawing.Font 'Segoe UI', 30, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$x = 460
$g.DrawString('TIC', $f1, (New-Object System.Drawing.SolidBrush $blue), $x, 150)
$w1 = $g.MeasureString('TIC ', $f1).Width
$g.DrawString('TAC', $f1, (New-Object System.Drawing.SolidBrush $yellow), $x + $w1, 150)
$w2 = $g.MeasureString('TAC ', $f1).Width
$g.DrawString('TOY', $f1, [System.Drawing.Brushes]::White, $x + $w1 + $w2, 150)
$g.DrawString('A game by Kunal', $f2, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 139, 151, 171))), ($x + 4), 250)
Save-Png $bmp $StoreDir 'feature-graphic-1024x500.png'
$g.Dispose(); $bmp.Dispose()

$art.Dispose(); $fg.Dispose(); $src.Dispose()
Write-Host "Icons written to $ResDir and $StoreDir"
