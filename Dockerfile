# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package.json ONLY (ignores package-lock.json to prevent cross-platform esbuild conflicts)
COPY package.json ./

# Install dependencies for the current platform (Alpine Linux)
RUN npm install

# Copy source files
COPY . .

# Build the frontend project
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package.json ONLY to prevent cross-platform conflicts
COPY package.json ./
RUN npm install --production

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy backend files
COPY server.ts ./
# Copy tsconfig so tsx works correctly
COPY tsconfig.json ./

EXPOSE 80

CMD ["npm", "run", "start"]
