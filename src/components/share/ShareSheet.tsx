"use client";

// «Condividi l'uscita» (20 November 2026, styles A «Poster» and E «Sulla tua foto» chosen among six previews): the picture,
// its style and size, three switches; «Condividi» opens the share sheet of the phone (Instagram, WhatsApp, Strava…),
// «Salva» puts the picture in the gallery (Pictures/MasCoach), or downloads it on a computer. The picture is made on the
// device: no network, and the photo never leaves it.
import { IconDownload, IconPhoto, IconShare, IconX } from "@tabler/icons-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { guardBack, isApp, saveImage, shareFile } from "@/lib/native";
import type { RideDetail } from "@/lib/ride";
import { HIDDEN_METERS, SHARE_SIZE, shareCard, type ShareFormat, type ShareStyle } from "@/lib/share/rideShare";
import { drawShare, exportShare, prepareShare, readPhoto, type ShareInk } from "./drawShare";

type Prefs = { style: ShareStyle; format: ShareFormat; route: boolean; effort: boolean };

const KEY = "mascoach-share";
const STYLE_NAME: Record<ShareStyle, string> = { poster: "Poster", foto: "Sulla tua foto" };
const FORMATS: ShareFormat[] = ["storia", "post", "quadrato"];

/** Style, size and switches of the last picture. Hiding the ends of the route is not remembered: it is always on at first. */
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return {
      style: p.style === "foto" ? "foto" : "poster",
      format: p.format && FORMATS.includes(p.format) ? p.format : "storia",
      route: p.route !== false,
      effort: p.effort !== false,
    };
  } catch {
    return { style: "poster", format: "storia", route: true, effort: true };
  }
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** On/off row, 48 px: the off track is grey enough to be seen (non-text contrast 3:1). */
function Switch({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-12 w-full items-center gap-3 py-1 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug">{label}</span>
        {sub && <span className="block text-[13px] leading-snug text-muted">{sub}</span>}
      </span>
      <span className="relative h-7 w-[46px] shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--brand)" : "var(--faint)" }} aria-hidden>
        <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all" style={{ left: on ? 21 : 3 }} />
      </span>
    </button>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm"
      style={on ? { background: "var(--accent-bg)", color: "var(--accent-ink)", fontWeight: 600 } : { color: "var(--muted)" }}
    >
      {children}
    </button>
  );
}

function Sheet({ ride, onClose }: { ride: RideDetail; onClose: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [hideEnds, setHideEnds] = useState(true);
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [ink, setInk] = useState<ShareInk | null>(null);
  const [large, setLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Why the last drawing failed (a canvas the device cannot draw on): said when «Condividi» or «Salva» is touched.
  const drawFailed = useRef<string | null>(null);
  const titleId = useId();
  const app = isApp();

  const s = ride.summary;
  const hasEffort = [s.np, s.tss, s.avgHr].some((x) => x !== null && x > 0);
  const card = useMemo(() => shareCard(ride, { route: prefs.route, hideEnds, effort: prefs.effort }), [ride, prefs.route, prefs.effort, hideEnds]);
  const size = SHARE_SIZE[prefs.format];
  const needsPhoto = prefs.style === "foto" && !photo;

  const update = (p: Partial<Prefs>) =>
    setPrefs((old) => {
      const next = { ...old, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private mode: the choice lasts until the sheet closes.
      }
      return next;
    });

  useEffect(() => {
    let live = true;
    void prepareShare().then((i) => live && setInk(i));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ink || !canvas.current) return;
    try {
      drawShare(canvas.current, card, prefs.style, prefs.format, photo, ink);
      drawFailed.current = null;
    } catch (e) {
      drawFailed.current = why(e);
    }
  }, [ink, card, prefs.style, prefs.format, photo]);

  // The photo is held in memory only while the sheet is open.
  useEffect(() => () => photo?.close(), [photo]);

  // Dialog: Esc and Android's Back close it, Tab stays inside, the page behind does not scroll.
  useEffect(() => {
    const el = panel.current;
    el?.focus();
    const removeBack = guardBack(() => (onClose(), true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !el) return;
      const all = [...el.querySelectorAll<HTMLElement>("button:not([disabled])")].filter((b) => b.offsetParent !== null);
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeBack();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const pickPhoto = () => picker.current?.click();
  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await readPhoto(file));
      update({ style: "foto" });
      setNote(null);
    } catch {
      setNote({ text: "Non riesco ad aprire questa foto: prova con un'altra.", error: true });
    }
  };

  const picture = async () => {
    if (!canvas.current) throw new Error("l'immagine non è pronta");
    if (drawFailed.current) throw new Error(drawFailed.current);
    const out = await exportShare(canvas.current, prefs.style);
    return { ...out, name: `${card.fileName}.${out.ext}` };
  };

  const share = async () => {
    setBusy(true);
    setNote(null);
    try {
      const p = await picture();
      if (app) {
        await shareFile(p.name, await base64(p.blob), p.mime, "Condividi l'uscita");
        return;
      }
      const file = new File([p.blob], p.name, { type: p.mime });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: ride.name });
      else {
        download(p.blob, p.name);
        setNote({ text: "Questo browser non sa condividere le immagini: l'ho scaricata, la trovi tra i download." });
      }
    } catch (e) {
      // Closing the share sheet without choosing an app is not an error.
      if (!(e instanceof DOMException && e.name === "AbortError")) setNote({ text: `Non sono riuscito a condividere l'immagine: ${why(e)}.`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const p = await picture();
      if (app) {
        await saveImage(p.name, await base64(p.blob), p.mime);
        setNote({ text: "Salvata nella galleria, nella cartella MasCoach." });
      } else {
        download(p.blob, p.name);
        setNote({ text: "Immagine scaricata: la trovi tra i download." });
      }
    } catch (e) {
      setNote({ text: `Non sono riuscito a salvare l'immagine: ${why(e)}.`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const off = busy || needsPhoto || !ink;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0" style={{ background: "rgba(20, 14, 10, 0.4)" }} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[26px] px-4 pt-2 outline-none sm:max-w-md sm:rounded-[26px]"
        style={{ background: "var(--surface)", boxShadow: "var(--tip-shadow)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-1 h-1 w-10 rounded-full sm:hidden" style={{ background: "var(--border)" }} aria-hidden />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 id={titleId} className="text-lg font-semibold leading-tight">
              Condividi l&apos;uscita
            </h2>
            <p className="num text-[13px] text-muted">
              Immagine {size.w} × {size.h}, fatta {app ? "nel telefono" : "nel browser"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--neutral-bg)" }}>
            <IconX size={20} stroke={2} aria-hidden />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-3.5">
          <button
            type="button"
            onClick={() => setLarge((x) => !x)}
            aria-label={large ? "Rimpicciolisci l'anteprima" : "Ingrandisci l'anteprima"}
            className={`shrink-0 overflow-hidden rounded-xl ${large ? "flex w-full justify-center" : ""}`}
            style={{ boxShadow: "0 4px 14px rgba(0,0,0,.18)", background: large ? "transparent" : "var(--neutral-bg)", boxSizing: "content-box" }}
          >
            <canvas
              ref={canvas}
              role="img"
              aria-label={`Anteprima: ${STYLE_NAME[prefs.style]}, ${size.label}`}
              className="block"
              style={large ? { width: "auto", height: "auto", maxWidth: "100%", maxHeight: "62dvh", borderRadius: 12 } : { width: 112, height: "auto" }}
            />
          </button>
          <div className="min-w-[180px] flex-1 space-y-2">
            <div role="group" aria-label="Stile" className="flex flex-col gap-1 rounded-2xl p-1" style={{ background: "var(--neutral-bg)" }}>
              <Choice on={prefs.style === "poster"} onClick={() => update({ style: "poster" })}>
                Poster
              </Choice>
              <Choice
                on={prefs.style === "foto"}
                onClick={() => {
                  update({ style: "foto" });
                  if (!photo) pickPhoto();
                }}
              >
                Sulla tua foto
              </Choice>
            </div>
            {prefs.style === "foto" && (
              <button
                type="button"
                onClick={pickPhoto}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold"
                style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
              >
                <IconPhoto size={18} stroke={2} aria-hidden />
                {photo ? "Cambia foto" : "Scegli la foto"}
              </button>
            )}
          </div>
        </div>
        <input ref={picker} type="file" accept="image/*" className="hidden" onChange={(e) => void onPicked(e)} tabIndex={-1} aria-hidden />

        <div role="group" aria-label="Formato" className="mt-3 flex gap-1 rounded-2xl p-1" style={{ background: "var(--neutral-bg)" }}>
          {FORMATS.map((f) => (
            <Choice key={f} on={prefs.format === f} onClick={() => update({ format: f })}>
              {SHARE_SIZE[f].label}
            </Choice>
          ))}
        </div>

        <div className="mt-2">
          {ride.hasRoute && <Switch label="Percorso" on={prefs.route} onChange={(on) => update({ route: on })} />}
          {ride.hasRoute && prefs.route && (
            <Switch label="Nascondi partenza e arrivo" sub={`I primi e gli ultimi ${HIDDEN_METERS} m: non si vede da dove parti`} on={hideEnds} onChange={setHideEnds} />
          )}
          {hasEffort && <Switch label="Potenza e cuore" sub="NP, TSS, FC" on={prefs.effort} onChange={(on) => update({ effort: on })} />}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void share()}
            disabled={off}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-[18px] text-[17px] font-semibold disabled:opacity-60"
            style={{ background: "var(--brand)", color: "var(--on-brand)" }}
          >
            <IconShare size={20} stroke={2} aria-hidden />
            Condividi
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={off}
            aria-label={app ? "Salva nella galleria" : "Salva l'immagine"}
            className="flex min-h-14 items-center justify-center gap-1.5 rounded-[18px] px-4 text-[15px] font-semibold disabled:opacity-60"
            style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
          >
            <IconDownload size={20} stroke={2} aria-hidden />
            Salva
          </button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-[13px] leading-snug" style={{ color: note?.error ? "var(--critical-ink)" : "var(--muted)" }}>
          {needsPhoto ? "Scegli una foto dalla galleria: il percorso e i numeri vanno sopra." : note?.text}
        </p>
      </div>
    </div>
  );
}

/** The sheet on the body: inside the page it would sit under the bar at the bottom of the phone app. */
export function ShareSheet(props: { ride: RideDetail; onClose: () => void }) {
  return createPortal(<Sheet {...props} />, document.body);
}
