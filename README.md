# Vicino

Initial scaffold for Vicino, a US-only dating app focused on safe in-person public meetups.

## What is implemented now

- `mobile/`: Expo React Native app scaffold
  - Tabs: `Swipe`, `Messages`, `Active Matches`, `Profile`
  - Purple/white theme with rounded UI
  - Mock swipe and message cap flow (30 per person / 60 total)
- `backend/`: Node + Express TypeScript API scaffold
  - Swipe right/left and mutual matching
  - Message cap enforcement (`30` per person)
  - Meet decision lock after chat cap
  - Availability session (`I am out and open to meeting`)
  - Candidate selection + single recipient offer
  - Offer response timeout (`120 seconds`)
  - Location expiry (`30 minutes`)
  - Coordination window (`15 minutes`)
  - JWT auth with refresh sessions (no insecure default JWT secret fallback)
  - Plan tier foundation (`free` / `plus`) with server-side free daily swipe limit

## Run locally

### 1) Backend

```bash
cd "/Users/hunterbedwell/Documents/Twitch bot/backend"
npm install
export DATABASE_URL="postgresql://postgres:<YOUR_PASSWORD>@localhost:5432/vicino"
export ADMIN_REVIEW_KEY="<YOUR_ADMIN_REVIEW_KEY>"
export JWT_ACCESS_SECRET="<LONG_RANDOM_SECRET>"
export ADMIN_USERNAME="<YOUR_ADMIN_USERNAME>"
export ADMIN_PASSWORD="<YOUR_ADMIN_PASSWORD>"
export ADMIN_EMAIL="<YOUR_ADMIN_EMAIL>"
export JWT_REFRESH_DAYS="30"
export FREE_DAILY_SWIPE_LIMIT="100"
export POLICY_VERSION_CURRENT="v1.0"
export PUSH_NOTIFICATIONS_ENABLED="true"
npm run migrate
npm run dev
```

Backend runs on `http://localhost:4000`.

### 2) Mobile

```bash
cd "/Users/hunterbedwell/Documents/Twitch bot/mobile"
npm install
npx expo install expo-notifications
export EXPO_PUBLIC_API_BASE_URL="http://localhost:4000"
npm run start
```

Then open iOS/Android simulator from Expo.

## Off-network Tester Installs (EAS)

Use this when testers are not on your local network.

```bash
cd "/Users/hunterbedwell/Documents/Twitch bot/mobile"
npm install
npx eas login
npx eas build:configure
```

Internal build links for testers:

```bash
cd "/Users/hunterbedwell/Documents/Twitch bot/mobile"
EXPO_PUBLIC_API_BASE_URL="https://vicino-production.up.railway.app" npx eas build --platform ios --profile preview
EXPO_PUBLIC_API_BASE_URL="https://vicino-production.up.railway.app" npx eas build --platform android --profile preview
```

Production App Store path:

```bash
cd "/Users/hunterbedwell/Documents/Twitch bot/mobile"
EXPO_PUBLIC_API_BASE_URL="https://vicino-production.up.railway.app" npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production
```

## Next build steps

1. Add Stripe products + webhook handling for `plus` upgrades.
2. Add App Store / Play in-app subscription flow in mobile.
3. Add legal links/screens in-app using the policy files in `docs/`.
4. Add report/block + trust score signals to moderation pipeline.
5. Add analytics/events for conversion funnel and retention.

## Legal policy files

- `/Users/hunterbedwell/Documents/Twitch bot/docs/terms-of-service.md`
- `/Users/hunterbedwell/Documents/Twitch bot/docs/privacy-policy.md`
- `/Users/hunterbedwell/Documents/Twitch bot/docs/community-guidelines.md`
