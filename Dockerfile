# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy build artifacts from build stage to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config if you have one, otherwise default is fine
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
