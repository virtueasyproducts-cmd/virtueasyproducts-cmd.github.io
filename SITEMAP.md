# Virtueasy Site Architecture

**Domain:** virtueasy.com (CNAME → virtueasyproducts-cmd.github.io)

---

## Pages

### Hub Pages (this repo)

| URL | File | Status | Notes |
|-----|------|--------|-------|
| `virtueasy.com/` | `/index.html` | Live | Hub homepage — full prototype |
| `virtueasy.com/resources/` | `/resources/index.html` | Stub | Resource library index |
| `virtueasy.com/blog/` | `/blog/index.html` | Stub | Blog index |
| `virtueasy.com/pricing-tool/` | `/pricing-tool/index.html` | Live | VA Pricing Calculator (full app) |
| `virtueasy.com/starterkit/` | `/starterkit/index.html` | Live | VA Starter Kit sales page ($27) |
| `virtueasy.com/va-proposal-template/` | `/va-proposal-template/index.html` | Live | Free VA proposal template landing + editable template |
| `virtueasy.com/privacy-policy.html` | `/privacy-policy.html` | Live | Existing privacy policy |

### External Pages (not in this repo)

| URL | Destination | Notes |
|-----|-------------|-------|
| `virtueasy.com/onboarding-kit/` | `/onboarding-kit/index.html` | Live | Client Onboarding Kit ($7) |
| `virtueasyproducts-cmd.github.io/va-blueprint-preview` | External | Blueprint Days 10-12 free preview |

---

## Assets

| Path | Description |
|------|-------------|
| `/assets/virtueasy-logo.png` | Site logo |
| `/assets/css/main.css` | Shared stylesheet (nav, footer, buttons, typography) |
| `/BlueprintDemo(1).mp4` | Blueprint demo video |

---

## Navigation Structure

```
Home (/)
├── Resources (/resources/)
├── Blog (/blog/)
├── Blueprint → blueprint.virtueasy.com [external]
├── Pricing Tool (/pricing-tool/)
```

---

## Products and Pricing

| Product | Price | URL |
|---------|-------|-----|
| VA Starter Kit | $27 | virtueasy.com/starterkit/ |
| Client Onboarding Kit | $7 | virtueasy.com/onboarding-kit/ |
| VA Proposal Template | Free | virtueasy.com/va-proposal-template/ |
| VA Pricing Tool | Free | virtueasy.com/pricing-tool/ |
| VA Proposal Template | Free | virtueasy.com/va-proposal-template/ |

---

## Tech Stack

- **Hosting:** GitHub Pages
- **Domain:** Custom CNAME (virtueasy.com)
- **Fonts:** Bebas Neue (display), Barlow (body) via Google Fonts
- **Colors:** `#FF1F7A` pink / `#0A0A0A` black / `#F8F8F8` off-white
- **No build process** — pure static HTML/CSS

---

## TODO / Next Steps

- [ ] Wire newsletter form to email provider (ConvertKit, MailerLite, etc.)
- [ ] Add Meta Pixel to new hub pages if tracking is needed
- [ ] Add blog posts when content is ready
- [ ] Add more resource cards as products launch
- [ ] Add OG image at `/og-image.jpg` for social sharing
- [ ] Consider adding a `/start-here/` page as a guided onboarding flow
