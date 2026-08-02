FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache clamav clamav-daemon \
  && mkdir -p /var/lib/clamav /run/clamav \
  && chown -R clamav:clamav /var/lib/clamav /run/clamav

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

COPY clamd.conf /etc/clamav/clamd.conf
COPY freshclam.conf /etc/clamav/freshclam.conf
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
CMD ["/usr/local/bin/docker-entrypoint.sh"]
