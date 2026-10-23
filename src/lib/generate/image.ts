import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { parse, type Font } from "opentype.js";
import { readBytes } from "../http";

export type RobotInput = { content: string };

const WIDTH = 1802;
const HEIGHT = 836;
// Share only Wasm initialization; rendering and font data belong to each request.
let wasmReady: Promise<void> | undefined;

export async function generateRobot(input: RobotInput, assets: Fetcher): Promise<Uint8Array<ArrayBuffer>> {
  const [, fontBytes, robot] = await Promise.all([
    wasmReady ??= initWasm(resvgWasm),
    loadAsset(assets, "/font/GenJyuuGothic-Normal.ttf", 16 * 1024 * 1024),
    loadAsset(assets, "/img/robot.png", 8 * 1024 * 1024),
  ]);
  const font = parse(fontBytes.buffer, { lowMemory: true });
  const text = textPaths(font, input.content.split(/\\n|\r?\n/), { x: 800, y: 150, width: 900, height: 400 }, 90);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="white"/>${svgImage(robot, "image/png", 0, 0, WIDTH, HEIGHT)}${text}</svg>`;
  const renderer = new Resvg(svg, { font: { loadSystemFonts: false } });
  try {
    const rendered = renderer.render();
    try {
      return new Uint8Array(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}

function fittedFontSize(font: Font, lines: string[], size: number, width: number): number {
  const maxWidth = Math.max(...lines.map((line) => font.getAdvanceWidth(line, size)));
  return maxWidth > width ? size * width / maxWidth : size;
}

function textPaths(
  font: Font,
  lines: string[],
  box: { x: number; y: number; width: number; height: number },
  preferredSize: number,
): string {
  const size = Math.min(fittedFontSize(font, lines, preferredSize, box.width), box.height / lines.length);
  // Keep glyphs separate: a single long path can be truncated by the SVG rasterizer.
  const paths = lines.flatMap((line, index) => font.getPaths(line, -font.getAdvanceWidth(line, size) / 2, index * size, size));
  const bounds = paths.filter((path) => path.commands.length).map((path) => path.getBoundingBox());
  if (!bounds.length) return "";
  const left = Math.min(...bounds.map((bound) => bound.x1));
  const right = Math.max(...bounds.map((bound) => bound.x2));
  const top = Math.min(...bounds.map((bound) => bound.y1));
  const bottom = Math.max(...bounds.map((bound) => bound.y2));
  const scale = Math.min(1, box.width / (right - left || 1), box.height / (bottom - top || 1));
  const x = box.x + box.width / 2 - (left + right) / 2 * scale;
  const y = box.y + box.height / 2 - (top + bottom) / 2 * scale;
  // Preserve every glyph contour when serializing SVG.
  const content = paths.map((path) => `<path d="${path.toPathData({ decimalPlaces: 3, optimize: false, flipY: false })}"/>`).join("");
  return `<g fill="black" transform="translate(${x} ${y}) scale(${scale})">${content}</g>`;
}

function svgImage(bytes: Uint8Array, mime: string, x: number, y: number, width: number, height: number): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" xlink:href="data:${mime};base64,${btoa(binary)}"/>`;
}

async function loadAsset(assets: Fetcher, path: string, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const response = await assets.fetch(`https://assets.internal${path}`);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`素材を読み込めませんでした: ${path}`);
  }
  return readBytes(response, maxBytes);
}
