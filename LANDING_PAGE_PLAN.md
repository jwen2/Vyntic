# Vyntic Landing Page — Implementation Plan

## Navigation Bar
- **Left:** Vyntic logo
- **Center:** Product, Solutions, Customers, Resources, Pricing
- **Right:** Sign in (text link), **See a demo** (primary button)
- Sticky on scroll, dark background (#0A0F1E or similar dark navy)
- Mobile: hamburger menu with slide-out drawer

## Hero Section
- Dark background, full-width
- **Headline:** Large display text — e.g. "AI-Powered Deal Intelligence. Decisions in Minutes, Not Weeks."
- **Subheadline:** "Upload your CIMs, financials, and data rooms. Vyntic's AI analyzes every deal side-by-side so your IC gets answers faster."
- **CTA:** Email input + "Get started for free" button (bright blue/green accent)
- **Hero visual:** Screenshot/mockup of the Vyntic matrix UI with deals being compared
- **Social proof line:** "Trusted by PE analysts at [X] firms" or similar

## Customer Logos Section
- Light or dark strip with 6-8 logos in a horizontal row
- Placeholder logos for now (can use "Firm A", "Firm B" styled boxes until real customers)

## Product Features Section (3-4 cards)
| Feature | Description |
|---------|-------------|
| **Multi-Deal Comparison Matrix** | Ask one question, get answers across every deal. Side-by-side matrix with source citations. |
| **AI-Powered Document Analysis** | Upload CIMs, financials, Excel models. Vyntic parses tables, charts, and text with full fidelity. |
| **Source Verification** | Every answer links back to the exact page and paragraph. Click a citation to open the source document. |
| **Synthesis & Red Flags** | Auto-generated comparison summaries highlight key differences and risks across deals. |

Each card: icon/illustration, title, 1-2 sentence description, "Learn more" link

## How It Works Section (3-step timeline)
1. **Upload** — Drag and drop CIMs, financials, and data room files into each deal
2. **Ask** — Use pre-built PE question templates or write your own queries
3. **Compare** — Get an AI-generated comparison matrix with citations and synthesis

Visual: numbered steps with connecting line, small illustrations per step

## Testimonial / Quote Section
- 1-2 quote cards (placeholder for now)
- Format: large quote text, name, title, firm
- "Vyntic cut our screening time from days to hours."

## Pricing Section
- Simple 2-3 tier layout or "Contact us for pricing" with feature comparison
- Free tier: 3 deals, 10 queries/day
- Pro tier: unlimited deals, priority support
- Enterprise: SSO, audit trails, custom question sets

## Final CTA Section
- Dark background, centered
- "Ready to transform your deal analysis?"
- Email input + "Get started for free" (repeat of hero CTA)

## Footer
- 4-column layout
- **Product:** Features, Pricing, Changelog, API Docs
- **Company:** About, Careers, Contact, Blog
- **Legal:** Privacy Policy, Terms of Service, Security
- **Social:** LinkedIn, Twitter/X
- Bottom bar: copyright, "Built for PE analysts"

---

## Design System

### Colors
- **Background:** Dark navy (#0A0F1E) for hero/footer, white (#FFFFFF) for content sections
- **Primary accent:** Bright blue (#2563EB) for CTAs and links
- **Text:** White on dark, gray-900 on light
- **Secondary accent:** Emerald green (#10B981) for success states / highlights

### Typography
- **Headlines:** Inter or system sans-serif, bold, 48-64px hero, 32-40px sections
- **Body:** 16-18px, regular weight, gray-600 on light backgrounds
- **Monospace accents:** For any "technical" feel elements

### Layout
- Max-width 1280px centered
- Generous vertical padding between sections (80-120px)
- Responsive: single column on mobile, 2-3 column grids on desktop

### Interactions
- Smooth scroll between sections
- Subtle fade-in on scroll for each section
- Hover states on cards (slight lift + shadow)
- Nav dropdown menus for Product/Solutions/Resources

---

## Technical Approach
- New Next.js page at `/src/app/landing/page.tsx` (or replace home page)
- All Tailwind CSS — no additional dependencies needed
- Components to build:
  - `LandingNav.tsx` — sticky nav with mobile menu
  - `HeroSection.tsx` — headline, CTA, hero image
  - `LogoStrip.tsx` — customer logos
  - `FeatureCards.tsx` — product features grid
  - `HowItWorks.tsx` — 3-step timeline
  - `Testimonials.tsx` — quote cards
  - `PricingSection.tsx` — tier cards
  - `FinalCTA.tsx` — bottom CTA block
  - `LandingFooter.tsx` — multi-column footer
- Static page, no API calls needed
- Can add Framer Motion later for scroll animations (Phase 2)

---

## Open Questions for Tomorrow
1. Should the landing page replace the current home page, or live at a separate route (e.g. `/landing`)?
2. Do we have a Vyntic product screenshot/mockup to use as the hero image, or should we create one?
3. Real customer logos / testimonials, or placeholder content for now?
4. Pricing tiers — are these accurate or just placeholder?
