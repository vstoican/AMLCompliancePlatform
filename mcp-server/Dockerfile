FROM node:20-slim

WORKDIR /app

# Install the MCP Postgres server
RUN npm install -g @modelcontextprotocol/server-postgres

# The server reads DATABASE_URL from environment
# and exposes MCP protocol over stdio

# We'll use a wrapper script to run as HTTP server
COPY server.js /app/server.js

EXPOSE 3100

CMD ["node", "server.js"]
