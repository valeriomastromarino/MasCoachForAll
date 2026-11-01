// `npm run build:apk` → android/app/build/outputs/apk/debug/app-debug.apk, copied to ./MasCoach.apk.
// Builds the single-file web app, syncs it into the Android project and runs Gradle with Android Studio's bundled JDK.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const studio = "C:/Program Files/Android/Android Studio";
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), "AppData", "Local", "Android", "Sdk");
const env = { ...process.env, JAVA_HOME: process.env.JAVA_HOME ?? path.join(studio, "jbr") };
const run = (cmd, cwd = root) => execSync(cmd, { cwd, env, stdio: "inherit" });

if (!existsSync(sdk)) throw new Error(`Android SDK non trovato in ${sdk}: apri Android Studio una volta.`);
// Gradle wants the SDK path with escaped separators.
const escaped = sdk.split("\\").join("\\\\").replace(":", "\\:");
writeFileSync(path.join(root, "android", "local.properties"), `sdk.dir=${escaped}\n`);

run("npm run build:file");
run("npx cap sync android");
const gradle = path.join(root, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
run(`"${gradle}" assembleDebug`, path.join(root, "android"));

const apk = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const out = path.join(root, "MasCoach.apk");
copyFileSync(apk, out);
console.log(`\nAPK pronto: ${out}`);
