param(
  [Parameter(Mandatory = $true)][string]$PdfPath,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$MaxPages = 3,
  [int]$Scale = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Await-AsyncOp {
  param([Parameter(Mandatory = $true)]$Op)
  $task = $Op.AsTask()
  return $task.GetAwaiter().GetResult()
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$storageFile = Await-AsyncOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync($PdfPath))
$pdfDoc = Await-AsyncOp ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile))

$pageCount = [Math]::Min([int]$pdfDoc.PageCount, $MaxPages)

for ($i = 0; $i -lt $pageCount; $i++) {
  $page = $pdfDoc.GetPage([uint32]$i)
  try {
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $options.DestinationWidth = [uint32]([Math]::Max(1, [int]($page.Size.Width * $Scale)))
    $options.DestinationHeight = [uint32]([Math]::Max(1, [int]($page.Size.Height * $Scale)))

    Await-AsyncOp ($page.RenderToStreamAsync($stream, $options)) | Out-Null
    $stream.Seek(0) | Out-Null

    $decoder = Await-AsyncOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
    $pixelDataProvider = Await-AsyncOp ($decoder.GetPixelDataAsync())
    $pixels = $pixelDataProvider.DetachPixelData()

    $outPath = Join-Path $OutDir ("page_{0}.png" -f ($i + 1))
    $fileStream = [System.IO.File]::Open($outPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite)
    try {
      $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)
      $encoder = Await-AsyncOp ([Windows.Graphics.Imaging.BitmapEncoder]::CreateAsync([Windows.Graphics.Imaging.BitmapEncoder]::PngEncoderId, $ras))

      $encoder.SetPixelData(
        $decoder.BitmapPixelFormat,
        $decoder.BitmapAlphaMode,
        $decoder.PixelWidth,
        $decoder.PixelHeight,
        $decoder.DpiX,
        $decoder.DpiY,
        $pixels
      )

      Await-AsyncOp ($encoder.FlushAsync()) | Out-Null
    } finally {
      $fileStream.Dispose()
    }
  } finally {
    $page.Dispose()
  }
}

Write-Output ("Rendered {0} page(s) to {1}" -f $pageCount, $OutDir)
