import "opentype.js";

// @types/opentype.js still describes 1.x; 2.x also accepts SVG output options.
declare module "opentype.js" {
  interface Path {
    toPathData(options: {
      decimalPlaces?: number;
      optimize?: boolean;
      flipY?: boolean;
    }): string;
  }
}
