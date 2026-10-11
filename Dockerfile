# 通用部署镜像：支持 Render / Railway / Fly.io / 任意云主机 / Docker
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]