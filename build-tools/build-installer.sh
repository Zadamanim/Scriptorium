#!/usr/bin/env bash
# Builds "Scriptorium Setup <version>.exe" on Linux without Wine.
# (On Windows you can simply run: npm run dist)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
rm -rf dist
npx electron-builder --win dir --x64 --publish never -c.win.signAndEditExecutable=false
node build-tools/seticon.mjs dist/win-unpacked/Scriptorium.exe assets/icon.ico "$VERSION"
if command -v makensis >/dev/null; then
  MAKENSIS=(makensis)                       # system NSIS (e.g. apt install nsis; used by GitHub Actions)
else                                        # NSIS that electron-builder downloaded earlier
  NSIS=$(dirname "$(find ~/.cache/electron-builder -path '*nsis-3*/linux/makensis' | head -1)")/..
  chmod +x "$NSIS/linux/makensis"
  export NSISDIR="$NSIS"
  MAKENSIS=("$NSIS/linux/makensis")
fi
"${MAKENSIS[@]}" -V2 \
  -DVERSION="$VERSION" -DSRCDIR="$PWD/dist/win-unpacked" -DICON="$PWD/assets/icon.ico" \
  -DOUTFILE="$PWD/dist/Scriptorium Setup $VERSION.exe" build-tools/installer.nsi
ls -la dist/*.exe
