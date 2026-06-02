# Manual User Management

## 1. User Sends `/start`

If the user is not in the database, the bot answers:

```text
Access not found.
Send this ID to the administrator:
telegram:123456789
```

## 2. Create User

```bash
npm run routerctl -- user create --title "Ivan Manager"
```

## 3. Add Identity

```bash
npm run routerctl -- identity add \
  --user user_01J... \
  --platform telegram \
  --platform-user-id 123456789 \
  --chat-id 123456789 \
  --display-name "Ivan Manager"
```

## 4. Grant Assistant

```bash
npm run routerctl -- user grant-assistant \
  --user user_01J... \
  --assistant asst_01J...
```

## 5. Verify

```bash
npm run routerctl -- user show --user user_01J...
```

## 6. User Sends `/start` Again

Expected answer:

```text
You are connected to iirest Assistant.
Active assistant: Adzhapuri Assistant.
```
