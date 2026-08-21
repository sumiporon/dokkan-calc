# Enemy data source evaluation

Research date: 2026-08-21 (JST)

This is a design evaluation only. No source was switched and no enemy data was regenerated.

## Required fields

The calculator needs more than a boss name and one ATK number. A useful source must cover, or allow us to derive and verify, event/stage IDs, enemy identity, type and Super/Extreme class, normal ATK, Super Attack damage, DEF, attack frequency/pattern, turn and HP conditions, post-Super changes, critical-related effects, and stage grouping.

## Findings by source

### 1. DokkanInfo

Coverage is currently the best match for this calculator. Live stage pages display HP, ATK, DEF, damage reduction, enemy type/class, Super Attack damage and probability, cooldown/slot information, skill descriptions, and many hidden debug IDs. Event and stage IDs are present in URLs and page data.

The current Playwright approach is not technically necessary:

- `/events/challenge` server-embeds a JSON array in the `v-bind:eventjson` attribute. It includes stable event IDs, names, image paths, and timestamps.
- Event and stage pages are server-rendered. A normal HTTP GET with a browser User-Agent returned the relevant content in this investigation.
- Stage pages include enemy card objects (including IDs and element codes), visible numeric data, and enemy-skill/debug IDs.
- No public general event/enemy API was found in the site's current front-end code. A small number of APIs exist for cards and selected tools, not the challenge-stage data required here.

A stable application-side identity can therefore be built from `event ID + stage ID + phase/order + enemy card ID`, rather than names alone. This is substantially safer than the current name-based merge behavior.

Limits and risks:

- Some stage detail is still server-rendered HTML rather than a documented JSON API, so label/DOM changes can break extraction.
- Cloudflare is present. Simple requests worked during this investigation, but unattended GitHub Actions availability is not guaranteed.
- The current `robots.txt` allows generic access and sets `use=reference`, but explicitly disallows several named AI crawlers. This does not override the stricter Terms of Use or grant permission for a scheduled scraper.
- The current Terms of Use grant personal non-commercial access but prohibit automated agents/scripts that generate automated searches, requests, or queries. This is the largest blocker to a scheduled scraper. Do not treat technical accessibility as permission.
- DokkanInfo does not document the provenance or accuracy guarantees for each field. Results still need fixtures and manual spot checks.

Sources inspected:

- https://jpnja.dokkaninfo.com/events/challenge
- https://jpnja.dokkaninfo.com/events/challenge/1749
- https://jpnja.dokkaninfo.com/events/challenge/1749/17490015
- https://jpnja.dokkaninfo.com/build/assets/app.e5605779.js
- https://jpnja.dokkaninfo.com/terms
- https://jpnja.dokkaninfo.com/robots.txt
- Local cached pages and all current scraper/extension parsers

### 2. dokkan.wiki

`dokkan.wiki` has a useful structured card API (`/api/cards/<id>`) and timely game-news pages. It is suitable for player-card kits and release/news cross-checks. No equivalent documented enemy-event API covering ATK/DEF/AI/stage detail was found. Direct command-line requests also encountered Cloudflare during this investigation.

Conclusion: useful as a secondary release/name cross-check, not a replacement enemy-data source.

### 3. Fandom and other community wikis/databases

Community wiki pages can contain event explanations, boss types, and manually interpreted special conditions. MediaWiki-based sources can be queried through a structured API, but the underlying event data is human-authored prose/templates, coverage is uneven, and new-event timing depends on volunteers. Other Japanese databases similarly expose human-facing HTML and did not show a complete, stable enemy API in this research.

Conclusion: valuable for manual validation and ambiguous mechanics, but too incomplete and schema-unstable to be the sole automated source. Their individual licences/attribution and bot policies must be checked before reuse.

### 4. Decrypted game database / reverse-engineering projects

The game database is closest to the original source and exposes structured tables such as `enemy_ai_conditions`, `enemy_skills`, `quests`, and Z-Battle enemy stats. It can represent HP ranges, per-turn limits, attack rates, skill timing, probability, values, and stable IDs more directly than a web page.

However, no current, maintained, openly licensed public dataset/API containing the full up-to-date JP enemy/stage data was found. Existing projects generally provide schemas/decryption tools, require obtaining the current encrypted game database, omit the large database itself, or focus on player cards. Stage scripts/assets may also be needed in addition to SQLite. Automating client authentication/decryption would be much more complex and introduces game terms/security/legal uncertainty.

Conclusion: technically the richest verification source, but not an appropriate primary pipeline for this personal app unless a legitimate, maintained data feed becomes available.

Representative technical references:

- https://karyonixx.github.io/kxdokkan-wiki/information/database-breakdown.html
- https://github.com/bensnilloc/Dragonball-Z-Dokkan-Battle-Database-Decryptor
- https://github.com/itZcat17/CapsuleOS

### 5. Public Dokkan APIs and GitHub datasets

The public APIs/datasets found in this investigation mainly contain player-character/card information or old wiki scrapes. They do not provide the required current event enemy ATK/DEF/AI/stage model. Depending on one would lose important fields already available from DokkanInfo.

## Comparison summary

| Candidate | Required enemy fields | Structured form | Freshness | Automation stability | Policy/maintenance risk |
| --- | --- | --- | --- | --- | --- |
| DokkanInfo current pages | High | Event JSON + server HTML + stable IDs | High | Medium technically; current Playwright is low | High for unattended automation under current Terms |
| dokkan.wiki | Low for enemies, high for cards/news | Card JSON API | High for cards/news | Medium; Cloudflare observed | Enemy coverage is insufficient |
| Community wikis/databases | Medium but uneven | API to prose/templates or HTML | Variable | Low to medium | Attribution/bot policy and manual lag |
| Game DB extraction | Potentially highest | SQLite + scripts/assets | Highest when current | Low initially; complex update chain | Access, terms, decryption, and maintenance risk |
| Public GitHub/APIs found | Low for event enemies | Usually JSON/CSV | Often stale or card-only | Medium | Missing required fields |

## Recommendation: B

Choose **B: continue using DokkanInfo, but change how data is acquired**. This is the best balance for a personal tool today, with one major condition: do not resume unattended scheduled requests unless permission/policy is resolved.

If designing the app now, the proposed pipeline would be:

1. Keep the currently verified enemy dataset as the production baseline.
2. Separate enemy data into versioned JSON with a documented schema and source metadata.
3. Build a provider-neutral importer around stable IDs.
4. For a reviewed/user-initiated DokkanInfo import, use direct HTTP and parse embedded `eventjson` plus server-rendered stage data; do not launch a browser or infer values from visual layout.
5. Parse raw fields first and derive attack variants in a separate, tested calculation step.
6. Keep a small, committed manual-override file for ambiguous critical/condition mechanics, with source notes.
7. Validate schema, record counts, duplicate IDs, representative fixtures, and semantic diffs. Generate a preview report; never write directly into the public app.
8. Cross-check new/ambiguous events against game announcements or a community wiki. Treat these as validation, not an automatic merge source.
9. Publish enemy data and application code in separate, deliberate commits only after review.

Why not A: it preserves the brittle Playwright/name-based pipeline and its data-loss bugs.

Why not C: no alternative found can replace DokkanInfo without losing important enemy fields or introducing a much more complex and uncertain game-DB extraction pipeline.

Why not D for now: a multi-source automatic merger would be disproportionate for a personal tool and would create conflict-resolution problems before tests exist. A manual override and cross-check layer provides the useful part without creating a data integration platform.

This recommendation should be revisited if an openly licensed, maintained, structured enemy/stage dataset or documented API becomes available.
