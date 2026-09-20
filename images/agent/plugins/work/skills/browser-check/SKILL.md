---
name: browser-check
description: Load when the session has browser tools (browser_navigate, browser_snapshot) and the work or the review concerns something a user sees. How to start the app inside the sandbox, drive it with the Playwright tools, check the acceptance criteria and attach the evidence.
---

# Checking the work in a browser

1. Start the app's dev server from /work/repo in the background, bound to 127.0.0.1, or to 0.0.0.0
   when the briefing names a preview port; keep its pid (`server_pid=$!`). Wait for its ready line
   and note the port.
2. `browser_navigate` to http://127.0.0.1:<port>/<path>. Read state with `browser_snapshot`, the
   accessibility tree, which is cheaper and more exact than a screenshot; act through the refs it
   lists with `browser_click`, `browser_type` and `browser_fill_form`.
3. Check the acceptance criteria in the browser one at a time, and read `browser_console_messages`
   for errors after each step. Do one pass with the keyboard alone: Tab order, Enter and Escape,
   visible focus.
4. Take `browser_take_screenshot` only for evidence the reviewer or the human needs. Files land in
   /tmp/browser; copy the ones that belong in the repository into the repository and commit them
   with the change. Name them in your report or your findings.
5. Close the pages and stop the dev server before you report, so the check command runs on a quiet
   machine. Stop it with the pid you kept (`kill "$server_pid"`), never with `pkill -f <pattern>`:
   the pattern also matches the shell running your own command, which then dies with exit 144 and
   the rest of the line never runs.
