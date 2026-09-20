export const APP_LOG = "/tmp/ho-app.log";

export type StepReport = {
  name: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  ms: number;
  tail: string;
};

export type ApplicationReport = {
  command: string;
  url: string | null;
  ready: boolean;
  ms: number;
  tail: string;
};

export type EnvironmentReport = { steps: StepReport[]; application: ApplicationReport | null };
