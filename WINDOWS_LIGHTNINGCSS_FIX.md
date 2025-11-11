# Windows LightningCSS Fix

## The Problem
There's a known npm bug on Windows where optional dependencies don't always install correctly:
https://github.com/npm/cli/issues/4828

This affects the `lightningcss-win32-x64-msvc` package, which is required for Tailwind CSS to work properly.

## Symptoms
You'll see this error when running `npm run dev`:
```
Error: Cannot find native binding. npm has a bug related to optional dependencies
```

Or:
```
Error: Cannot find module '../lightningcss.win32-x64-msvc.node'
```

## Quick Fix

Run this command:
```powershell
npm run fix-lightningcss
```

This will:
1. Download the Windows native binary for lightningcss
2. Install it in the correct locations
3. Make your dev server work

## Manual Fix

If the script doesn't work, follow these steps:

1. **Download the native binary:**
```powershell
Invoke-WebRequest -Uri "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.30.2.tgz" -OutFile "temp.tgz"
```

2. **Extract it:**
```powershell
tar -xzf temp.tgz
```

3. **Move to node_modules:**
```powershell
Move-Item -Path "package" -Destination "node_modules\lightningcss-win32-x64-msvc" -Force
```

4. **Copy to lightningcss folder:**
```powershell
Copy-Item "node_modules\lightningcss-win32-x64-msvc\lightningcss.win32-x64-msvc.node" -Destination "node_modules\lightningcss\" -Force
```

5. **Clean up:**
```powershell
Remove-Item temp.tgz
```

6. **Clear Next.js cache and restart:**
```powershell
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
npm run dev
```

## Why This Happens

npm's optional dependencies on Windows sometimes:
- Don't download at all
- Download but don't extract properly
- Extract to the wrong location

The fix manually downloads and places the native binary in both locations where `lightningcss` looks for it:
1. `node_modules/lightningcss-win32-x64-msvc/` (as a package)
2. `node_modules/lightningcss/` (as a direct file fallback)

## After Running npm install

If you run `npm install` again in the future, you may need to run the fix script again:
```powershell
npm run fix-lightningcss
```

## Alternative: Use WebAssembly Instead

If the native binding continues to have issues, you can use the WebAssembly fallback which is slower but more reliable on Windows:

Add this to your `.env.local` file:
```
CSS_TRANSFORMER_WASM=1
```

Or start the dev server with:
```powershell
$env:CSS_TRANSFORMER_WASM="1"; npm run dev
```

## Prevention

The `package.json` includes the native binary URL in optionalDependencies:
```json
"lightningcss-win32-x64-msvc": "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.30.2.tgz"
```

This helps npm find it, but due to the bug, manual installation is sometimes still required.

