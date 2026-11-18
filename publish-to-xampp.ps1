param(
    [string]$TargetPath = 'D:\xampp\htdocs\KasMateWeb'
)

$sourcePath = [System.IO.Path]::GetFullPath($PSScriptRoot)
$destinationPath = [System.IO.Path]::GetFullPath($TargetPath)

if (-not (Test-Path -LiteralPath $destinationPath)) {
    New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
}

Copy-Item -Path (Join-Path $sourcePath '*.html') -Destination $destinationPath -Force
foreach ($directory in @('assets', 'css', 'js')) {
    $destinationDirectory = Join-Path $destinationPath $directory
    if (-not (Test-Path -LiteralPath $destinationDirectory)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }
    Copy-Item -Path (Join-Path (Join-Path $sourcePath $directory) '*') -Destination $destinationDirectory -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $sourcePath 'README.md') -Destination $destinationPath -Force

Write-Output "Published KasMate Web to $destinationPath"
