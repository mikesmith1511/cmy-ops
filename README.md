# CMY Operations Platform

Full-stack operations platform for Card My Yard — Wildwood, Tavares, and Clermont territories.

## Stack
- **Next.js 14** (App Router)
- **Supabase** (Postgres database)
- **Vercel** (hosting)
- **bcryptjs** (password hashing)
- **jsonwebtoken** (session tokens)

## Deploy Steps

### 1. Run the database schema
- Go to your Supabase project → SQL Editor
- Paste and run the contents of `schema.sql`

### 2. Generate your admin password hash
```bash
npm install
node scripts/hash-password.js
```
Copy the `ADMIN_PASSWORD_HASH=...` output for step 4.

### 3. Push to GitHub
```bash
git init
git remote add origin https://github.com/mikesmith1511/cmy-ops.git
git add .
git commit -m "Initial deploy"
git push -u origin main
```

### 4. Deploy to Vercel
- Go to vercel.com → New Project → Import `mikesmith1511/cmy-ops`
- Add these environment variables:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xnmrtkoikjzeogqqqlzg.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
  JWT_SECRET=generate_random_32_char_string
  ADMIN_EMAIL=wildwood@cardmyyard.com
  ADMIN_PASSWORD_HASH=the_hash_from_step_2
  NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
  ```
- Click Deploy

### 5. URLs
- **Admin:** `https://your-app.vercel.app/admin`
- **Helper Portal:** `https://your-app.vercel.app/helper`

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `JWT_SECRET` | Random 32+ char string for signing session tokens |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of admin password (from hash-password.js) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL |

## Generating JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Changing Admin Password
1. Run `node scripts/hash-password.js` with your new password
2. Update `ADMIN_PASSWORD_HASH` in Vercel environment variables
3. Redeploy
