# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the frontend project
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy backend files
COPY server.ts ./
# Copy tsconfig so tsx works correctly
COPY tsconfig.json ./

EXPOSE 80

CMD ["npm", "run", "start"]
