FROM node:24-bookworm-slim

WORKDIR /app

# tsx (a devDependency) runs the TypeScript sources directly, so install everything.
COPY package.json package-lock.json ./
RUN npm ci

# Chrome for Testing plus the Linux system libraries it needs.
RUN npx agent-browser install --with-deps \
    && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# Chrome cannot use its sandbox as root inside a container.
ENV AGENT_BROWSER_ARGS=--no-sandbox \
    PORT=3000

EXPOSE 3000
VOLUME ["/app/reports"]

CMD ["npm", "run", "serve"]
