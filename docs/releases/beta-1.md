Release: Beta 1

Deployment
- URL: https://plex-42bu2lpub-streamzrus1-8751s-projects.vercel.app
- Alias: https://plex-beta1-streamzrus1-8751s-projects.vercel.app

Included Features
- Server-side PayPal order/capture with idempotent handling
- Fallback checkout link and intent=CAPTURE
- Supabase integration and payment persistence
- Streams capped to 5; dropdown on mobile
- Admin chat: dedup per user, default Active filter
- Customer chat: conversation created on first message
- Admin notifications: sound + cross-page popup with deep link
- Pricing: three-year £180 base + £40 per extra stream
- Over Stream Warning email template and admin button
 - Customer movie/show recommendations with IMDb preview, likes, comments (active-only)

Environment Variables (names only)
- NEXT_PUBLIC_PAYPAL_CLIENT_ID
- NEXT_PUBLIC_PAYPAL_MERCHANT_EMAIL
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET
- PAYPAL_ENV
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM

Rollback
- Redeploy this build: `vercel redeploy plex-42bu2lpub-streamzrus1-8751s-projects.vercel.app`
- Or redeploy the alias: `vercel redeploy plex-beta1-streamzrus1-8751s-projects.vercel.app`
