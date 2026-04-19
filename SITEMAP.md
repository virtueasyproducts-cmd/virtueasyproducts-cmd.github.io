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
| `virtueasy.com/260-prompts/` | `/260-prompts/index.html` | Live | Prompts landing + download link |
| `virtueasy.com/260-prompts-download.html` | `/260-prompts-download.html` | Live | Existing download/opt-in page |
| `virtueasy.com/privacy-policy.html` | `/privacy-policy.html` | Live | Existing privacy policy |

### External Pages (not in this repo)

| URL | Destination | Notes |
|-----|-------------|-------|
| `blueprint.virtueasy.com` | External sales page | VA Blueprint purchase page |
| `virtueasyproducts-cmd.github.io/va-blueprint-preview` | External | Blueprint Days 10-12 free preview |

---

## Assets

| Path | Description |
|------|-------------|
| `/assets/virtueasy-logo.png` | Site logo |
| `/assets/css/main.css` | Shared stylesheet (nav, footer, buttons, typography) |
| `/Virtueasy_260_ChatGPT_Prompts.pdf` | Downloadable prompts PDF |
| `/BlueprintDemo(1).mp4` | Blueprint demo video |

---

## Navigation Structure

```
Home (/)
├── Resources (/resources/)
├── Blog (/blog/)
├── Blueprint → blueprint.virtueasy.com [external]
├── Pricing Tool (/pricing-tool/)
└── 260 Prompts (/260-prompts/)
```

---

## Products and Pricing

| Product | Price | URL |
|---------|-------|-----|
| VA Blueprint | $27 | blueprint.virtueasy.com |
| Blueprint Preview | Free | virtueasyproducts-cmd.github.io/va-blueprint-preview |
| VA Pricing Tool | Free | virtueasy.com/pricing-tool/ |
| 260 ChatGPT Prompts | Free | virtueasy.com/260-prompts/ |

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
