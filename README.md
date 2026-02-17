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

## Run locally

### 1) Backend

```bash
cd "/Users/hunterbedwell/Documents/Twitch bot/backend"
npm install
export DATABASE_URL="postgresql://postgres:<YOUR_PASSWORD>@localhost:5432/vicino"
export ADMIN_REVIEW_KEY="<YOUR_ADMIN_REVIEW_KEY>"
export JWT_ACCESS_SECRET="<LONG_RANDOM_SECRET>"
export JWT_REFRESH_DAYS="30"
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

1. Replace in-memory storage with PostgreSQL + Prisma.
2. Add auth + onboarding + required ID verification gate.
3. Integrate Places API for strict public POI validation.
4. Add push notifications for match/offer events.
5. Build real chat transport with sockets.
6. Add moderation (`report/block`) and admin audit tooling.
