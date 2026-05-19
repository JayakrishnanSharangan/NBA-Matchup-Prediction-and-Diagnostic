FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
ENV NEXT_PUBLIC_API_URL=http://18.214.100.93:30080/predict
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
