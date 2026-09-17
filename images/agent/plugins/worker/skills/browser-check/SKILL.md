---
name: browser-check
description: Load when the session has browser tools (browser_navigate, browser_snapshot) and the work changes something a user sees. How to start the app inside the sandbox, look at it with the Playwright tools and attach the evidence.
---

# Checking the work in a browser

1. Start the app's dev server from /work/repo in the background, bound to 127.0.0.1, or to 0.0.0.0
   when the briefing names a preview port. Wait for its ready line and note the port.
2. `browser_navigate` to http://127.0.0.1:<port>/<path>. Read state with `browser_snapshot`, the
   accessibility tree, which is cheaper and more exact than a screenshot; act through the refs it
   lists with `browser_click`, `browser_type` and `browser_fill_form`.
3. Check the acceptance criteria in the browser one at a time, and read `browser_console_messages`
   for errors after each step.
4. Take `browser_take_screenshot` only for evidence the reviewer or the human needs. Files land in
   /tmp/browser; copy the ones that belong in the repository into the repository and commit them
   with the change. Name them in your report.
5. Close the pages and stop the dev server before you report, so the check command runs on a quiet
   machine.
