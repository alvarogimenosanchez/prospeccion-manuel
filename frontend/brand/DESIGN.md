---
source: https://www.nnespana.es/
brand: Nationale-Nederlanden
style: Professional Insurance Platform
themes: [light]
default_theme: light
extracted: 2026-04-18T18:37:56.799Z
generator: design-extractor
---

# DESIGN.md

## Design Summary

A professional financial services design system featuring a distinctive orange brand color (#ea650d) as the primary accent, paired with neutral grays for text and backgrounds. The design emphasizes trust and accessibility with clean typography using the custom NNNittiGrotesk font family (fallback: Lato), consistent 4px border radius, and subtle shadows for depth. The layout is structured and business-focused, suitable for insurance and financial products.

## Style Tags

`corporate`, `professional`, `orange-accent`, `clean`, `trustworthy`

## Colors

| Token | Hex | Role | Context |
|-------|-----|------|---------|
| primary-orange | #ea650d | primary | Primary brand color, buttons, links, and key interactive elements |
| dark-gray-text | #414141 | text | Primary text color for headings and body content |
| blue-accent | #0270e0 | accent | Secondary accent color for links and interactive elements |
| white-background | #ffffff | background | Primary background color for main content areas |
| button-gray | #404040 | secondary | Secondary buttons and form elements |
| light-gray-background | #f1edeb | background | Subtle background sections and cards |
| border-gray | #e5ded9 | border | Subtle borders and dividers |
| dark-orange | #e64415 | accent | Darker orange variant for hover states |

## Typography

| Token | Font | Size | Weight | Line Height | Role |
|-------|------|------|--------|-------------|------|
| heading-large | NNNittiGrotesk-Heading | 36px | 400 | 40px | Large headings and hero text |
| heading-medium | NNNittiGrotesk-Heading | 24px | 400 | 28px | Section headings and subheadings |
| body-large | NNNittiGrotesk-Regular | 24px | 400 | 33.6px | Large body text and prominent content |
| body-regular | NNNittiGrotesk-Regular | 16px | 400 | 22px | Standard body text and paragraphs |
| body-medium | NNNittiGrotesk-Medium | 16px | 400 | 24px | Emphasized body text and labels |
| body-bold | NNNittiGrotesk-Bold | 16px | 400 | 24px | Strong emphasis and important text |

> **Note**: NNNittiGrotesk is a custom proprietary font. Fallback stack: `"Lato", -apple-system, system-ui, sans-serif`

## Spacing (4px base grid)

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 12px |
| lg | 16px |
| xl | 24px |
| 2xl | 32px |
| 3xl | 40px |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| sm | 2px | Very subtle rounding |
| md | 4px | **Standard** — buttons, cards, inputs |
| lg | 6px | Slightly larger elements |
| xl | 8px | Modals, large cards |
| pill | 25px | Badges, tags |

## Elevation

Subtle depth using soft shadows:
- Cards: `box-shadow: 0 2px 8px rgba(102, 102, 102, 0.10)`
- Modals: `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.10)`
- No dramatic elevation — flat-adjacent aesthetic

## Component Patterns

- **Primary Button**: `background: #ea650d`, white text, `border-radius: 4px`
- **Secondary Button**: white background, `#404040` text + border, `border-radius: 4px`
- **Navigation Header**: horizontal with orange logo, text links, search
- **Agent Cards**: white cards with orange accent elements, `border-radius: 4px`
- **Hero Section**: large text, CTA button, supporting imagery

## Do's and Don'ts

- ✅ Use #ea650d sparingly for primary actions and key highlights
- ❌ Don't use orange for large background areas — accents and interactive only
- ✅ Maintain 4px border radius consistently
- ❌ Don't mix border radius values
- ✅ Use Lato (or NNNittiGrotesk when available) for all text
- ❌ Don't use pure black (#000000) — use #414141 for readability
- ✅ Ensure contrast between #414141 text and white/warm backgrounds
