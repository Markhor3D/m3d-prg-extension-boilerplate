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

cd packages/scratch-gui
npm start