# Stage 1: Build Admin
FROM node:20-slim AS builder
WORKDIR /app
# We need root level package.json to run build:admin
COPY package*.json ./
# We also need the admin subfolder package.json if it exists
COPY admin/package*.json ./admin/
RUN npm install && cd admin && npm install
COPY . .
RUN npm run build:admin

# Stage 2: Serve
FROM nginx:stable-alpine
# Admin build goes to admin/dist
COPY --from=builder /app/admin/dist /usr/share/nginx/html
# Use the admin-specific Nginx config
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
