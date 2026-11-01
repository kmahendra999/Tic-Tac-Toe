# Draws the legacy launcher icons (black tile, blue X, yellow O) for Android 7.x devices.
# Android 8+ uses the adaptive vector icon in res/mipmap-anydpi-v26.
param([string]$ResDir = (Join-Path $PSScriptRoot '..\android\res'))

Add-Type -AssemblyName System.Drawing

$sizes = @{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }
$bg = [System.Drawing.Color]::FromArgb(255, 6, 8, 12)
$blue = [System.Drawing.Color]::FromArgb(255, 46, 134, 255)
$yellow = [System.Drawing.Color]::FromArgb(255, 255, 210, 63)

foreach ($dir in $sizes.Keys) {
    $n = $sizes[$dir]
    $k = $n / 108.0   # same 108-unit design grid as the adaptive icon
    $bmp = New-Object System.Drawing.Bitmap $n, $n
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)

    # rounded black tile
    $r = 22 * $k
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $w = $n - 1
    $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $path.AddArc($w - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $path.AddArc($w - 2 * $r, $w - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $path.AddArc(0, $w - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $path)

    # icon art drawn bigger than the adaptive version (no launcher mask here)
    $s = 1.3; $o = 54 - 54 * $s
    function P([double]$v) { return [float](($v * $s + $o) * $k) }

    $pb = New-Object System.Drawing.Pen $blue, ([float](7 * $s * $k))
    $pb.StartCap = 'Round'; $pb.EndCap = 'Round'
    $g.DrawLine($pb, (P 29), (P 42), (P 45), (P 58))
    $g.DrawLine($pb, (P 45), (P 42), (P 29), (P 58))

    $py = New-Object System.Drawing.Pen $yellow, ([float](6.5 * $s * $k))
    $g.DrawEllipse($py, (P 60), (P 39), [float](22 * $s * $k), [float](22 * $s * $k))

    $pb2 = New-Object System.Drawing.Pen $blue, ([float](3 * $s * $k)); $pb2.StartCap = 'Round'; $pb2.EndCap = 'Round'
    $py2 = New-Object System.Drawing.Pen $yellow, ([float](3 * $s * $k)); $py2.StartCap = 'Round'; $py2.EndCap = 'Round'
    $g.DrawLine($pb2, (P 30), (P 70), (P 52), (P 70))
    $g.DrawLine($py2, (P 56), (P 70), (P 78), (P 70))

    $out = Join-Path $ResDir $dir
    New-Item -ItemType Directory -Force $out | Out-Null
    $bmp.Save((Join-Path $out 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
Write-Host "Icons written to $ResDir"
