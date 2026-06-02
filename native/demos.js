// demos.js — curated list of real TempleOS demos to run in the browser,
// grouped by category. Paths are relative to the TempleOS repo root and are
// fetched live via the dev server's /repo/ mount.
export const DEMOS = [
  {
    label: "Console",
    items: [
      { name: "Print format codes", path: "Demo/Print.HC" },
      { name: "Sub-integer access", path: "Demo/SubIntAccess.HC" },
      { name: "Sub-switch", path: "Demo/SubSwitch.HC" },
      { name: "Null cases", path: "Demo/NullCase.HC" },
      { name: "Carry/branch", path: "Demo/Carry.HC" },
      { name: "Word search", path: "Demo/WordSearch.HC" },
      { name: "Phone-number words", path: "Demo/PhoneNumWords.HC" },
      { name: "Radix sort", path: "Demo/RadixSort.HC" },
    ],
  },
  {
    label: "Graphics",
    items: [
      { name: "Bouncing lines", path: "Demo/Graphics/Lines.HC" },
      { name: "Bounce", path: "Demo/Graphics/Bounce.HC" },
      { name: "Grid", path: "Demo/Graphics/Grid.HC" },
      { name: "Net of dots", path: "Demo/Graphics/NetOfDots.HC" },
      { name: "Random points", path: "Demo/RandDemo.HC" },
      { name: "Palette", path: "Demo/Graphics/Palette.HC" },
      { name: "Mouse demo", path: "Demo/Graphics/MouseDemo.HC" },
    ],
  },
  {
    label: "Sound",
    items: [
      { name: "Oh Great (song)", path: "Demo/Snd/OhGreat.HC" },
      { name: "ASCII Organ", path: "Demo/Snd/ASCIIOrgan.HC" },
      { name: "Water Fowl", path: "Demo/Snd/WaterFowl.HC" },
    ],
  },
  {
    label: "Interactive (mouse/touch)",
    items: [
      { name: "Paint (click & drag)", path: "holyc-wasm/examples/Paint.HC" },
      { name: "Mouse demo (real)", path: "Demo/Graphics/MouseDemo.HC" },
    ],
  },
  {
    label: "Built-in samples",
    items: [
      { name: "Hello / FizzBuzz", path: "holyc-wasm/examples/Hello.HC" },
      { name: "Mandelbrot (text)", path: "holyc-wasm/examples/Mandelbrot.HC" },
      { name: "Plasma (graphics)", path: "holyc-wasm/examples/Plasma.HC" },
      { name: "Sierpinski", path: "holyc-wasm/examples/Sierpinski.HC" },
      { name: "Scale (music)", path: "holyc-wasm/examples/Scale.HC" },
    ],
  },
];
