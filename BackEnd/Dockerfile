# Easy Rent — backend Dockerfile
# Postavljen tako, da __dirname znotraj vsebnika ustreza temu, kar
# Server.js pričakuje: express.static(path.join(__dirname, '../html-frontend'))
# -> Server.js mora biti v /app/BackEnd, frontend pa v /app/FrontEnd.
# POPRAVEK: mapi na disku se imenujeta "BackEnd" in "FrontEnd" (ne
# "js-Backend"/"html-frontend"), zato so poti spodaj temu prilagojene.

FROM node:20-alpine

WORKDIR /app/BackEnd

# Najprej samo package*.json, da Docker cache-ira `npm install`
# in ga ne ponavlja ob vsaki spremembi kode.
COPY BackEnd/package*.json ./
RUN npm install --omit=dev

# Preostala backend koda (Server.js, HashiranjeGesel.js, Easyrentbaza.sql ...)
COPY BackEnd/ ./

# Frontend datoteke (index.html, style.css ...), ki jih Server.js streže
# prek express.static na '../html-frontend' (glej Server.js) — v vsebniku
# mora torej ležati eno mapo nad BackEnd, poimenovano enako kot v kodi
# pričakovano ime po path.join. Ker Server.js uporablja pot
# "../html-frontend", jo tu ustvarimo z ustreznim imenom mape.
COPY FrontEnd/ /app/html-frontend/

EXPOSE 3000

CMD ["node", "Server.js"]