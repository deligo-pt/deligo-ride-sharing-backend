# Deligo Authentication API

এই নথি বর্তমান Express route, controller, validation schema এবং auth service অনুযায়ী লেখা। API prefix `/api/v1`; তাই নিচের প্রতিটি path-এর পূর্ণ local URL `http://localhost:3000/api/v1`-এর পরে যুক্ত হবে। JSON body-যুক্ত request-এ `Content-Type: application/json` পাঠান।

## Endpoint তালিকা

| Method ও path | ব্যবহারকারী | Authentication | কাজ |
|---|---|---|---|
| `POST /auth/customer/otp/request` | Customer | Public | Email বা Portuguese phone-এ OTP পাঠায়; পরিচিত customer হলে login flow, নতুন হলে signup flow শুরু হয় |
| `POST /auth/customer/otp/verify` | Customer | Public | OTP যাচাই করে customer-কে login করায় বা account তৈরি করে |
| `POST /auth/signup/initiate` | Driver (compatibility route) | Public | Email **অথবা** Portuguese phone দিয়ে Driver signup শুরু |
| `POST /auth/driver/signup/initiate` | Driver | Public | Email দিয়ে Driver signup শুরু |
| `POST /auth/fleet/signup/initiate` | Fleet Manager | Public | Email দিয়ে Fleet Manager signup শুরু |
| `POST /auth/fleet-manager/signup/initiate` | Fleet Manager | Public alias | উপরের Fleet Manager signup route-এর alias |
| `POST /auth/signup/resend-otp` | Driver, Fleet Manager | Public | Signup session-এর OTP পুনরায় পাঠায় |
| `POST /auth/signup/verify-otp` | Driver, Fleet Manager | Public | Signup OTP যাচাই, account তৈরি ও session/token issue |
| `POST /auth/driver/login` | Driver | Public | Driver password login |
| `POST /auth/fleet/login` | Fleet Manager | Public | Fleet Manager password login |
| `POST /auth/fleet-manager/login` | Fleet Manager | Public alias | Fleet Manager login-এর alias |
| `POST /auth/admin/login` | Admin | Public | Admin password login; SUPER_ADMIN access label-ও এই route ব্যবহার করে |
| `POST /auth/google` | Customer | Public | Google login/signup |
| `POST /auth/facebook` | Customer | Public | Facebook login/signup |
| `POST /auth/apple` | Customer | Public | Apple login/signup |
| `POST /auth/refresh-token` | যেকোনো authenticated session | Refresh cookie অথবা body token | Refresh token rotate করে নতুন access token দেয় |
| `POST /auth/logout` | যেকোনো session | Optional Bearer এবং/অথবা refresh token | Session revoke করে এবং refresh cookie মুছে দেয় |
| `POST /auth/admin/create` | `ADMIN`, `SUPER_ADMIN` | Bearer access token | নতুন Admin-কে invitation পাঠায় |
| `POST /auth/admin/set-password` | আমন্ত্রিত Admin | Public; invitation token body-তে | Invitation token দিয়ে password সেট ও account activate করে |

**গুরুত্বপূর্ণ:** `POST /auth/login` নামে customer password-login route নেই। Customer authentication হয় customer OTP বা social endpoint দিয়ে। `/auth/signup/initiate` customer signup নয়—বর্তমান controller এই route-এ `DRIVER` role নির্ধারণ করে। Customer OTP flow-এর signup session-কে generic `/auth/signup/resend-otp` বা `/auth/signup/verify-otp`-এ ব্যবহার করবেন না; customer OTP-এর জন্য আলাদা `customer/otp/*` routes ব্যবহার করুন।

## Request ও response-এর সাধারণ নিয়ম

সফল response controller অনুযায়ী `success`, `statusCode`, `message` এবং প্রয়োজনমতো `data` দেয়:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged in successfully",
  "data": {}
}
```

Error response-এ `success: false`, `statusCode`, `message`, `code` ও `errorSources` থাকে; development environment-এ `stack`-ও থাকতে পারে। Validation error সাধারণত `422 VALIDATION_ERROR`।

### Contact ও password validation

- যেসব signup/login schema-তে contact লাগে, সেখানে `email` এবং `contactNumber`-এর মধ্যে **ঠিক একটি** দিতে হবে; দুইটি বা কোনোটিই না দিলে `422`।
- `contactNumber` অবশ্যই Portuguese `+351` নম্বর হতে হবে। National/spaced format গ্রহণ করে এবং E.164-এ normalize হয়। অন্য দেশের নম্বর প্রত্যাখ্যাত হয়।
- Email trim ও lowercase হয়।
- Signup এবং admin password: কমপক্ষে ৮ অক্ষর, uppercase, lowercase, digit এবং special character থাকতে হবে।
- Login password কেবল non-empty হতে হবে।
- `identifier`, `phone`, `firstName` ইত্যাদি schema-তে না থাকা field-এর ওপর নির্ভর করবেন না। Zod object-এর অজানা property বাদ যায়; প্রয়োজনীয় field না থাকলে validation ব্যর্থ হবে।

## Customer OTP login/signup

### OTP পাঠানো

`POST /api/v1/auth/customer/otp/request`

```json
{
  "email": "customer@example.com",
  "referralCode": "DLABC123"
}
```

অথবা:

```json
{ "contactNumber": "912 345 678" }
```

`email` বা `contactNumber` থেকে একটি আবশ্যক; `referralCode` optional, নতুন account-এ প্রযোজ্য। Response `200`-এর `data`-তে `authSessionId`, `channel`, `maskedTarget`, `expiresIn` থাকে। এই response-এ `isNewUser` দেওয়া হয় না।

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Verification code sent successfully",
  "data": {
    "authSessionId": "00000000-0000-4000-8000-000000000000",
    "channel": "EMAIL",
    "maskedTarget": "c***r@example.com",
    "expiresIn": 300
  }
}
```

### OTP যাচাই

`POST /api/v1/auth/customer/otp/verify`

```json
{
  "authSessionId": "00000000-0000-4000-8000-000000000000",
  "email": "customer@example.com",
  "otp": "123456"
}
```

Email অথবা একই session-এর `contactNumber` দিতে হবে; `otp` ছয়টি digit। নতুন customer হলে response `201`, `data.isNewUser: true`; পুরোনো customer login হলে `200`, `data.isNewUser: false`। উভয় ক্ষেত্রেই `data.user` ও `data.tokens` ফেরত আসে।

**এই endpoint-এর বিশেষ token আচরণ:** `data.tokens`-এ `accessToken`, `refreshToken`, `expiresIn` সবসময় JSON-এ ফেরত আসে। Controller এখানে refresh cookie সেট করে না এবং platform header দিয়ে token shape বদলায় না। Mobile app refresh token নিরাপদ storage-এ রাখবে।

## Driver ও Fleet Manager signup

### Signup initiate

Email-only Driver route:

`POST /api/v1/auth/driver/signup/initiate`

```json
{
  "email": "driver@example.com",
  "password": "Password123!",
  "referralCode": "DLABC123"
}
```

এই route ও Fleet Manager signup route-গুলো email-only। `/auth/signup/initiate` compatibility route-টি আলাদাভাবে email **অথবা** Portuguese `contactNumber` নেয়, কিন্তু এটিও `DRIVER` session তৈরি করে।

Fleet Manager-এর জন্য:

- `POST /api/v1/auth/fleet/signup/initiate`
- `POST /api/v1/auth/fleet-manager/signup/initiate` (alias)

উভয় ক্ষেত্রেই `email`, `password` আবশ্যক; `referralCode` optional। সফল response `200` এবং `data.signupSessionId` দেয়। Session ID পরবর্তী shared signup OTP requests-এ ব্যবহার করতে হবে।

### Signup OTP resend

`POST /api/v1/auth/signup/resend-otp`

```json
{
  "signupSessionId": "00000000-0000-4000-8000-000000000000",
  "email": "driver@example.com"
}
```

`email`/`contactNumber` optional cross-check; দুটো একসাথে দেওয়া যাবে না। না দিলে session-এর original contact-এ OTP পাঠায়।

### Signup OTP verify

`POST /api/v1/auth/signup/verify-otp`

```json
{
  "signupSessionId": "00000000-0000-4000-8000-000000000000",
  "email": "driver@example.com",
  "otp": "123456",
  "includeRefreshToken": true
}
```

`signupSessionId` ও ছয়-সংখ্যার `otp` আবশ্যক; contact cross-check ও `includeRefreshToken` optional। সফল হলে `201`, `data.user` ও `data.tokens` দেয়। এই endpoint refresh cookie সেট করে। `includeRefreshToken: true` দিলে mobile-style response-এ refresh token JSON-এও থাকবে।

Driver account-এর সঙ্গে `DriverProfile`, Fleet Manager-এর সঙ্গে `FleetManagerProfile` তৈরি হয়। Customer OTP signup আলাদা endpoint ও flow।

## Password login

Driver, Fleet Manager এবং Admin login body:

```json
{
  "email": "driver@example.com",
  "password": "Password123!",
  "rememberMe": true,
  "includeRefreshToken": true
}
```

অথবা email-এর বদলে Portuguese `contactNumber`। `rememberMe` default `false`; true হলে refresh session দীর্ঘস্থায়ী হয়। `includeRefreshToken` optional mobile signal।

| Role | Path | গ্রহণযোগ্য account role |
|---|---|---|
| Driver | `/api/v1/auth/driver/login` | `DRIVER` |
| Fleet Manager | `/api/v1/auth/fleet/login`, `/api/v1/auth/fleet-manager/login` | `FLEET_MANAGER` |
| Admin | `/api/v1/auth/admin/login` | `ADMIN` (SUPER_ADMIN access label-সহ Admin-ও) |

সফল response `200`; `data.user` এবং `data.tokens` থাকে। ভুল credentials-এ `401 Invalid credentials`; সঠিক credentials হলেও অন্য role হলে `403`। Suspended, deactivated বা pending account-ও `403` পায়।

## Social login (Customer)

সব endpoint public `POST`; successful response `200` এবং `data.user`, `data.tokens` দেয়। Body-তে `rememberMe` default `true`, `preferredLanguage` (`EN`/`PT`, default `EN`), `referralCode` ও `includeRefreshToken` optional।

| Path | আবশ্যক body field | Provider token |
|---|---|---|
| `/api/v1/auth/google` | `idToken` | Google ID token; configured audience ও verified email পরীক্ষা হয় |
| `/api/v1/auth/facebook` | `accessToken` | Facebook user access token; server Facebook API দিয়ে যাচাই করে |
| `/api/v1/auth/apple` | `idToken` | Apple identity token; optional `user: { "firstName": "...", "lastName": "..." }` |

Linked provider account থাকলে সেটি দিয়ে login হয়। Verified provider email দিয়ে বিদ্যমান account link করা কেবল customer account-এর ক্ষেত্রে অনুমোদিত; অন্য role বা অযোগ্য account-এ `403`। Invalid provider token সাধারণত `401`; invalid referral code `400`। Facebook profile email-কে service verified বলে ধরে না।

## Access/refresh token, cookie ও platform

Access token-এর default lifetime 15 মিনিট। Refresh session default 1 দিন; `rememberMe: true` হলে 30 দিন। Login, social login, signup verify এবং refresh endpoint refresh token-কে `refreshToken` নামের `httpOnly` cookie-তেও সেট করে; cookie path `/api/v1/auth`। `Secure` production-এ, অথবা `SAMESITE_COOKIE=none` হলে চালু। Cookie-তে JavaScript access পায় না।

`/auth/customer/otp/verify` ব্যতিক্রম: refresh token সবসময় JSON-এ দেয়, cookie সেট করে না। অন্য token-returning endpoint-গুলোতে:

- Default web response `data.tokens`: `accessToken`, `expiresIn`; refresh token cookie-তে থাকে।
- Mobile response-এ JSON-এ `refreshToken`-ও থাকে এবং cookie-ও সেট হয়।
- Mobile signal: `x-client-platform` বা `x-platform`-এর মান `mobile`, `android`, `ios`; অথবা body-তে `includeRefreshToken: true`; অথবা native app User-Agent (`okhttp`, `Dart`, `CFNetwork`, `Expo`, `ReactNative`)। Platform header দিলে সেটিই অগ্রাধিকার পায়; অন্য মান web হিসেবে গণ্য হয়।
- Browser request-এ mobile header দেবেন না। Mobile app JSON-এ পাওয়া refresh token Keychain/SecureStore-এ রাখবে।

`POST /api/v1/auth/refresh-token`-এ body optional। Server প্রথমে body `refreshToken`, না থাকলে `refreshToken` cookie নেয়। Body token থাকলে cookie-র চেয়ে সেটি অগ্রাধিকার পায়।

```json
{ "refreshToken": "{{refreshToken}}" }
```

Refresh token প্রতিবার rotate হয়; পুরোনো token পুনর্ব্যবহার ধরা পড়লে সংশ্লিষ্ট user-এর session revoke হয়। Response `200`; web-এ নতুন access token body-তে এবং refresh token cookie-তে, mobile signal থাকলে refresh token body-তেও।

### Logout

`POST /api/v1/auth/logout`; Bearer optional, refresh token body বা cookie-ও optional। `Authorization: Bearer <accessToken>` দিলে access token যাচাই হবে—ভুল/expired Bearer header দিলে request `401` হতে পারে, তাই কেবল refresh token দিয়ে logout করলে invalid bearer header পাঠাবেন না।

```json
{
  "refreshToken": "{{refreshToken}}",
  "fcmToken": "{{fcmToken}}",
  "clearFcmToken": true
}
```

`fcmToken` ও `clearFcmToken` optional; default-এ user-এর FCM token clear হয়, `clearFcmToken: false` দিলে তা রাখা হয়। Response `200`; refresh cookie clear করা হয়।

## Admin invitation

### Admin তৈরি

`POST /api/v1/auth/admin/create`-এ `ADMIN` বা `SUPER_ADMIN` Bearer token আবশ্যক:

```json
{
  "firstName": "Sam",
  "lastName": "Admin",
  "email": "sam.admin@example.com",
  "role": "ADMIN"
}
```

`role` `ADMIN` বা `SUPER_ADMIN`; default `ADMIN`। `SUPER_ADMIN` কেবল SUPER_ADMIN তৈরি করতে পারে। সফল response `201`; invite token response body-তে নয়, invitation email link-এ থাকে। Token ২৪ ঘণ্টা কার্যকর এবং URL `ADMIN_FRONTEND_URL`-এর `/set-password?token=...` path ব্যবহার করে।

### Password সেট

`POST /api/v1/auth/admin/set-password` public; email invite থেকে পাওয়া token body-তে দিতে হবে:

```json
{
  "token": "<invitation token>",
  "password": "NewAdmin123!"
}
```

সফল হলে `200`; account activate হয়, password সেট হয়, invitation token একবার ব্যবহার করে invalid হয়। ভুল/মেয়াদোত্তীর্ণ token-এ `400`। বর্তমান codebase-এ আলাদা forgot-password বা সাধারণ reset-password endpoint নেই।

## প্রধান status ও error

| Status | Auth-এ দেখা যায় এমন কারণ |
|---|---|
| `200` | OTP পাঠানো, login, social login, refresh, logout, admin password set |
| `201` | Customer OTP দিয়ে নতুন account তৈরি, signup verify, admin invite তৈরি |
| `400` | ভুল/মেয়াদোত্তীর্ণ OTP, session contact mismatch, invalid referral/invite token |
| `401` | ভুল credentials, invalid/expired/reused refresh token, invalid Bearer বা provider token |
| `403` | ভুল role, suspended/deactivated/pending account, অনুমোদনহীন SUPER_ADMIN invite |
| `404` | OTP/signup session পাওয়া যায়নি বা session expired |
| `409` | Email/phone আগেই নিবন্ধিত |
| `422` | Body/schema validation ব্যর্থ |
| `429` | Auth rate limit, OTP cooldown/resend limit বা ভুল OTP attempt limit |
| `500` | Production-এ admin invitation email delivery failure-সহ অপ্রত্যাশিত server error |

Signup/customer OTP সাধারণত ৬ digit এবং default ৫ মিনিট কার্যকর; signup session default ১৫ মিনিট। Signup OTP resend-এ ৬০ সেকেন্ড cooldown ও সর্বোচ্চ ৩টি resend; ৫টি ভুল code attempt-এর পর session terminate হয়। Customer OTP request-এ identifier-ভিত্তিক ৬০ সেকেন্ড cooldown ও প্রতি ঘণ্টায় সর্বোচ্চ ৫টি request আছে। Auth routes-এ সাধারণ limiter-ও প্রয়োগ হয় (refresh/logout ব্যতিক্রম): ১৫ মিনিটে প্রতি IP ও route-এ ২০টি, identity key-এ ১০টি।

## প্রাসঙ্গিক environment config

| Variable | কাজ |
|---|---|
| `JWT_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | JWT signing secret; production-এ `JWT_ACCESS_SECRET` আবশ্যক এবং secret placeholder হতে পারবে না |
| `JWT_ACCESS_EXPIRES_IN` | Access-token expiry; default `15m` |
| `JWT_REFRESH_EXPIRES_IN_DEFAULT`, `JWT_REFRESH_EXPIRES_IN_REMEMBER` | Refresh expiry; default `1d` / `30d` |
| `OTP_EXPIRES_IN_SECONDS`, `SIGNUP_SESSION_TTL_SECONDS` | OTP/session lifetime; default `300` / `900` |
| `SAMESITE_COOKIE` | `lax` (default), `strict` կամ `none` |
| `SMTP_*`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` | OTP, welcome ও admin invitation email |
| `BULKGATE_APPLICATION_ID`, `BULKGATE_APPLICATION_TOKEN` | SMS OTP |
| `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | Google token audience |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Facebook token যাচাই |
| `APPLE_CLIENT_ID`, `APPLE_BUNDLE_ID`, `APPLE_DEMO_MODE` | Apple token audience/demo mode |
| `ADMIN_FRONTEND_URL` | Admin invitation link-এর base URL |

পূর্ণ config ও environment setup-এর জন্য `.env.example` দেখুন।
