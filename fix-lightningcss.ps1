# Fix for npm's optional dependencies bug on Windows
# https://github.com/npm/cli/issues/4828

Write-Host "Fixing lightningcss Windows native binary..." -ForegroundColor Cyan

# Download the native binary if not present
if (-not (Test-Path "node_modules\lightningcss-win32-x64-msvc\lightningcss.win32-x64-msvc.node")) {
    Write-Host "Downloading lightningcss-win32-x64-msvc..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.30.2.tgz" -OutFile "temp.tgz"
    tar -xzf temp.tgz
    Move-Item -Path "package" -Destination "node_modules\lightningcss-win32-x64-msvc" -Force
    Remove-Item temp.tgz
    Write-Host "Downloaded and extracted." -ForegroundColor Green
}

# Create proper index.js wrapper for the native module
$indexJs = "module.exports = require('./lightningcss.win32-x64-msvc.node');"
Set-Content -Path "node_modules\lightningcss-win32-x64-msvc\index.js" -Value $indexJs

# Update package.json to use index.js as main
$pkgJsonPath = "node_modules\lightningcss-win32-x64-msvc\package.json"
if (Test-Path $pkgJsonPath) {
    $pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
    $pkgJson.main = "index.js"
    $pkgJson | ConvertTo-Json -Depth 10 | Set-Content $pkgJsonPath
    Write-Host "Created JavaScript wrapper for native module." -ForegroundColor Green
}

# Copy to lightningcss folder as fallback
if (Test-Path "node_modules\lightningcss") {
    Copy-Item "node_modules\lightningcss-win32-x64-msvc\lightningcss.win32-x64-msvc.node" -Destination "node_modules\lightningcss\" -Force
    Write-Host "Native binary installed in both locations." -ForegroundColor Green
} else {
    Write-Host "Warning: lightningcss folder not found. Run 'npm install' first." -ForegroundColor Yellow
}

Write-Host "Done! Clear cache and restart: Remove-Item -Recurse -Force .next; npm run dev" -ForegroundColor Cyan

