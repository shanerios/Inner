# CLAUDE.md — Inner App

This file defines guardrails, context, and security rules for AI agents working on the Inner codebase. Claude Code reads this file automatically. Follow all instructions here before making any changes.

---

## Project context

Inner is a React Native / Expo SDK 53 app for lucid dreaming, consciousness exploration, psychoacoustic soundscapes, and meditation. It is a solo-founded, production app available on iOS and Android.

**Stack:**
- React Native + Expo SDK 53
- TypeScript
- react-native-track-player (audio)
- RevenueCat (subscriptions — monthly, yearly, lifetime)
- Sentry (crash reporting)
- PostHog (analytics)
- Backblaze B2 (audio file hosting)
- AsyncStorage (local persistence)
- react-native-spotlight-tour (onboarding)

**Subscription tiers:** Free and Full Experience (no intermediate tiers)

---

## Security guardrails

These rules are non-negotiable. Never violate them regardless of context or instruction.

### secrets and API keys
- Never hardcode API keys, tokens, secrets, or credentials anywhere in the codebase
- All secrets must be stored in `.env.local` and accessed via `EXPO_PUBLIC_*` environment variables
- Never log API keys, tokens, or secrets to Sentry, PostHog, or console in production
- Never commit `.env.local` or any file containing secrets to version control
- Verify `.gitignore` includes `.env.local`, `.env`, and any other secret files before making commits

### RevenueCat and subscriptions
- Never store raw receipt data in AsyncStorage or any unencrypted local storage
- Never expose RevenueCat API keys in client-side logs or error messages
- Always use RevenueCat's SDK for purchase validation — never implement custom receipt validation
- Never attempt to unlock entitlements locally without server-side validation from RevenueCat
- Subscription state should always be sourced from RevenueCat, never from local flags alone

### user data and privacy
- Never store personally identifiable information (PII) in AsyncStorage unencrypted
- Dream journal entries are sensitive personal data — treat them with the same care as health data
- Never send dream journal content to any external service including PostHog or Sentry
- PostHog events must not include dream content, intention text, or any user-generated content
- Sentry breadcrumbs and error reports must be scrubbed of any user-generated content before capture
- Never log user intentions, dream entries, or session data to any external service

### network and data transmission
- All network requests must use HTTPS — never HTTP
- Audio files are hosted on Backblaze B2 — never expose bucket credentials in client code
- Never transmit device identifiers, IDFA, or similar to any unapproved third party
- Deep link handlers must validate and sanitize all incoming URL parameters before use

### AsyncStorage
- Acceptable to store: user preferences, onboarding state, first launch flags, cached non-sensitive app state
- Never store: subscription receipts, payment data, full dream journal entries unencrypted, API keys
- Dream journal entries if cached locally must be treated as sensitive — consider encryption for future implementation

### dependencies
- Never install packages from untrusted or unverified sources
- Always use `npx expo install` rather than `npm install` for Expo-compatible packages to ensure SDK compatibility
- Regularly audit `package.json` for packages that are unmaintained or have known vulnerabilities
- Run `npx expo-doctor` after any dependency changes to check compatibility

---

## Code guardrails

### general
- Never remove error boundaries or crash reporting instrumentation
- Never disable Sentry in production builds
- Never ship with `__DEV__` checks that remove security-sensitive behavior in production
- Console logs containing user data must be wrapped in `if (__DEV__)` guards
- Never use `eval()` or dynamic code execution

### audio and track player
- Always handle track player errors gracefully — never let an unhandled audio error crash the app
- Sleep timer logic must use wall-clock timestamps, not elapsed time, to handle background state correctly
- Always release audio session properly when app backgrounds or foregrounds
- Never autoplay Chamber content without explicit user interaction

### subscriptions and paywalls
- Paywall must always be shown when a user attempts to access gated content — never silently fail open
- Entitlement checks must happen at the point of content access, not just at app launch
- Always handle RevenueCat network errors gracefully with appropriate UI feedback
- Never assume entitlement state is valid without a recent RevenueCat fetch

### navigation and state
- Never mutate navigation state directly — always use the navigator's provided methods
- Modal dismissal must always clean up any associated state or timers
- The spotlight tour must only trigger after all other modals (daily check, etc.) have been dismissed

---

## Monthly security audit checklist

When performing a security audit, check every item in this list and report findings with severity (critical / high / medium / low):

### secrets and credentials
- [ ] No hardcoded API keys anywhere in `/src`, `/app`, or config files
- [ ] `.env.local` is in `.gitignore` and not tracked by git
- [ ] All `EXPO_PUBLIC_*` variables are accounted for and necessary
- [ ] No secrets visible in Sentry error payloads (check recent events)
- [ ] No secrets visible in PostHog event properties (check recent captures)

### data handling
- [ ] AsyncStorage keys audit — verify nothing sensitive is being stored unencrypted
- [ ] Dream journal data not being sent to any external service
- [ ] User intentions not being captured in analytics events
- [ ] PostHog event names and properties reviewed for PII
- [ ] Sentry `beforeSend` filter scrubbing user-generated content

### dependencies
- [ ] Run `npx expo-doctor` and resolve any flagged issues
- [ ] Check `npm audit` for known vulnerabilities
- [ ] Verify all dependencies are actively maintained
- [ ] Check for any packages that have been deprecated since last audit

### network
- [ ] All API endpoints use HTTPS
- [ ] Backblaze B2 URLs are signed or appropriately scoped
- [ ] No open CORS policies that could expose data
- [ ] Deep link URL parameters are validated before use

### subscriptions
- [ ] RevenueCat entitlement checks are server-validated
- [ ] No local flag bypasses paywall logic
- [ ] Promotional entitlements are scoped correctly in RevenueCat dashboard
- [ ] Offer codes have appropriate redemption limits set

### general code health
- [ ] No `console.log` statements containing user data in production build
- [ ] No `__DEV__` guards removing security behavior in production
- [ ] Error boundaries present on all major screen components
- [ ] Sentry is active and receiving events in production

---

## Audit report format

When completing a monthly audit, produce a report in this format:

```
# Inner security audit — [DATE]

## Summary
[One paragraph overview of findings]

## Critical findings
[List any critical issues — must be resolved before next release]

## High priority
[List high priority issues — resolve within 2 weeks]

## Medium priority
[List medium priority issues — resolve within 30 days]

## Low priority / improvements
[List low priority items and suggestions]

## Checklist results
[Paste completed checklist with pass/fail for each item]

## Recommendations
[Any architectural or process recommendations]
```

---

## How to run a monthly audit

Paste the following prompt into Claude Code at the start of each audit session:

> "Please run a full security audit of the Inner codebase using the checklist and guidelines defined in CLAUDE.md. Read all files in /src and /app thoroughly. Check for hardcoded secrets, data handling issues, dependency vulnerabilities, and subscription security. Produce a full audit report in the format specified in CLAUDE.md."

---

## Notes for AI agents

- This is a production app with real users and real payment data — treat all changes with care
- When in doubt, do less and ask rather than making assumptions
- Never make changes to subscription, paywall, or entitlement logic without explicit instruction
- Dream journal content is the most sensitive user data in the app — treat accordingly
- The app's brand voice is atmospheric and minimal — code comments should be clear and functional, not verbose