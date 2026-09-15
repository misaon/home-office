// Czech for the first-run checklist.
import type { enSetup } from "./en-setup.ts";

export const csSetup: typeof enSetup = {
  setup: {
    done: "hotovo",
    problem: "problém",
    intro: "Tři věci rozhýbou kancelář.",
    dockerIntro:
      "Zaměstnanci běží v izolovaných Alpine kontejnerech. Nainstalujte a spusťte Docker Desktop (nebo jiný Docker Engine) a zkontrolujte znovu.",
    dockerOk: "Docker {{version}}, API {{api}}, {{os}}/{{arch}}",
    dockerOld: "Docker API {{api}} je příliš staré; potřeba je {{min}} nebo novější",
    imagesIntro:
      "Image zaměstnance obsahuje Claude Code, git, RTK, headless Chromium a browser MCP servery. První build všechno stahuje a trvá několik minut; další využijí cache.",
    imagesWaiting: "čekám na Docker",
    imagesNoContexts: "tento build neobsahuje build kontexty pro image",
    imagesMissing: "chybí: {{refs}}",
    imagesStale: "neaktuální: {{refs}}",
    tokenIntro:
      "Zaměstnanci se přihlašují vaším předplatným Claude. V terminálu spusťte <code>claude setup-token</code>, dokončete přihlášení v prohlížeči a vložte vypsaný token. Uloží se do úložiště přihlašovacích údajů tohoto stroje (Keychain, libsecret nebo Credential Manager) a předá se jedině procesu <code>claude</code> v sandboxu.",
    tokenStored: "uloženo v nastaveném úložišti; jestli pořád platí, se pozná až při prvním sezení",
    tokenMissing: "token předplatného Claude ještě není",
    title: "Nastavte si kancelář",
    recheck: "Zkontrolovat znovu",
    skip: "Teď přeskočit",
    todo: "zbývá",
    docker: "Docker",
    checkAgain: "Zkontrolovat znovu",
    images: "Image zaměstnanců",
    buildImages: "Postavit image",
    building: "Stavím… {{seconds}} s",
    token: "Token předplatného Claude",
  },
};
