import type { enTokens } from "./en-tokens.ts";

export const csTokens: typeof enTokens = {
  tokens: {
    storedNote: "Uloženo v nastaveném secret store.",
    replaceAction: "Nahradit",
    claudeHint:
      "Převede vaše předplatné Claude na token, takže zaměstnanci na Claude Code nestojí nic nad rámec tarifu.",
    anthropicHint:
      "Klíč s platbou za použití pro zaměstnance na Claude Code s auth api-key a pro OpenCode s modely anthropic/….",
    githubHint:
      "Rezervováno do budoucna; GitHub intake a pull requesty dnes jdou přes vaše přihlášení v host gh.",
    stored: "uloženo",
    missing: "chybí",
    paste: "vložte token",
    replace: "vložte nový token, který ho nahradí",
    forget: "Zapomenout",
    claude: "Token předplatného Claude",
    anthropic: "Anthropic API klíč",
    openai: "OpenAI API klíč",
    openaiHint:
      "Klíč s platbou za použití pro zaměstnance na Codexu a OpenCode s modely openai/… — předplatné ChatGPT tu nefunguje.",
    gemini: "Gemini API klíč",
    geminiHint:
      "Klíč s platbou za použití pro zaměstnance na Gemini CLI a OpenCode s modely google/…, vytvoříte ho v Google AI Studio.",
    github: "GitHub token",
    forgotten: "{{name}} zapomenuto",
    getWith: "získáte příkazem",
    getAt: "vytvoříte na",
    copy: "Kopírovat",
    copied: "Příkaz zkopírován",
    open: "Otevřít",
  },
};
