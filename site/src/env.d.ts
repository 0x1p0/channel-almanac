/// <reference types="astro/client" />

// The extension's lib.js, exposed by the almanac-lib Vite plugin in astro.config.mjs.
declare module 'virtual:almanac-lib' {
  type Video = unknown[];
  type Filter = { from?: string; to?: string; otd?: boolean; first?: boolean };
  type View = { lo: Float64Array; hi: Float64Array; est: Float64Array };
  const CDF: {
    parseDateQuery(text: string, now?: Date, opts?: object): Filter | null;
    rangeTitle(f: Filter, now?: Date): { title: string; sub: string };
    view(videos: Video[]): View;
    probes(videos: Video[], f: object, vw: View, max: number): number[];
    select(videos: Video[], f: object, vw: View): { idx: number[]; pending: number };
    nearest(videos: Video[], f: object, vw: View): { before: { i: number; t: number } | null; after: { i: number; t: number } | null };
  };
  export default CDF;
}
