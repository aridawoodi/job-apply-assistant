# Share links (tagged)

Every link opens the same Chrome Web Store listing. The `utm_*` tags only tell the store's own listing
analytics where a visit came from. The extension collects nothing, and these tags carry no personal data.

Base (canonical) listing URL:
`https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen`

Naming: `utm_source` = where the link is placed, `utm_medium` = what kind of placement it is,
`utm_campaign` = `launch_v067` for one-off posts around this release, and `evergreen` for links that stay
up. For a later launch, change only the campaign (for example `launch_v070`).

| Channel | Link |
|---|---|
| Reddit | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=reddit&utm_medium=social&utm_campaign=launch_v067 |
| LinkedIn post | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=linkedin&utm_medium=social&utm_campaign=launch_v067 |
| LinkedIn profile (Featured / website link) | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=linkedin&utm_medium=profile&utm_campaign=evergreen |
| X | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=x&utm_medium=social&utm_campaign=launch_v067 |
| Product Hunt | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=producthunt&utm_medium=launch&utm_campaign=launch_v067 |
| Hacker News (Show HN) | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=hackernews&utm_medium=social&utm_campaign=show_hn |
| GitHub README | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=github&utm_medium=readme&utm_campaign=evergreen |
| Personal email signature | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=email&utm_medium=signature&utm_campaign=evergreen |
| Discord / communities | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=discord&utm_medium=community&utm_campaign=launch_v067 |
| YouTube description | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen?utm_source=youtube&utm_medium=video&utm_campaign=demo_video |
| In-extension: rating prompt (popup "Rate it") | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen/reviews?utm_source=extension&utm_medium=rating_prompt&utm_campaign=in_extension |
| In-extension: Settings footer ("Rate this extension") | https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen/reviews?utm_source=extension&utm_medium=options_footer&utm_campaign=in_extension |

The two in-extension links are already built into 0.6.7 (`lib/rating.js` and `options/options.html`). For
other communities (Slack groups, forums), keep `utm_medium=community` and set `utm_source` to the
community's short name, for example `utm_source=slack`.

## Where to read the results
Chrome Web Store Developer Dashboard → this item → **Analytics → Impressions**: store listing page views,
broken down by **source / medium / campaign** (the utm values above).
Compare that with **Installs** for the same dates to see which channels bring installs, not just visits.
