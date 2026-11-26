// Where the Android app finds the written coach: the online MasCoach (the Anthropic key stays there) and the app password.
// Both live on this phone only, like the Intervals key; the password is never in the app file.
import { widgetSetup } from "@/lib/native";

export const DEFAULT_SERVER = "";
const URL_KEY = "mascoach-server";
const PW_KEY = "mascoach-server-pw";

const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const AI_KEY = "mascoach-coach-ai";

/**
 * Whether the chat sends messages to the written coach (Claude Haiku, paid by the message). Off unless the athlete turns
 * it on (25 November 2026: no API spending by default): the chat answers with the app's own engine, free and offline.
 */
export const coachAiOn = () => read(AI_KEY) === "1";

export function setCoachAi(on: boolean) {
  try {
    if (on) localStorage.setItem(AI_KEY, "1");
    else localStorage.removeItem(AI_KEY);
  } catch {
    // Storage blocked: the chat keeps using the engine.
  }
}

export const coachServer = () =>(read(URL_KEY) || DEFAULT_SERVER).replace(/\/+$/, "");
export const coachPassword = () => read(PW_KEY);

export function saveCoachServer(url: string, password: string) {
  try {
    if (url.trim() && url.trim().replace(/\/+$/, "") !== DEFAULT_SERVER) localStorage.setItem(URL_KEY, url.trim());
    else localStorage.removeItem(URL_KEY);
    if (password) localStorage.setItem(PW_KEY, password);
    else localStorage.removeItem(PW_KEY);
  } catch {
    // Storage blocked: the app keeps using the rules.
  }
  widgetSetup(coachServer(), password);
}
