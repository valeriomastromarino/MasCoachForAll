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

export const coachServer = () => (read(URL_KEY) || DEFAULT_SERVER).replace(/\/+$/, "");
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
