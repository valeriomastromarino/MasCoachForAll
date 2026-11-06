// Opens the coach page. Lives next to replacePath because the single-file build swaps only the "./replacePath" import.
import { replacePath } from "./replacePath";

export const openCoach = (): void => replacePath("/coach");
