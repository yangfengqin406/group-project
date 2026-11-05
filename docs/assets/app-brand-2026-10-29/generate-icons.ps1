Add-Type -AssemblyName System.Drawing
$brandSource = Join-Path (Get-Location) 'docs/assets/app-avatar-2026-10-25/app-avatar-v1.png'
$brandExpected = '608DCAB5401AD5C4D0EEBC9B891B680C2543503142CCB92943BE1474039AB0C6'
if ((Get-FileHash -LiteralPath $brandSource -Algorithm SHA256).Hash -ne $brandExpected) { throw 'The avatar source does not match the user supplied image.' }
$brandOutput = Join-Path (Get-Location) 'src/static/app/icons'
New-Item -ItemType Directory -Force -Path $brandOutput | Out-Null
$brandImage = [System.Drawing.Image]::FromFile($brandSource)
try {
  if ($brandImage.Width -ne $brandImage.Height) { throw 'Expected the supplied square avatar, without cropping.' }
  $brandSizes = @(20,29,40,58,60,72,76,80,87,96,120,144,152,167,180,192,1024)
  foreach ($brandSize in $brandSizes) {
    $brandBitmap = [System.Drawing.Bitmap]::new($brandSize, $brandSize, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $brandGraphics = [System.Drawing.Graphics]::FromImage($brandBitmap)
    $brandAttributes = [System.Drawing.Imaging.ImageAttributes]::new()
    try {
      $brandGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $brandGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $brandGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $brandGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $brandGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $brandAttributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $brandRectangle = [System.Drawing.Rectangle]::new(0,0,$brandSize,$brandSize)
      $brandGraphics.DrawImage($brandImage,$brandRectangle,0,0,$brandImage.Width,$brandImage.Height,[System.Drawing.GraphicsUnit]::Pixel,$brandAttributes)
      $brandFile = Join-Path $brandOutput ('icon-' + $brandSize + '.png')
      $brandBitmap.Save($brandFile, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $brandAttributes.Dispose()
      $brandGraphics.Dispose()
      $brandBitmap.Dispose()
    }
  }
} finally {
  $brandImage.Dispose()
}
Write-Output ('Prepared ' + $brandSizes.Count + ' opaque square PNG icons from the unchanged supplied avatar.')
