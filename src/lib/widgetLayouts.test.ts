// The Android widget layouts are inflated by the launcher as RemoteViews, which only allows a short list of views:
// anything else (a plain <View>, ConstraintLayout, Space, <include>…) makes the whole widget show "Can't load widget".
// Widget «B + C» (22 November 2026): five sizes and the layout without data, filled by MasCoachWidget.java.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../android/app/src/main/res/layout");
const JAVA = readFileSync(join(__dirname, "../../android/app/src/main/java/it/mascoach/app/MasCoachWidget.java"), "utf8");
const ALLOWED = new Set([
  "FrameLayout", "LinearLayout", "RelativeLayout", "GridLayout", "Button", "ImageButton", "ImageView", "ProgressBar", "TextView",
  "TextClock", "Chronometer", "AnalogClock", "ViewFlipper", "ListView", "GridView", "StackView", "AdapterViewFlipper",
]);
const files = readdirSync(DIR).filter((f) => f.startsWith("widget_"));
const xml = (f: string) => readFileSync(join(DIR, f), "utf8");
const ids = (f: string) => new Set([...xml(f).matchAll(/android:id="@\+id\/(\w+)"/g)].map((m) => m[1]));

const SEGS = ["w_seg0", "w_seg1", "w_seg2"];
const HEADER = ["w_hero", "w_stamp", "w_refresh", "w_headline", ...SEGS];
const SESSION = ["w_session", "w_lab", "w_lab_prop", "w_lab_done", "w_title"];
/** What MasCoachWidget sets on each layout (build, header, the night's numbers, the session). */
const USED: Record<string, string[]> = {
  "widget_s21.xml": ["w_word", "w_nums", ...SEGS],
  "widget_s22.xml": ["w_hero", "w_word", "w_nums", ...SEGS, ...SESSION, "w_meta", "w_meta_warn", "w_act_play", "w_act_go", "w_act_cal"],
  "widget_s42.xml": [
    ...HEADER, "w_short",
    "w_t_hrv", "w_hrv_val", "w_hrv_chart", "w_t_rhr", "w_rhr_val", "w_rhr_chart", "w_t_sleep", "w_sleep_val", "w_sleep_chart",
    ...SESSION, "w_lab_warn", "w_act_pedala", "w_act_go", "w_act_cal",
  ],
  "widget_s43.xml": [
    ...HEADER, "w_seg_l0", "w_seg_l1", "w_seg_l2",
    "w_t_hrv", "w_hrv_st", "w_hrv_val", "w_hrv_chart", "w_t_rhr", "w_rhr_st", "w_rhr_val", "w_rhr_chart",
    "w_t_sleep", "w_sleep_st", "w_sleep_val", "w_sleep_chart", "w_t_form", "w_form_st", "w_form_val", "w_form_chart",
    ...SESSION, "w_meta", "w_meta_warn", "w_act_pedala", "w_act_go", "w_act_cal", "w_profile", "w_better",
  ],
  "widget_s54.xml": [
    ...HEADER, "w_seg_l0", "w_seg_l1", "w_seg_l2", "w_why",
    "w_hrv_card", "w_hrv_head", "w_hrv_st", "w_hrv_val", "w_hrv_line",
    "w_t_rhr", "w_rhr_val", "w_rhr_chart", "w_t_sleep", "w_sleep_val", "w_sleep_chart", "w_t_form", "w_form_val", "w_form_chart",
    ...SESSION, "w_meta", "w_meta_warn", "w_act_pedala", "w_act_pill", "w_profile", "w_better", "w_next",
  ],
  "widget_setup.xml": ["w_setup_text"],
};

describe("widget layouts", () => {
  it("has the five sizes and the layout without data", () => {
    expect(files.sort()).toEqual(Object.keys(USED).sort());
  });
  for (const f of files) {
    it(`${f} only uses views a widget may inflate`, () => {
      const tags = [...xml(f).matchAll(/<([A-Za-z.]+)[\s>/]/g)].map((m) => m[1]);
      expect(tags.filter((t) => !ALLOWED.has(t))).toEqual([]);
    });
    it(`${f} has @android:id/background as root (the launch animation starts from it)`, () => {
      expect(xml(f)).toContain('android:id="@android:id/background"');
    });
  }
  it("every id the code sets exists in the layout it is set on", () => {
    for (const [f, list] of Object.entries(USED)) {
      const have = ids(f);
      for (const id of list) expect(have.has(id), `${f} lacks ${id}`).toBe(true);
    }
  });
  it("every id and layout the code names exists", () => {
    const all = new Set(files.flatMap((f) => [...ids(f)]));
    const named = new Set([...JAVA.matchAll(/R\.id\.(w_\w+)/g)].map((m) => m[1]));
    expect([...named].filter((id) => !all.has(id))).toEqual([]);
    const layouts = [...JAVA.matchAll(/R\.layout\.(\w+)/g)].map((m) => `${m[1]}.xml`);
    expect(layouts.filter((f) => !files.includes(f))).toEqual([]);
  });
});
