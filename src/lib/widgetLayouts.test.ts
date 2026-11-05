// The Android widget layouts are inflated by the launcher as RemoteViews, which only allows a short list of views:
// anything else (a plain <View>, ConstraintLayout, Space…) makes the whole widget show "Can't load widget".
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../android/app/src/main/res/layout");
const ALLOWED = new Set([
  "FrameLayout", "LinearLayout", "RelativeLayout", "GridLayout", "Button", "ImageButton", "ImageView", "ProgressBar", "TextView",
  "TextClock", "Chronometer", "AnalogClock", "ViewFlipper", "ListView", "GridView", "StackView", "AdapterViewFlipper",
]);
const files = readdirSync(DIR).filter((f) => f.startsWith("widget_"));

describe("widget layouts", () => {
  it("has the three sizes", () => {
    expect(files.sort()).toEqual(["widget_large.xml", "widget_medium.xml", "widget_small.xml"]);
  });
  for (const f of files) {
    it(`${f} only uses views a widget may inflate`, () => {
      const tags = [...readFileSync(join(DIR, f), "utf8").matchAll(/<([A-Za-z.]+)[\s>/]/g)].map((m) => m[1]);
      expect(tags.filter((t) => !ALLOWED.has(t))).toEqual([]);
    });
  }
  it("every id the code sets exists in the layout it is set on", () => {
    // ids used by all three sizes (the data-less branch and the tap targets touch these on every layout)
    const common = ["w_root", "w_top", "w_dot", "w_headline", "w_sub", "w_tsb", "w_wo_box", "w_wo_name", "w_wo_info", "w_btn_rulli"];
    for (const f of files) {
      const xml = readFileSync(join(DIR, f), "utf8");
      for (const id of common) expect(xml, `${f} lacks ${id}`).toContain(`@+id/${id}"`);
    }
  });
});
