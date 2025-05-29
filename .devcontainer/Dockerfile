# Use official Microsoft dev container as base
FROM mcr.microsoft.com/devcontainers/javascript-node:0-18-bullseye

# Set working directory
WORKDIR /workspaces/m3d-prg-extension-boilerplate

# Install dependencies including NVM
RUN apt-get update && \
    apt-get install -y curl && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Add NVM environment variables and install Node 14
RUN echo "export NVM_DIR=\"$HOME/.nvm\"" >> ~/.bashrc && \
    echo "[ -s \"$NVM_DIR/nvm.sh\" ] && \. \"$NVM_DIR/nvm.sh\"" >> ~/.bashrc && \
    echo "[ -s \"$NVM_DIR/bash_completion\" ] && \. \"$NVM_DIR/bash_completion\"" >> ~/.bashrc

# Copy setup script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Run entrypoint on container start
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
