FROM node:16-bullseye-slim

# Install build tools for native modules (node-pty)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    tmux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
