// "Rulli" icon: a bike on an indoor trainer, drawn like the Tabler outline icons (same props: size, stroke…).
import { createReactComponent } from "@tabler/icons-react";

export const IconTrainer = createReactComponent("outline", "trainer", "Trainer", [
  ["path", { d: "M5 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", key: "front" }],
  ["path", { d: "M19 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", key: "rear" }],
  ["path", { d: "M12 16v-4l-3 -3l5 -4l2 3h3", key: "frame" }],
  ["path", { d: "M17 3m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", key: "head" }],
  ["path", { d: "M2 21h20", key: "floor" }],
  ["path", { d: "M16.5 21l2.5 -3l2.5 3", key: "stand" }],
]);
