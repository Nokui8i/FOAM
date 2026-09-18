# FOAM

Customer laundry website + staff ops console on Firebase Hosting.

| Surface | Who | Where |
|---------|-----|--------|
| **Website** | Customers | `/`, `/book`, `/account`, … |
| **Ops** | Managers & drivers | `/ops` (phone or desktop browser) |

## Run locally
```bash
npm install
npm run dev
```

## Production
Firebase Hosting: `https://foam-laundry-app.web.app`  
Staff console: `https://foam-laundry-app.web.app/ops`

## Shared backend
- Firestore: `orders`, `users`, `contactMessages`
- Auth allowlist: admin emails in `firestore.rules` + `NEXT_PUBLIC_ADMIN_EMAILS`
- Storage: order photos (enable Storage in Firebase Console once)
