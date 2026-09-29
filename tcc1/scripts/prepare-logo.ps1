# Lossless extraction: only the exterior connected to the PNG edges is removed.
# The closed white border and everything inside it retain their original pixels.
Add-Type -AssemblyName System.Drawing
$projectPath = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectPath 'ConnectClass Web App Design/src/imports/Captura_de_tela_de_2026-06-07_23-01-15.png'
$assetDirectory = Join-Path $projectPath 'assets'
$null = New-Item -ItemType Directory -Force -Path $assetDirectory
$sourceImage = [System.Drawing.Bitmap]::new($sourcePath)
$resultImage = [System.Drawing.Bitmap]::new($sourceImage.Width, $sourceImage.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $imageWidth = $sourceImage.Width
  $imageHeight = $sourceImage.Height
  $visited = [bool[]]::new($imageWidth * $imageHeight)
  $queue = [System.Collections.Generic.Queue[int]]::new()
  for ($pixelX = 0; $pixelX -lt $imageWidth; $pixelX++) {
    $queue.Enqueue($pixelX)
    $queue.Enqueue(($imageHeight - 1) * $imageWidth + $pixelX)
  }
  for ($pixelY = 0; $pixelY -lt $imageHeight; $pixelY++) {
    $queue.Enqueue($pixelY * $imageWidth)
    $queue.Enqueue($pixelY * $imageWidth + $imageWidth - 1)
  }
  while ($queue.Count -gt 0) {
    $index = $queue.Dequeue()
    if ($visited[$index]) { continue }
    $pixelX = $index % $imageWidth
    $pixelY = [int][Math]::Floor($index / $imageWidth)
    $pixelColor = $sourceImage.GetPixel($pixelX, $pixelY)
    # White border is a closed barrier; no internal blue pixels are visited.
    if ($pixelColor.R -ge 175 -and $pixelColor.G -ge 175 -and $pixelColor.B -ge 175) { continue }
    $visited[$index] = $true
    if ($pixelX -gt 0) { $queue.Enqueue($index - 1) }
    if ($pixelX -lt $imageWidth - 1) { $queue.Enqueue($index + 1) }
    if ($pixelY -gt 0) { $queue.Enqueue($index - $imageWidth) }
    if ($pixelY -lt $imageHeight - 1) { $queue.Enqueue($index + $imageWidth) }
  }
  $removedPixels = 0
  for ($pixelY = 0; $pixelY -lt $imageHeight; $pixelY++) {
    for ($pixelX = 0; $pixelX -lt $imageWidth; $pixelX++) {
      if ($visited[$pixelY * $imageWidth + $pixelX]) { $removedPixels++; continue }
      $resultImage.SetPixel($pixelX, $pixelY, $sourceImage.GetPixel($pixelX, $pixelY))
    }
  }
  if ($removedPixels -le 0 -or $removedPixels -ge $imageWidth * $imageHeight / 2) { throw 'Unexpected extraction mask.' }
  $resultImage.Save((Join-Path $assetDirectory 'connectclass-logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "PNG $imageWidth x $imageHeight, $removedPixels exterior pixels transparent; retained pixels unchanged."
} finally {
  $sourceImage.Dispose()
  $resultImage.Dispose()
}
