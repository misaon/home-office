// Spike S2 webview: PixiJS 8 scene at 3x pixel scale + WebSocket round trip to the Bun main process.
import { Electroview } from "electrobun/view";
import { Application, Container, Graphics, Sprite } from "pixi.js";
import type { SpikeRPC } from "../rpc.ts";

const SPRITES = 60;
const SCALE = 3;

const rpc = Electroview.defineRPC<SpikeRPC>({
  maxRequestTime: 5000,
  handlers: { requests: {}, messages: {} },
});
const electrobun = new Electroview({ rpc });
const send = electrobun.rpc?.send;
const request = electrobun.rpc?.request;

const say = (text: string): void => {
  send?.log({ text });
};

async function measureRoundTrip(url: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(url);
    const t0 = performance.now();
    ws.addEventListener("open", () => {
      ws.send("ping");
    });
    ws.addEventListener("message", () => {
      resolve(performance.now() - t0);
      ws.close();
    });
    ws.addEventListener("error", () => {
      reject(new Error("websocket error"));
    });
  });
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: 960,
    height: 640,
    background: "#1b1b2f",
    resolution: 1,
    roundPixels: true,
    antialias: false,
  });
  document.querySelector("#stage")?.append(app.canvas);
  say(`renderer=${app.renderer.name}`);

  // A 16x16 "character" drawn once, turned into a texture and shared by all sprites.
  const shape = new Graphics()
    .rect(4, 0, 8, 6)
    .fill("#f4d6b4")
    .rect(2, 6, 12, 8)
    .fill("#3e7cb1")
    .rect(3, 14, 4, 2)
    .fill("#222")
    .rect(9, 14, 4, 2)
    .fill("#222");
  const texture = app.renderer.generateTexture(shape);
  const layer = new Container();
  app.stage.addChild(layer);
  const actors = Array.from({ length: SPRITES }, (_, i) => {
    const sprite = new Sprite(texture);
    sprite.scale.set(SCALE);
    sprite.x = (i * 37) % 900;
    sprite.y = (i * 53) % 580;
    layer.addChild(sprite);
    return { sprite, vx: ((i % 5) - 2) * 0.6 + 0.3, vy: ((i % 7) - 3) * 0.5 + 0.2 };
  });
  app.ticker.add(() => {
    for (const actor of actors) {
      actor.sprite.x = Math.round(actor.sprite.x + actor.vx);
      actor.sprite.y = Math.round(actor.sprite.y + actor.vy);
      if (actor.sprite.x < 0 || actor.sprite.x > 900) {
        actor.vx = -actor.vx;
      }
      if (actor.sprite.y < 0 || actor.sprite.y > 580) {
        actor.vy = -actor.vy;
      }
    }
  });

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 3000);
  });
  const fps = app.ticker.FPS;
  const info = await request?.getGatewayInfo({});
  const wsRoundTripMs = info === undefined ? -1 : await measureRoundTrip(info.url);
  send?.report({
    renderer: app.renderer.name,
    sprites: SPRITES,
    fps: Math.round(fps),
    wsRoundTripMs: Math.round(wsRoundTripMs * 100) / 100,
    userAgent: navigator.userAgent,
  });
}

try {
  await main();
} catch (error) {
  say(`error: ${error instanceof Error ? error.message : String(error)}`);
}
