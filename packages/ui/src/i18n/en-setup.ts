// The first-run checklist's own words: Docker, the agent images and the token.
export const enSetup = {
  setup: {
    done: "done",
    problem: "problem",
    intro: "Three things make the office work.",
    dockerIntro:
      "Agents run in isolated Alpine containers. Install and start Docker Desktop (or another Docker Engine), then check again.",
    dockerOk: "Docker {{version}}, API {{api}}, {{os}}/{{arch}}",
    dockerOld: "Docker API {{api}} is too old; {{min}} or newer is required",
    imagesIntro:
      "The agent image bundles Claude Code, git, RTK, headless Chromium and the browser MCP servers. The first build downloads everything and takes a few minutes; later builds reuse cached layers.",
    imagesWaiting: "waiting for Docker",
    imagesNoContexts: "this build carries no image build contexts",
    imagesMissing: "missing: {{refs}}",
    imagesStale: "out of date: {{refs}}",
    tokenIntro:
      "Agents sign in with your Claude subscription. In a terminal run <code>claude setup-token</code>, finish the browser login it opens and paste the token it prints. It is stored in this machine’s credential store (Keychain, libsecret or Credential Manager) and only ever handed to the <code>claude</code> process inside a sandbox.",
    tokenStored:
      "stored in the configured secret store; the first session tells whether it still works",
    tokenMissing: "no Claude subscription token yet",
    title: "Set up your office",
    recheck: "Re-check",
    skip: "Skip for now",
    todo: "to do",
    docker: "Docker",
    checkAgain: "Check again",
    images: "Agent images",
    buildImages: "Build images",
    building: "Building… {{seconds}} s",
    token: "Claude subscription token",
  },
};
