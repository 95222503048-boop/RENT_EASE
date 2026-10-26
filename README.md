# RentEase

**New to the project?** Start with the [Beginner Setup Guide](SETUP_GUIDE.md).

Responsive, multi-shop furniture and appliance rental platform built with React, Express, and MongoDB. Each shop admin connects an individual Cloudinary product environment; image credentials are encrypted server-side and images are uploaded into an admin-specific folder.

## Roles and workflows

- **Customer:** browse local rental shops, choose a shop, browse its items, submit a delivery request, and view only their own rentals and day-based accrued-rent estimates.
- **Admin:** one account owns one shop profile and its listings. The shop admin sees only orders and inventory attached to that account. They call the customer using the supplied phone number, then confirm the request or reject and delete a pending order. Confirmed rentals start day-based charge tracking.
- **Developer:** a single operator account bootstrapped from environment variables can create admin accounts and see aggregate customer/admin/shop statistics. It does not provide a customer PII browser.

Admins are provisioned by the developer rather than by public self-registration. After signing in, each admin completes their shop name, short description, city, and contact phone before their storefront appears to customers. Shop cards are ordered by distinct customers who have placed a rental with that shop.

Rejected pending orders are deleted and the product is made available again. Confirmed and returned rentals remain for customer history and admin statistics. A pending order does not accrue rent; approval starts charging at monthly rent divided by 30 for each completed 24-hour period. There are no payment options or payment collection.

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env`; set MongoDB, JWT, developer, and CLOUDINARY_CREDENTIALS_KEY.
3. Install packages and run both services:

   ```sh
   npm install
   npm run dev
   ```

4. Open `http://localhost:5173`. Vite proxies `/api` to the Express server on port `10000`.

The developer account is created or refreshed from `DEVELOPER_EMAIL` and `DEVELOPER_PASSWORD` at server startup. Keep these secrets private and never commit `.env`.

## Deploy on Vercel and Render

The frontend and API deploy separately from the same repository: Vercel builds the Vite/React site, and Render runs the Express API. Locally, leave `VITE_API_BASE_URL` blank so Vite proxies `/api` to the local server. In production, the frontend calls the Render URL.

Deploy the Render API first. The included `render.yaml` configures a backend-only service (`npm ci --omit=dev`, `npm start`) with health check `/api/health`. Set these secrets in the Render environment:

- `MONGODB_URI`: Atlas URI for a restricted database user and named database.
- `JWT_SECRET`: long random signing secret (Render can generate one through the blueprint).
- `DEVELOPER_EMAIL` and `DEVELOPER_PASSWORD`: private platform-operator account credentials.
- `CLOUDINARY_CREDENTIALS_KEY`: a 32-byte (64 hex character) key used to encrypt each admin’s Cloudinary API secret before MongoDB storage. Keep it only in the server environment and back it up securely; losing it requires admins to reconnect their accounts. Generate a key with: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))". Admins connect their own Cloudinary credentials from the shop dashboard; they are never added to Render.
- `TRUST_PROXY`: exact number of trusted reverse proxy hops. The Render blueprint sets this to `1`; adjust to match the actual topology.

After the Render API is live, import the same repository into Vercel as a Vite project. Use build command `npm run build`, output directory `dist`, and set `VITE_API_BASE_URL` to the Render service base URL, such as `https://rentease.onrender.com`. This variable is included in the public browser bundle; it must contain only the API URL, never credentials. After Vercel deploys, set `CLIENT_ORIGIN` in Render to the exact production frontend origin, such as `https://rentease.vercel.app` (no trailing slash). For multiple domains, use a comma-separated list of exact origins. Redeploy the Render service after changing its environment.

Restrict MongoDB Atlas network access to the Render service's permitted outbound IP ranges or private network path. Find the service's outbound IPs in its Render dashboard and avoid a broad public allowlist. MongoDB credentials are read only by the backend and are never sent to the browser. See the [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite), [Render web services guide](https://render.com/docs/web-services), and [Render outbound IP documentation](https://render.com/docs/outbound-ip-addresses).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB/Atlas connection string |
| `JWT_SECRET` | Yes | Signs customer, admin, and developer sessions |
| `DEVELOPER_EMAIL` | Yes for admin provisioning | Bootstraps the developer dashboard account |
| `DEVELOPER_PASSWORD` | Yes for admin provisioning | Bootstraps developer sign-in |
| `CLOUDINARY_CREDENTIALS_KEY` | Yes for admin Cloudinary connections | 32-byte key in 64-character hex form; encrypts each admin secret at rest |
| `PORT` | No | HTTP port; defaults to `10000` |
| `CLIENT_ORIGIN` | Production | Exact comma-separated Vercel frontend origins allowed to call the API |
| `TRUST_PROXY` | No | Trusted proxy hop count; defaults to `1` in production |
| `NODE_ENV` | No | Set to `production` on Render |
| `VITE_API_BASE_URL` | Production frontend | Render API base URL, set in Vercel; public build-time config, never a secret |

## Security and performance

- API requests are limited to 300 per IP per 15 minutes; registration/sign-in to 10 per IP per 15 minutes; account security actions, including password changes and account deletion, to 5 per IP per 15 minutes; Cloudinary account connection attempts to 5 per IP per 15 minutes; image uploads to 20 per IP per 15 minutes. The default limiter store is in-memory per process, so use a shared store if scaling to multiple server instances.
- Helmet security headers and a Content Security Policy are enabled. Cross-origin access is off unless an explicit origin allowlist is configured.
- Admin and developer APIs are role-protected. Shop rental and inventory queries are scoped to the signed-in admin. The public API returns only storefront fields, never customer or order records.
- Inputs are normalized, length-bounded, and type/format checked; uploaded images are limited to 5 MB and accepted only for JPEG, PNG, WebP, or AVIF MIME types.
- Each admin connects Cloudinary from their dashboard. The server verifies credentials, encrypts the API secret with AES-256-GCM, never returns it, and uploads through the authenticated backend into that admin’s folder. The admin’s key is selected from the signed-in identity, not a request parameter. Uploads allow JPEG, PNG, WebP, or AVIF up to 5 MB; delivery uses bounded dimensions and automatic format/quality. Frontend product images load lazily, and catalog/admin list sizes are capped.
- Error responses are generic. Stack traces and database errors are not returned to clients.
- MongoDB indexes support shop inventory and order views.

## Connect an admin Cloudinary account

1. Sign in to RentEase with the admin account and open **My shop**.
2. Select **Open Cloudinary Console**. Sign in to Cloudinary or create an account.
3. In the Cloudinary dashboard, copy the **Cloud name** shown under **Product Environment**.
4. Open **Settings → API Keys** (or use **Go to API Keys** from the dashboard). Copy the API key and reveal/copy the API secret. Cloudinary may ask you to verify your identity. See [Cloudinary’s credential instructions](https://cloudinary.com/documentation/finding_your_credentials_tutorial).
5. Return to RentEase, enter the three values in **Connect Cloudinary**, and submit. RentEase checks the credentials and then stores the secret encrypted; the form clears after success.
6. Add a listing to confirm uploads. The asset is saved in that admin’s RentEase products folder in their Cloudinary account.

Use a separate Cloudinary account or product environment for RentEase where possible, so its media is kept apart from personal assets. Cloudinary API credentials allow signed API operations in that product environment. Never share it in messages, screenshots, or support requests. If it is exposed, disable or rotate it in Cloudinary and reconnect the new key in RentEase. Disconnecting in RentEase removes its encrypted credential record; it does not delete assets from Cloudinary. RentEase cannot upload new images after disconnecting. Each admin pays for and manages their own Cloudinary account and media. Existing images from any earlier shared account remain there until replaced.

## Policy pages

The footer links to Terms of Use, Privacy Policy, IP Infringement, and Data Use & Compliance pages. They describe per-admin Cloudinary credential handling, admin media responsibilities, and the platform’s data safeguards. They remain draft policies until business identity, jurisdiction, monitored contacts, retention schedule, and provider locations are completed and reviewed.

## Data model and migration

Each product belongs to one admin (`owner`), and each rental snapshots that same owner. The app does not automatically assign existing unowned catalog products or legacy rentals to an admin: review/migrate any existing MongoDB data before deploying this multi-shop version. Product images for listings must be uploaded through the admin interface to the connected Cloudinary account. Existing photos uploaded to a previous shared account remain at their current URLs until admins replace them; disconnecting an account does not delete its Cloudinary media.

## Profile photos and account security

Admin shop profile photos and product photos use each admin’s separately connected Cloudinary account. The API decrypts the selected admin’s credentials server-side and never sends the API secret to the browser. Profile image uploads require admin authentication, are rate limited, and enforce a 5 MB limit with image-signature validation.

Signed-in users can change their password from the footer account actions by confirming their current password. There is no forgotten-password or email reset flow; users who cannot sign in must contact the platform operator.

Customers can delete their account after active rentals are returned. Admins must resolve open rentals first. Deletion requires the current password; a deleted email can be registered again.
