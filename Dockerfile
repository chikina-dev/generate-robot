FROM node:22
WORKDIR /app
COPY . .
RUN npm install
RUN chmod +x env-read.sh
CMD [ "./env-read.sh" ]
