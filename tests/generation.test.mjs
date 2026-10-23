import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { convertV4MiniflareOptions, Miniflare, Response } from "miniflare";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".wrangler/generation-validation");
const config = JSON.parse(await readFile(resolve(root, "wrangler.jsonc"), "utf8"));
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const pending = new Map();
const results = [];
let worker;
let nextId = 0;
let failNextUpload = false;

before(async () => {
  await mkdir(output, { recursive: true });
  const files = await readdir(resolve(root, "dist"));
  worker = new Miniflare(convertV4MiniflareOptions({
    name: config.name,
    compatibilityDate: config.compatibility_date,
    cf: false,
    modulesRoot: resolve(root, "dist"),
    modules: [
      { type: "ESModule", path: resolve(root, "dist/index.js") },
      ...files.filter((file) => file.endsWith(".wasm")).map((file) => ({ type: "CompiledWasm", path: resolve(root, "dist", file) })),
    ],
    bindings: { DISCORD_PUBLIC_KEY: publicKeyHex },
    assets: { ...config.assets, directory: resolve(root, config.assets.directory), routerConfig: { has_user_worker: true } },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (url.hostname === "discord.com" && request.method === "PATCH") {
        const token = url.pathname.split("/")[5];
        const form = await request.formData();
        const payload = JSON.parse(form.get("payload_json"));
        const file = form.get("files[0]");
        if (file && failNextUpload) {
          failNextUpload = false;
          return new Response("Upload failed", { status: 500 });
        }
        pending.get(token)?.resolve({ payload, file: file && Buffer.from(await file.arrayBuffer()), filename: file?.name });
        return Response.json({ id: "test-response" });
      }
      throw new Error(`Unexpected outbound request: ${request.method} ${url.origin}${url.pathname}`);
    },
  }));
  await worker.ready;
});

after(async () => {
  await worker?.dispose();
  await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
  if (results.length) {
    const thumbs = await Promise.all(results.map(async (result, index) => ({
      input: await sharp(resolve(output, `${result.name}.png`)).resize(540, 251).png().toBuffer(),
      left: (index % 2) * 540,
      top: Math.floor(index / 2) * 251,
    })));
    await sharp({ create: { width: 1080, height: Math.ceil(thumbs.length / 2) * 251, channels: 3, background: "white" } })
      .composite(thumbs).png().toFile(resolve(output, "contact-sheet.png"));
  }
});

function signedBody(interaction, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = typeof interaction === "string" ? interaction : JSON.stringify(interaction);
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-timestamp": timestamp,
      "x-signature-ed25519": sign(null, Buffer.from(timestamp + body), privateKey).toString("hex"),
    },
    body,
  };
}

function command(content = "それってあなたの\\n感想ですよね？") {
  const id = String(++nextId);
  return {
    id, application_id: "300", token: `test-${id}`, type: 2, version: 1,
    attachment_size_limit: 20 * 1024 * 1024,
    data: { id: "100", name: "generate_robot", type: 1, options: content === undefined ? [] : [{ type: 3, name: "content", value: content }] },
  };
}

async function invoke(interaction) {
  const deferred = Promise.withResolvers();
  pending.set(interaction.token, deferred);
  try {
    const start = performance.now();
    const response = await worker.dispatchFetch("https://bot.test/interactions", signedBody(interaction));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { type: 5 });
    const ackMs = performance.now() - start;
    assert.ok(ackMs < 3000, `Initial response took ${ackMs}ms`);
    const reply = await Promise.race([deferred.promise, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("No reply within 25 seconds")), 25_000);
      timer.unref();
    })]);
    return { ...reply, milliseconds: Math.round(performance.now() - start), ackMs: Math.round(ackMs) };
  } finally {
    pending.delete(interaction.token);
  }
}

async function generate(name, content) {
  const reply = await invoke(command(content));
  assert.ok(reply.file, `Generation failed: ${JSON.stringify(reply.payload)}`);
  assert.equal(reply.filename, "hapyou-robot.png");
  assert.deepEqual(reply.payload.allowed_mentions, { parse: [] });
  assert.deepEqual(reply.payload.attachments, [{ id: 0, filename: "hapyou-robot.png" }]);
  const metadata = await sharp(reply.file).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1802);
  assert.equal(metadata.height, 836);
  const result = { name, milliseconds: reply.milliseconds, ackMs: reply.ackMs, bytes: reply.file.length };
  results.push(result);
  await writeFile(resolve(output, `${name}.png`), reply.file);
  console.log(JSON.stringify(result));
  return reply.file;
}

async function assertTextInsideBalloon(buffer, threshold = 80) {
  const pixels = await sharp(buffer).removeAlpha().raw().toBuffer();
  const base = await sharp(resolve(root, "public/img/robot.png")).flatten({ background: "white" }).removeAlpha().raw().toBuffer();
  let changedInside = 0;
  let changedOutside = 0;
  for (let y = 0; y < 836; y++) for (let x = 0; x < 1802; x++) {
    const offset = (y * 1802 + x) * 3;
    const isDark = pixels[offset] < threshold && pixels[offset + 1] < threshold && pixels[offset + 2] < threshold;
    const wasLight = base[offset] > 200 && base[offset + 1] > 200 && base[offset + 2] > 200;
    if (isDark && wasLight) {
      if (x >= 800 && x < 1700 && y >= 150 && y < 550) changedInside++;
      else changedOutside++;
    }
  }
  assert.ok(changedInside > 100, "Balloon text is missing");
  assert.equal(changedOutside, 0, "Text escaped the balloon");
}

test("health and route handling", async () => {
  assert.equal((await worker.dispatchFetch("https://bot.test/")).status, 200);
  assert.equal((await worker.dispatchFetch("https://bot.test/unknown")).status, 404);
  assert.equal((await worker.dispatchFetch("https://bot.test/interactions")).status, 405);
  assert.equal((await worker.dispatchFetch("https://bot.test/img/robot.png")).status, 404);
});

test("signed PING succeeds and invalid, absent or stale signatures fail", async () => {
  const ping = await worker.dispatchFetch("https://bot.test/interactions", signedBody({ type: 1 }));
  assert.deepEqual(await ping.json(), { type: 1 });
  const bad = signedBody({ type: 1 });
  bad.headers["x-signature-ed25519"] = "0".repeat(128);
  for (const body of [bad, { method: "POST", body: "{}" }, signedBody({ type: 1 }, "1")]) {
    assert.equal((await worker.dispatchFetch("https://bot.test/interactions", body)).status, 401);
  }
});

test("malformed JSON and oversized bodies fail", async () => {
  assert.equal((await worker.dispatchFetch("https://bot.test/interactions", signedBody("{"))).status, 400);
  assert.equal((await worker.dispatchFetch("https://bot.test/interactions", signedBody(" ".repeat(65537)))).status, 413);
});

test("Japanese multiline text renders inside the balloon", { timeout: 30_000 }, async () => {
  await assertTextInsideBalloon(await generate("japanese", "それってあなたの\\n感想ですよね？"));
});

test("literal and actual newlines have identical output", { timeout: 30_000 }, async () => {
  assert.deepEqual(await generate("literal-newlines", "正論\\nロボット"), await generate("actual-newlines", "正論\nロボット"));
});

test("long text and special characters render inside the balloon", { timeout: 30_000 }, async () => {
  await assertTextInsideBalloon(await generate("long-text", "日本語とEnglishの長いテキスト".repeat(25) + "\\nA < B & C > D \" '"), 200);
});

test("XML special characters remain visible", { timeout: 30_000 }, async () => {
  await assertTextInsideBalloon(await generate("special-characters", "A < B & C > D\\n記号も描画できます"));
});

test("40 lines remain inside the balloon", { timeout: 30_000 }, async () => {
  await assertTextInsideBalloon(await generate("forty-lines", Array.from({ length: 40 }, (_, i) => `${i + 1}行目の正論です`).join("\\n")));
});

test("concurrent requests keep text separate", { timeout: 30_000 }, async () => {
  const [a, b] = await Promise.all([generate("concurrent-one", "同時生成その一"), generate("concurrent-two", "同時生成その二")]);
  assert.notDeepEqual(a, b);
});

test("invalid content and unknown commands get immediate private errors", async () => {
  for (const content of ["", "  ", "あ".repeat(1001), Array(41).fill("行").join("\\n"), null]) {
    const interaction = command(content);
    if (content === null) interaction.data.options = [];
    const response = await worker.dispatchFetch("https://bot.test/interactions", signedBody(interaction));
    const body = await response.json();
    assert.equal(body.type, 4);
    assert.equal(body.data.flags, 64);
  }
  const interaction = command();
  interaction.data.name = "other_command";
  const response = await worker.dispatchFetch("https://bot.test/interactions", signedBody(interaction));
  assert.match((await response.json()).data.content, /見つかりません/);
});

test("upload failure and attachment size limit update the deferred reply with an error", { timeout: 30_000 }, async () => {
  failNextUpload = true;
  const failed = await invoke(command());
  assert.equal(failed.file, null);
  assert.match(failed.payload.content, /失敗/);
  const interaction = command();
  interaction.attachment_size_limit = 1;
  const limited = await invoke(interaction);
  assert.equal(limited.file, null);
  assert.match(limited.payload.content, /失敗/);
});
