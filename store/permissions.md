# Permission justifications (paste into the Chrome Web Store "Privacy practices" tab)

**storage**: Saves the user's profile, resume, answer bank, settings, tailored resumes and application tracker in the browser (chrome.storage.local). Nothing is sent to a server.

**unlimitedStorage**: Resume files (PDF/Word) and tailored resumes are stored locally as files; together they can exceed the default 10 MB storage quota.

**activeTab**: Lets the user run "Fill this application" from the toolbar popup on the current tab when it is a site the extension doesn't match automatically. Access is temporary, to that tab only, and only after the user clicks the toolbar button.

**scripting**: (1) With activeTab: injects the form-filling script into the current tab when the user clicks "Fill this application" in the popup. (2) For sites the user has explicitly allowed (see optional host permissions): registers the same bundled content script for that one origin with chrome.scripting.registerContentScripts, so the Fill button appears there automatically. All code is packaged in the extension; no remote code.

**declarativeNetRequestWithHostAccess**: Ollama (the local AI app) rejects requests whose Origin header is a browser extension unless the user changes a system setting in a terminal. The extension adds one rule that removes the Origin header only on its own requests (initiatorDomains = this extension's ID) to the local Ollama address (127.0.0.1:11434 / localhost:11434). It does not affect any website's requests, does not block or redirect anything, and does not read request contents. This is what makes setup possible without a terminal.

**system.memory**: Reads the total amount of memory once during setup to recommend an AI model that will run well (a small model for 8 GB, a larger one for 16 GB or more). The value isn't stored or sent anywhere.

**Host permission http://127.0.0.1/\* and http://localhost/\***: To talk to Ollama, which runs on the user's own computer (default http://127.0.0.1:11434): check that it's running, download the AI model, and send it the text it needs to answer form questions and tailor the resume. Also required for the Origin rule above.

**Host permissions for job sites (https://\*.greenhouse.io/\*, https://jobs.lever.co/\*, https://jobs.ashbyhq.com/\*, https://\*.myworkdayjobs.com/\*, https://\*.myworkday.com/\*, https://\*.myworkdaysite.com/\*, https://www.linkedin.com/\*)**: The content scripts run on these application platforms to detect application forms, show the "Fill application" button and chat panel, fill fields from the user's profile, attach the user's resume, and notice when the user presses Submit (to update the tracker). On LinkedIn it only acts inside the Easy Apply window. It never presses Submit, Next or Apply.

**Optional host permissions https://\*/\* and http://\*/\* (optional_host_permissions)**: Never granted at install or update. When the user clicks "Allow on this site" in the popup ("Use on <site> automatically?"), the extension calls chrome.permissions.request for that single origin and Chrome shows its own prompt. Nothing is requested in the background and never for all sites at once. Allowed sites are listed in Settings → Sites with a Remove button (chrome.permissions.remove). On an allowed site the extension detects a job application form, shows the Fill button and fills from the user's profile. It never presses Submit, Next or Apply. Site access is granted only by the user, per site.

**Content script in the page's main world (content/netwatch.js, ATS hosts only)**: A read-only observer of the page's own fetch/XHR calls, used only to notice that the user's application was submitted (or rejected by the server) so the tracker can be updated. It never changes, blocks or sends requests.
