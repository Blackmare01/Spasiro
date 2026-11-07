FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=3000
ENV DATA_DIR=/var/lib/spasiro
ENV UPLOADS_DIR=/var/lib/spasiro/uploads
VOLUME ["/var/lib/spasiro"]
EXPOSE 3000

CMD ["node", "server.js"]
