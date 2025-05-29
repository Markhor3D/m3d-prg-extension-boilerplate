#!/bin/bash

# Load NVM
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

# Install and use Node.js 14
nvm install 14
nvm use 14
nvm alias default 14

# Go to working dir (if not already there)
cd /workspaces/m3d-prg-extension-boilerplate || exit 1

# Clean and re-init Lerna
npm uninstall lerna || true
npm install --save-dev lerna@6

# Bootstrap Lerna packages
npx lerna bootstrap --force-local

# Build scratch-vm first
cd packages/scratch-vm && npm install && npm run build

# Build scratch-gui
#cd ../scratch-gui && npm install && npm run build

ln -s /workspaces/m3d-prg-extension-boilerplate/packages/scratch-gui /workspaces/m3d-prg-extension-boilerplate/gui
ln -s /workspaces/m3d-prg-extension-boilerplate/packages/scratch-vm /workspaces/m3d-prg-extension-boilerplate/vm
mkdir /workspaces/m3d-prg-extension-boilerplate/packages/scratch-gui/build
ln -s /workspaces/m3d-prg-extension-boilerplate/packages/scratch-gui/build /workspaces/m3d-prg-extension-boilerplate/build