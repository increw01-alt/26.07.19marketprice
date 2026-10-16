# Handoff: 모두의시세 (Modoosise) Homepage Redesign

## Overview

Three complete redesign directions for **모두의시세** (https://modoosise.com), a Korean all-in-one market data portal that aggregates real-time prices for cryptocurrency, stocks (KOSPI/KOSDAQ), FX rates, precious metals, energy/oil, macro rates, gift cards, hot deals, real estate, and lottery numbers.

The redesign responds to the client's feedback that the current site has **weak visual hierarchy** (hard to tell what's important). All three directions share a **Bloomberg-terminal-inspired high-density dashboard** philosophy: a live-scrolling ticker header, tab-based category switching on a single screen, gift-card-first prioritization, and real-time trading-desk energy.

## About the Design Files

The files in this bundle are **design references created in HTML** — high-fidelity prototypes showing intended look, layout, typography, color, and behavior. They are **not production code to copy directly**.

The task is to **recreate these HTML designs in the target codebase's existing environment** (Next.js, Nuxt, SvelteKit, React SPA, etc.) using its established component library, styling system, and data-fetching patterns. If no environment exists yet, choose the most appropriate framework for a data-heavy real-time dashboard (recommendation: **Next.js + Tailwind + TanStack Query + a lightweight charting library like Lightweight Charts or Recharts**).

Static prices and mock data in the HTML files are illustrative — production must wire real data sources (see **Data Sources** section).

## Fidelity

**High-fidelity (hifi).** All three prototypes use final colors, typography choices, exact spacing scales, and pixel-level composition. Recreate them pixel-perfectly using the codebase's existing libraries and patterns. Numeric values shown in tables/tickers are placeholders — the visual grammar around them (color coding for up/down, monospace alignment, spark placement) is the spec.

---

## The Three Variants

### V1 · Terminal Classic (`v1-terminal.html`)
**Vibe:** Pure Bloomberg terminal. Black background, amber (#ffb020) + cyan (#4ad8e6) accents, JetBrains Mono for everything numeric, F1–F12 style keyboard-shortcut tabs.
**Layout:** 3-column dense grid — left sidebar (200px, category nav + watchlist) / center main (KPI grid + chart + tables) / right panel (320px, news + FX + macro + lotto + realestate). Fixed viewport width 1440.
**Best for:** Power users, financial pros, people who want maximum information density.

### V2 · Modern Trading (`v2-modern.html`)
**Vibe:** Modern crypto/trading platform (Upbit / Bithumb premium tier). Navy dark base (`#0b0f14`), mint-green accent (`#00e5a8`), Pretendard sans + JetBrains Mono for numbers. Card-based but density maintained.
**Layout:** Single-column max-width 1440 with sticky header. Hero KPI strip (6 tiles) → category tab pills → 2-column grid (chart + top movers) → gift-card spotlight (4-col grid, 8 cards) → 3-column FX/metal/energy → 3-column news/lotto/realestate.
**Best for:** Broadest audience — modern, approachable, still information-dense.

### V3 · Editorial Data (`v3-editorial.html`)
**Vibe:** Financial Times / The Economist front page. Warm paper (`#f6f2ea`), serif headline (Fraunces), red accent (`#c8321f` FT-style), Inter body, JetBrains Mono for numbers.
**Layout:** Newspaper front page — masthead with edition metadata → subtle ticker band → hero story (3-col: lead + 2 sidebars) → §-numbered sections → 2×2 markets grid with dotted table borders → lotto feature in inverse dark block.
**Best for:** Trust/authority feel; readers over traders.

### Comparison shell (`index.html`)
Fixed top-nav with V1/V2/V3 tabs, embeds each variant in an iframe. Arrow-key navigation and `1`/`2`/`3` shortcuts. Not part of the shipped product — it's the review artifact.

---

## Screens / Views

All three variants render **a single homepage/dashboard**. There are no sub-routes in this handoff (category subpages `/coin`, `/stock`, etc. exist on the live site but are out of scope for this redesign). The category tabs on the redesign switch views **client-side in place** — no page navigation — which is a deliberate change from the current site's hub-and-spoke model.

### Shared regions across all three variants

| Region | Purpose | Notes |
|---|---|---|
| **Top brand bar** | Logo, primary nav, market-session status | V1 keeps it terminal-thin (36px); V2 is 60px with search; V3 is a 32px black strip + serif masthead below |
| **Ticker strip** | Live-scrolling prices (13–15 symbols) | CSS `@keyframes` translateX loop, duplicated content for seamless wrap. Speed: V1 90s, V2 80s, V3 100s |
| **Category tabs** | Overview / Coin / Stock / KOSDAQ / FX / Metal / Energy / Macro / Giftcard / Hotdeal / Realestate / Lotto | 12 tabs total (11 categories + Overview). Client-side switch — no route change |
| **Hero / KPI area** | Featured price block (BTC by default) + supporting indices | V1 = 4-tile grid with sparklines; V2 = 6-tile hero (BTC featured 2-wide); V3 = editorial 3-col with lead price block |
| **Chart block** | Interactive price chart with timeframe selector (1H/4H/1D/1W/1M) | V1 = candlestick; V2 = area (gradient fill); V3 = line with hatched fill |
| **Top movers table** | 6–8 crypto rows: symbol / price / 24h% / volume | Row hover state; color-coded % change chip |
| **Gift-card desk** ⭐ | The user's priority section — 6–8 cards showing 매입가 / 판매가 / 액면가율% | Given prime real-estate in all three variants |
| **FX grid** | 6 major currency pairs vs KRW | With flag emoji, code, value, 24h % |
| **Metals + Energy tables** | Precious metals per gram; oil prices by region | Standard data tables |
| **News feed** | Categorized news with timestamps | V3 gives it a full editorial section |
| **Lotto card** | Winning numbers + jackpot | 6 colored balls + 1 bonus |
| **Real estate + Macro rates** | Small tables | Seoul apartment averages, BOK rates, treasury yields |
| **Footer** | Data sources credit line | Upbit / Yahoo Finance / KRX / BOK / MOLIT / Opinet / 동행복권 |

---

## Design Tokens

### V1 · Terminal Classic

**Colors**
```
--bg:         #0a0a0a   /* page background */
--bg-1:       #111111   /* panels */
--bg-2:       #161616   /* hover surfaces */
--bg-3:       #1c1c1c   /* deep panels */
--line:       #242424   /* dividers */
--line-2:     #2e2e2e   /* stronger dividers */
--text:       #e8e6df   /* primary text (warm off-white) */
--dim:        #8a8778   /* secondary text */
--dim-2:      #5a5850   /* tertiary text */
--amber:      #ffb020   /* primary accent (highlights, active state) */
--amber-dim:  #8a5f10   /* accent borders */
--cyan:       #4ad8e6   /* secondary accent */
--up:         #3ddc84   /* positive change */
--down:       #ff4d4f   /* negative change */
--violet:     #c48fff   /* tertiary accent */
```

**Typography**
- Mono: `'JetBrains Mono', ui-monospace, Menlo, monospace` — used for all numbers, labels, ticker items
- Sans: `'Inter', 'Pretendard', -apple-system, sans-serif` — used for headings/body
- Base size: 13px, line-height 1.4
- Panel labels: 10–11px, letter-spacing 0.10–0.15em, uppercase
- KPI values: 22px mono, letter-spacing −0.02em, weight 500

**Spacing/Radius**
- Radius: 0–2px (terminal aesthetic — mostly square)
- Panel padding: 12–14px
- Row height: 26–36px (tight)
- Ticker height: 32px; tabbar tab padding 10×14

**Shadows / effects**
- Live dots: `box-shadow: 0 0 8px var(--amber)` (glow)
- Pulse animation: `@keyframes pulse` opacity 1 → 0.4 → 1 over 2s

### V2 · Modern Trading

**Colors**
```
--bg:        #0b0f14
--bg-1:      #111820   /* cards */
--bg-2:      #161f2a   /* hover */
--bg-3:      #1c2735   /* deeper */
--line:      #1f2a37
--line-2:    #2a3646
--text:      #e6edf5
--text-2:    #c1cad6
--dim:       #7d8b9c
--dim-2:     #4d5a6b
--accent:    #00e5a8   /* mint green — primary */
--accent-dim:#00926b
--accent-bg: rgba(0,229,168,0.08)
--up:        #00e5a8
--down:      #ff5c7c
--warn:      #ffb84d
--violet:    #a78bfa
--blue:      #60a5fa
```

**Logo gradient:** `linear-gradient(135deg, #00e5a8 0%, #00b8ff 100%)` with `box-shadow: 0 4px 12px rgba(0,229,168,0.25)`

**Typography**
- Sans: **Pretendard Variable** (via jsDelivr CDN) — headings, UI
- Mono: **JetBrains Mono** — all numbers
- Base 14px / 1.5
- KPI featured: 26px mono/600/−0.02em; regular KPI: 20px; small: 17px
- Card title: 14px/600; card sub: 12px/dim

**Spacing / Radius**
- Radius: cards 12–14px, buttons/pills 8–20px (`.pill` = 12px pill; `.market-status` = 20px)
- Card padding: header 14×18px, body 18px
- Grid gaps: 12px (hero), 20px (main sections)
- Header height: 60px sticky with `backdrop-filter: blur(20px)` on `rgba(11,15,20,0.9)`
- Ticker: 38px

**Background pattern**
```css
background-image:
  radial-gradient(circle at 20% 0%,   rgba(0,229,168,0.03) 0%, transparent 50%),
  radial-gradient(circle at 80% 100%, rgba(96,165,250,0.03) 0%, transparent 50%);
background-attachment: fixed;
```

### V3 · Editorial Data

**Colors**
```
--paper:     #f6f2ea   /* page background — warm off-white */
--paper-2:   #efe9dd   /* nav / featured blocks */
--paper-3:   #e8e1d1   /* ticker band */
--ink:       #1a1614   /* primary text — warm near-black */
--ink-2:     #3a342e   /* body text */
--dim:       #7a726a
--dim-2:     #a49b90
--line:      #d9d0be
--line-2:    #c4b8a2
--accent:    #c8321f   /* FT-red — kickers, active state, price change */
--accent-dark:#8a1e10
--up:        #0a7a4a   /* muted green — printed-paper feel */
--down:      #c8321f
--gold:      #a8811a
```

**Paper texture (subtle):**
```css
background-image:
  repeating-linear-gradient(0deg, transparent 0px, transparent 2px,
                            rgba(0,0,0,0.008) 2px, rgba(0,0,0,0.008) 4px);
```

**Typography**
- Serif headlines: `'Fraunces', 'Georgia', serif` — variable optical size
  - Masthead: 56px/900/−0.03em/line-height 0.9
  - Hero head: 44px/700/1.05/−0.02em (italic accent via `<em>`)
  - Section title: 28px/700/−0.02em
  - Gift-card feature title: 32px/700
  - Card title: 16–22px/600
- Body sans: `'Inter'` — 13–15px
- Mono: `'JetBrains Mono'` — all numbers, kickers (10–11px, letter-spacing 0.15em)
- Kicker style: mono / 10–11px / 700 / accent color / letter-spacing 0.15em

**Spacing / Borders**
- No border-radius anywhere (or 0). Editorial = sharp corners.
- Table dividers: `border-bottom: 1px dotted var(--line-2)` (dotted!) — signature editorial touch
- Section header: 2px solid ink underline
- Card hover: `border-color: var(--ink); box-shadow: 2px 2px 0 var(--ink)` — hard offset shadow

---

## Interactions & Behavior

### Ticker strip (all variants)
- CSS-only infinite scroll: content duplicated 2× inside a `.track`, animated with `translateX(0)` → `translateX(-50%)` over 80–100 seconds linear infinite.
- On hover: pause animation (optional enhancement — not currently in prototype).
- Production: replace with a real WebSocket subscription; on price update, flash the cell background (green/red) for 300ms and update value + `+/−%` sign.

### Category tabs
- Click switches `.active` class. In production, this should filter the visible sections client-side (or lazy-load per-category panels). No route change; use a URL hash (`#coin`, `#stock`) for shareable deep-links + browser back button support.

### Chart block
- Timeframe selector (1H / 4H / 1D / 1W / 1M / ALL): triggers refetch + rerender.
- V1: candlestick. V2: gradient area with end-of-series pulse dot. V3: single-stroke line with diagonal-hatch fill (via SVG `<pattern>`).
- Recommendation: **Lightweight Charts** (TradingView OSS) for V1/V2 fidelity; **Recharts** or a custom SVG for V3's editorial simplicity.

### Live/status indicators
- Small pulse dot next to "LIVE" / "SESSION LIVE": `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }` over 2s infinite.
- Clock (V1 top-right): updates every 1s via `setInterval`, format `HH:MM:SS KST`.

### Sidebar / mover-row hover
- V1 side-item: `background: var(--bg-2)` on hover, active state adds 2px left border in accent color.
- V2 mover row: full-width `background: var(--bg-2)` on hover, cursor pointer.
- V3 gift-card: `border-color: var(--ink) + box-shadow: 2px 2px 0 var(--ink)` — hard offset "stamp" effect.

### Keyboard shortcuts (index.html shell only)
- `←` / `→` — cycle V1/V2/V3
- `1` / `2` / `3` — jump to specific variant
- LocalStorage key `modoosise_variant` persists last selection

### Color-coded change indicators (universal rule)
- Positive: `up` class → green (`#3ddc84` / `#00e5a8` / `#0a7a4a` per variant)
- Negative: `down` class → red (`#ff4d4f` / `#ff5c7c` / `#c8321f` per variant)
- Zero / unchanged: default dim gray, no arrow prefix
- Prefix arrows: `▲` for up, `▼` for down (Unicode triangles, not icons)

---

## State Management

Recommended shape (framework-agnostic):

```ts
type MarketSnapshot = {
  updatedAt: string;              // ISO timestamp
  crypto: TickerRow[];            // BTC, ETH, SOL, XRP, DOGE, ADA, TRX, DOT
  equity: { kospi: IndexRow; kosdaq: IndexRow; topStocks: TickerRow[] };
  fx: FxRow[];                    // USD, JPY(100), EUR, CNY, GBP, CHF, AUD
  metals: MetalRow[];             // Gold 999.9, 24K, 18K, Silver, Platinum, Palladium
  energy: { national: FuelRow; regions: FuelRow[]; wti: number };
  macro: { baseRate: number; cd91: number; ktb3y: number; ktb10y: number; corp: number };
  giftcards: GiftCardRow[];       // 8 tracked cards
  realestate: { seoulAvg: number; gangnam: number; volume: number };
  lotto: { round: number; drawDate: string; numbers: number[]; bonus: number; jackpot: number; winners: number };
  news: NewsItem[];
};

type TickerRow    = { sym: string; name: string; price: number; change24hPct: number; volumeKrw: number };
type IndexRow     = { value: number; changePts: number; changePct: number };
type FxRow        = { code: string; flag: string; value: number; changePct: number };
type MetalRow     = { name: string; krwPerGram: number; changePct: number; usdEquiv?: number };
type FuelRow      = { region: string; gasoline: number; diesel: number; lpg: number };
type GiftCardRow  = { name: string; faceValueKrw: number; buyPrice: number; sellPrice: number; matchRatePct: number; deltaDaily: number };
type NewsItem     = { id: string; category: 'CRYPTO'|'EQUITY'|'MACRO'|'ENERGY'|'GIFT'|'METAL'|'REAL_ESTATE'; title: string; source: string; publishedAt: string };
```

**Fetching pattern**
- Poll every 60s for most feeds; **WebSocket** for crypto (Upbit provides public WS) and ticker strip.
- Cache-and-revalidate via TanStack Query with 30–60s `staleTime`.
- On update: flash the affected cell background 300ms; update spark path.

**Active-state stores**
- `activeCategory: string` (default `"overview"`) — driven by tab clicks + URL hash.
- `chartTimeframe: '1H'|'4H'|'1D'|'1W'|'1M'|'ALL'` (default `'1D'`).
- `activeVariant` — only in `index.html` shell; not needed in production.

---

## Data Sources (from live site)

| Category | Source |
|---|---|
| Crypto | **Upbit** (KRW pairs, public REST + WS) |
| Stocks | **KRX** / **Yahoo Finance** |
| FX | **한국은행** (Bank of Korea) / bank matrices |
| Metals | **KRX gold market** / **LBMA** for USD equivalent |
| Energy | **오피넷 (Opinet)** — nationwide gas station prices |
| Macro | **한국은행** — base rate, CD, KTB yields |
| Gift cards | Aggregated from broker sites (site's own scraper) |
| Real estate | **국토교통부** (MOLIT) real transaction API |
| Lotto | **동행복권** (Dhlottery) |
| News | Site's own aggregator + wire feeds |

Credit line must appear in footer of every variant (already in the mocks).

---

## Responsive Behavior

Current prototypes are **desktop-first, 1440px viewport**. Responsive rules not fully spec'd — recommended breakpoints when implementing:

- **≥1280px:** as designed
- **1024–1279px:** V1 hide right panel (collapse to icon-triggered drawer); V2 hero drops to 4-col; V3 hero drops to 2-col + sidebars stack
- **768–1023px (tablet):** V1 becomes single column with collapsible sections; V2/V3 all cards stack to 1–2 col
- **<768px (mobile):**
  - Ticker + top brand always visible (sticky)
  - Category tabs become horizontal scroll pills
  - All grids collapse to single column
  - Gift-card cards remain 1-per-row, chart height reduces to 200px
  - Consider bottom-sheet UX for opening a specific category detail

Note: the live site emphasizes mobile use; the client should confirm mobile fidelity requirements before implementation.

---

## Accessibility Notes

- **Color contrast:** All three variants tested to WCAG AA for body text against their respective backgrounds. Up/down colors on dim backgrounds may need slight bump for AAA — verify.
- **Live regions:** Ticker + KPI values should be marked `aria-live="polite"` with sensible batching (don't announce every price tick — use a summary every 30s).
- **Keyboard:** All tabs, movers, and cards must be `<button>` or `<a>` with visible focus rings. Chart timeframe selector should be a radiogroup.
- **Motion:** Respect `prefers-reduced-motion` — pause ticker scroll, disable pulse animations.
- **Localization:** All copy is Korean; number formatting uses Korean grouping (comma every 3 digits). If ever internationalized, isolate strings + use `Intl.NumberFormat('ko-KR')`.

---

## Assets

- **Fonts** (all via Google Fonts / jsDelivr CDN):
  - JetBrains Mono (400, 500, 600, 700)
  - Inter (400, 500, 600, 700, 800)
  - Pretendard Variable (via jsDelivr — `orioncactus/pretendard@v1.3.9`)
  - Fraunces (variable, opsz 9–144, weights 400–900)
- **Icons:** None imported — inline SVG for search icon and arrow (V2). All directional indicators are Unicode triangles (`▲` `▼`).
- **Flags:** Native emoji (🇺🇸 🇯🇵 🇪🇺 🇨🇳 🇬🇧 🇨🇭 🇦🇺). Consider swapping for a proper flag icon set for consistency across OS.
- **Charts:** All charts are inline SVG generated by small JS routines — replace with real chart library in production.
- **No image assets used** — pure CSS + SVG throughout.

---

## Files

| File | Role |
|---|---|
| `index.html` | Review shell — top-tab switcher wrapping the three variants in iframes. Not shipped. |
| `v1-terminal.html` | V1 · Terminal Classic (Bloomberg-style dark, amber/cyan). Complete standalone page. |
| `v2-modern.html` | V2 · Modern Trading (navy dark, mint green). Complete standalone page. |
| `v3-editorial.html` | V3 · Editorial Data (paper, serif, FT-red). Complete standalone page. |

Each variant is self-contained: single HTML, inline `<style>`, inline `<script>` for chart generation and clock. Fonts loaded via `<link>` tags at top of each file.

---

## Recommended Implementation Order

1. **Confirm variant with client** — the three directions are meant as A/B/C options; pick one before implementing.
2. **Set up design tokens** in the codebase's system (Tailwind config, CSS vars, or design-system tokens) using the token block above.
3. **Build the shared shell** — top nav, ticker strip, category tabs, footer.
4. **Wire real data** for crypto (Upbit WS) first — it's the most-visible, fastest-moving feed.
5. **Build the gift-card desk section** — this is the user's stated priority.
6. **Fill in remaining sections** in order of KPI hero → chart → movers → FX/metals/energy → news/lotto/realestate.
7. **Add responsive breakpoints** per the guidance above.
8. **Accessibility + reduced-motion pass** as final QA.
