# dxLog
## QuickStart
Clone repository. Then install depedencies:
```
$ npm install
```

Create `.env` file with this settings:
```
TOKEN_SECRET='auth-token-secret'
TOKEN_ISSUER='url-of-token-issuer'
db='mongodb://server/db'
```

Build production version:

```
$ npm run build
```

Create `audio` & `uploads` directory in `./`

Start server:

```
$ npm start
```

Create user at `http://localhost:3000/signup`
