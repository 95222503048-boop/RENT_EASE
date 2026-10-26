# RentEase — Beginner Setup Guide

This guide takes you from a fresh download to a running RentEase site. It covers local development and a split deployment with the frontend on Vercel and the API on Render.

## What you need

- A computer with an internet connection
- Node.js 20 or later
- A MongoDB Atlas account (or another MongoDB database)
- A Render account for the API and a Vercel account for the website
- A Cloudinary account for each admin shop’s product and profile photos

RentEase does not collect payments. Each shop admin connects their own Cloudinary account for product images.

## Part 1: Create the MongoDB database

1. Sign in to MongoDB Atlas and create a project and a free database cluster.
2. Create a database user. Save its username and password somewhere private; these are different from your Atlas website login.
3. In **Network Access**, allow your current IP address so your local app can connect. Avoid allowing access from every IP address.
4. In **Database → Connect**, choose the connection string option for your application and copy the URI.
5. Replace the username, password, and database name in the URI with your database user's details. If the password contains special characters, URL-encode them.

Keep the MongoDB URI private. Do not paste it into frontend code or commit it to GitHub.

## Part 2: Run RentEase on your computer

1. Open the RentEase project folder in a terminal.
2. Install the project packages:

   ```sh
   npm install
   ```

3. Make a copy of `.env.example` named `.env` in the project folder.
4. Open `.env` and fill in these values:

   - `MONGODB_URI`: the Atlas connection string from Part 1.
   - `JWT_SECRET`: a long, random string used to sign in securely. Do not reuse your MongoDB or Cloudinary password.
   - `DEVELOPER_EMAIL`: the email address you will use for the platform developer account.
   - `DEVELOPER_PASSWORD`: a strong password for that account, at least 8 characters.
   - `CLOUDINARY_CREDENTIALS_KEY`: create one using the command below. Use the output as its value.

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Keep this encryption key private and save a secure backup. If you lose it, connected Cloudinary accounts must be connected again. Never put the key in the frontend or commit `.env`.



5. Start the app:

   ```sh
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173) in your browser. The first time, the server may take a few moments to connect to MongoDB.

To stop the app, click the terminal window and press **Ctrl+C**.

## Part 3: Sign in and create an admin

When the server starts, it creates or refreshes the developer account using `DEVELOPER_EMAIL` and `DEVELOPER_PASSWORD` from `.env`.

1. Open the local site and select **Sign in**.
2. Sign in with the developer email and password from `.env`.
3. Open **Platform overview** and use **Create an admin account**. Set a name, email, and temporary password for the shop admin.
4. Sign out, then sign in with the new admin account.
5. In **My shop**, complete the shop profile. The shop becomes visible to customers after the required details are saved.
6. Connect the admin’s Cloudinary account using Part 4 below.
7. Add product listings with a photo, category, monthly rent, and optional deposit.

Customers can create their own accounts with **Sign in → Create an account**. An admin calls each customer to confirm or reject a rental request. Rent tracking starts after an admin confirms the request. The app does not take payment.

## Part 4: Connect an admin’s Cloudinary account

Each shop admin connects their own Cloudinary account. Their Cloudinary API secret is sent to RentEase over HTTPS, encrypted on the server, and never shown back in the browser.

1. Sign in to RentEase as the shop admin and open **My shop**.
2. Select **Open Cloudinary Console**. Sign in or create a Cloudinary account.
3. Copy the **Cloud name** shown in the **Product Environment** area of the Cloudinary dashboard.
4. Open **Settings → API Keys** (or select **Go to API Keys** on the dashboard). Copy the **API Key** and reveal and copy the **API Secret**. Cloudinary may ask you to confirm your identity.
5. Return to RentEase and enter the Cloud name, API Key, and API Secret in **Connect Cloudinary**. Select **Connect my Cloudinary account**. RentEase checks the values before saving them.
6. Add a product photo to check that the connection works. If credential verification or image upload fails during local development, check the API server terminal for sanitized Cloudinary status and error details; the browser still receives a generic message, and credentials are not logged. Production keeps the same generic response.

Cloudinary’s official [credential guide](https://cloudinary.com/documentation/finding_your_credentials_tutorial) includes screenshots and current navigation. Use a Cloudinary account or product environment dedicated to RentEase when possible. Never send the API Secret in email, chat, screenshots, or support requests. If it is exposed, disable or rotate the key in Cloudinary and connect the replacement in RentEase.

Disconnecting Cloudinary in RentEase removes the saved credentials and stops new image uploads. It does not delete images already stored in Cloudinary. Existing images from an earlier shared Cloudinary account also remain there until replaced.

## Part 5: Deploy the API to Render and the website to Vercel

The production setup has two services connected to the same GitHub repository:

- **Render** runs the private Express API and connects to MongoDB.
- **Vercel** builds and serves the public React website.

Deploy the API first. Then configure Vercel with its URL, and finally allow the Vercel domain in the API's CORS settings.

### A. Prepare MongoDB Atlas for Render

1. Use a dedicated database user with a strong password.
2. In Atlas, open **Network Access** and allow the outbound IP ranges for the Render service. Render lists these in the service dashboard under **Connect → Outbound**. Do not allow every address (`0.0.0.0/0`) for production.
3. If you need stable outbound addresses and your Render plan supports them, configure dedicated outbound IPs and add them to Atlas. See [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses), [Render dedicated IPs](https://render.com/docs/dedicated-ips), and [MongoDB Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/).
4. Keep your MongoDB connection URI handy. You will add it to Render as `MONGODB_URI`.

### B. Publish the repository to GitHub

Both hosts deploy from the same Git repository. Create a private repository on GitHub, then from a terminal in the RentEase project folder run:

```sh
git init
git add .
git status --short
git commit -m "Prepare RentEase deployment"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the GitHub address with your repository address. Check that `.env` is not listed in `git status`; `.gitignore` excludes it. Never commit passwords, database URIs, API secrets, or the encryption key. GitHub Desktop is an alternative if you prefer a visual interface.

### C. Deploy the backend API to Render

1. Sign in to Render and choose **New → Blueprint** (sometimes labeled **Blueprint instance**).
2. Connect GitHub and select the RentEase repository. Render reads `render.yaml` from the project root. This service installs production dependencies with `npm ci --omit=dev`, starts with `npm start`, and checks `/api/health`. It does not build or serve the React site.
3. Add the requested environment values when Render prompts you:
   - `MONGODB_URI`: your Atlas connection URI.
   - `DEVELOPER_EMAIL` and `DEVELOPER_PASSWORD`: credentials for the platform developer account.
   - `CLOUDINARY_CREDENTIALS_KEY`: the 64-character key generated in Part 2.
   - `CLIENT_ORIGIN`: the Vercel site origin used to create reset links.
   - Render generates `JWT_SECRET` for the service.
4. Select **Deploy Blueprint**. Wait for the service to finish deploying and check its logs if the deployment reports an error.
5. Copy the Render service URL, for example `https://rentease.onrender.com`. Open `https://rentease.onrender.com/api/health`; a healthy service responds with `{"ok":true}`. The base URL responds with API service information.

Blueprint secrets marked `sync: false` can be entered during initial setup. If needed later, add them under the service's **Environment** settings and redeploy. See [Render Blueprint environment variables](https://render.com/docs/blueprint-spec#setting-environment-variables) and the [Render web service guide](https://render.com/docs/web-services).

### D. Deploy the frontend to Vercel

1. Sign in to Vercel and choose **Add New → Project**. Import the same GitHub repository.
2. Keep the project root as the **Root Directory**. Vercel detects Vite; confirm these settings if asked:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
3. In **Environment Variables**, add:
   - Name: `VITE_API_BASE_URL`
   - Value: your Render service URL, such as `https://rentease.onrender.com` (do not append `/api`).
   - Environment: **Production**. Add **Preview** too only if you intend to use preview deployments.
4. Select **Deploy**. The frontend uses this value to call the Render API. Variables prefixed `VITE_` are included in browser JavaScript, so this one is public configuration: never put passwords, tokens, MongoDB details, or Cloudinary secrets here.
5. After deployment, copy the production domain Vercel assigned to the site, such as `https://rentease.vercel.app`.

See Vercel's official [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite) and [environment variable guide](https://vercel.com/docs/environment-variables). Vercel applies environment variable changes on a new deployment, so redeploy after changing `VITE_API_BASE_URL`.

### E. Allow the Vercel site to call the Render API

1. In Render, open the RentEase API service and go to **Environment**.
2. Add `CLIENT_ORIGIN` with the exact Vercel production origin, for example `https://rentease.vercel.app`. Do not include a path or trailing slash.
3. If you use a custom domain, list each exact allowed domain separated by commas, such as `https://rentease.vercel.app,https://rent.example.com`. Do not use `*`.
4. Save the change and let Render redeploy/restart the service.
5. Open the Vercel site, create/sign in to a customer account, and check that the catalog loads. Sign in to the developer account and create an admin to verify the complete flow.

CORS must list the browser's actual site origin. Preview deployments use different URLs; they will be blocked unless their exact origins are also added to `CLIENT_ORIGIN`. For basic production verification, use the stable Vercel production domain.

### Important production notes

- Atlas must allow the Render service's outbound IPs before the API can reach MongoDB.
- Keep `CLOUDINARY_CREDENTIALS_KEY` unchanged after admins connect accounts. Back it up securely; losing it means those admins must reconnect.
- Admins connect their own Cloudinary credentials inside RentEase. Do not put their Cloudinary API secrets in Render or Vercel.
- The app does not collect payments. Confirm business details, policy contacts, data retention, backup, and support processes before inviting real customers.
- Pushes to the connected Git branch can deploy both projects independently. Review the Vercel project and Render service deployment settings if automatic deployments are disabled.
## Common problems

- **The Vercel site cannot reach the API:** confirm `VITE_API_BASE_URL` is the Render service URL and `CLIENT_ORIGIN` in Render exactly matches the Vercel production origin, then redeploy/restart both as needed.
- **The API says it cannot connect to the database:** recheck `MONGODB_URI`, the database username/password, and the Atlas network allowlist. Restart the local server after editing `.env`.
- **The developer login does not work:** confirm `DEVELOPER_EMAIL` and `DEVELOPER_PASSWORD` in `.env`, then restart the server. The server refreshes that developer account on startup.
- **Cloudinary says it cannot verify the credentials:** check that the Cloud name belongs to the same product environment as the API Key and API Secret. Copy the API Secret again from **Settings → API Keys**.
- **Cloudinary cannot connect after deployment:** make sure `CLOUDINARY_CREDENTIALS_KEY` is set in Render and is exactly 64 hexadecimal characters. If you changed the key after saving an admin connection, that admin must reconnect Cloudinary.
- **Product photos do not upload:** confirm the admin’s Cloudinary account is connected, the file is JPEG, PNG, WebP, or AVIF, and it is no larger than 5 MB.
- **An admin cannot sign in:** admins are created by the developer account; they cannot register as admins from the public sign-up form.

## Before inviting real customers

- Replace the business, privacy, support, and IP contact placeholders in the policy pages.
- Confirm applicable laws, operating locations, data retention, and support processes.
- Back up MongoDB and the Cloudinary encryption key securely.
- Make sure each admin can access and manage their own Cloudinary account.

For more information about the app’s roles, security, and data model, see [README.md](README.md).



## Profile photos and account security

Admin shop profile photos and product photos use each admin’s separately connected Cloudinary account. No shared platform Cloudinary account is needed. The API decrypts the signed-in admin’s credentials server-side and uses the same account to upload both image types.

Signed-in users can change their password from the footer. Enter the current password, then the new password twice. A successful change signs out other sessions. There is no email-based recovery flow; users who cannot sign in must contact the platform operator.



Customers can delete their account after active rentals are returned. Admins must resolve open rentals first. Deletion requires the current password; a deleted email can be registered again.
