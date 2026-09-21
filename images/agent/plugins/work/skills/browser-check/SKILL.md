---
name: browser-check
description: Load when the session has browser tools (browser_navigate, browser_snapshot) and the work or the review concerns something a user sees. How to start the app inside the sandbox, drive it with the Playwright tools, check the acceptance criteria and attach the evidence.
---

# Checking the work in a browser

1. When the briefing says the office started the application, use it at the URL it names. Otherwise
   start the app's dev server from /work/repo in the background, bound to 127.0.0.1, or to 0.0.0.0
   when the briefing names a preview port, in one command that also waits for it to answer with a
   bounded loop, never a fixed sleep:
   `(… &) ; for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:<port>/ && break; sleep 1; done`.
   Each command runs in a fresh shell, so start and readiness check go together. When the
   application needs a database or services the briefing does not give you, do not try to run it:
   serve the built static output, or a small page that includes the compiled assets and the markup
   you changed, and say so in every judgement it backs (fidelity `substitute`, blocker
   `not_prepared`). Keep the markup as it is: never replace a link, an asset or a request with a
   placeholder such as `#` and then call the result verified.
2. `browser_navigate` to http://127.0.0.1:<port>/<path>. Read state with `browser_snapshot`, the
   accessibility tree, which is cheaper and more exact than a screenshot; act through the refs it
   lists with `browser_click`, `browser_type` and `browser_fill_form`.
3. Check the acceptance criteria in the browser one at a time, and read `browser_console_messages`
   for errors after each step; an error the page did not have before your change is a defect, and
   one it already had goes into your report by name. Do one pass with the keyboard alone: Tab
   order, Enter and Escape, visible focus.
4. Take `browser_take_screenshot` of every change a user can see, and of any other evidence the
   reviewer or the human needs. Files land in /tmp/browser, which the office keeps after the
   session. Copy the screenshots of the result into /out/chat and name them in the call's `files`
   and, criterion by criterion, in that criterion's `files`, so the human sees them in the office
   chat next to the evidence they back; this holds for `ho_report`, `ho_review` and `ho_verify`
   alike. Copy the ones that belong in the repository into the repository and commit them with the
   change.
5. Leave the server running when you are done: the container ends with your session and the
   office's checks run in their own container, so stopping it only costs turns and `pkill -f` kills
   your own shell.
