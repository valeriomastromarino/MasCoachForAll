// Synthetic 2-hour outdoor ride in the same shape as Intervals.icu responses, for demo mode.
import type { RawRideDetail, RawStream } from "./ride";

export function demoRide(id: string): { raw: RawRideDetail; streams: RawStream[] } {
  const secs = 2 * 3600;
  const ftp = 250;
  const time: number[] = [];
  const watts: number[] = [];
  const hr: number[] = [];
  const cad: number[] = [];
  const alt: number[] = [];
  const dist: number[] = [];
  const dfa: number[] = [];
  const lat: number[] = [];
  const lng: number[] = [];
  let d = 0;
  let h = 100;
  for (let t = 0; t < secs; t++) {
    // Endurance base with three 8' efforts at ~95% FTP.
    const effort = [1800, 3600, 5400].some((s) => t >= s && t < s + 480);
    const w = Math.max(0, (effort ? 238 : 165) + Math.sin(t / 37) * 25 + Math.sin(t / 7) * 12);
    h += ((effort ? 158 : 128) + (t / secs) * 6 - h) / 60;
    d += 7.5 + Math.sin(t / 300) * 1.5;
    const angle = (t / secs) * 2 * Math.PI;
    time.push(t);
    watts.push(Math.round(w));
    hr.push(Math.round(h));
    cad.push(Math.round(88 + Math.sin(t / 50) * 4));
    alt.push(Math.round(320 + Math.sin(angle * 3) * 80));
    dist.push(Math.round(d));
    dfa.push(Math.round((effort ? 0.62 : 1.25 + Math.sin(t / 200) * 0.12) * 100) / 100);
    lat.push(40.885 + Math.sin(angle) * 0.12 + Math.sin(angle * 5) * 0.01);
    lng.push(17.17 + Math.cos(angle) * 0.16 + Math.cos(angle * 4) * 0.012);
  }
  const efforts = [1800, 3600, 5400].map((s) => ({
    type: "WORK",
    start_index: s,
    end_index: s + 480,
    moving_time: 480,
    average_watts: 238,
    weighted_average_watts: 240,
    max_watts: 290,
    average_heartrate: 154,
    zone: 4,
  }));
  return {
    raw: {
      id,
      name: "Uscita demo · 3×8' soglia",
      start_date_local: new Date().toISOString().slice(0, 10) + "T08:30:00",
      type: "Ride",
      distance: d,
      moving_time: secs,
      total_elevation_gain: 640,
      average_speed: d / secs,
      average_temp: 19,
      icu_ftp: ftp,
      icu_weighted_avg_watts: 196,
      icu_average_watts: 182,
      icu_intensity: 78.4,
      icu_training_load: 123,
      icu_variability_index: 1.08,
      icu_joules: 182 * secs,
      average_heartrate: 136,
      max_heartrate: 163,
      average_cadence: 88,
      decoupling: 3.4,
      icu_efficiency_factor: 1.44,
      avg_lr_balance: 50.8,
      carbs_used: 260,
      icu_zone_times: [
        { id: "Z1", secs: 600 },
        { id: "Z2", secs: 3500 },
        { id: "Z3", secs: 1660 },
        { id: "Z4", secs: 1440 },
        { id: "Z5", secs: 0 },
        { id: "Z6", secs: 0 },
        { id: "Z7", secs: 0 },
      ],
      icu_hr_zone_times: [900, 3600, 1500, 1200, 0, 0, 0],
      icu_hr_zones: [130, 143, 150, 159, 164, 171, 186],
      icu_intervals: efforts,
    },
    streams: [
      { type: "time", data: time },
      { type: "watts", data: watts },
      { type: "heartrate", data: hr },
      { type: "cadence", data: cad },
      { type: "altitude", data: alt },
      { type: "distance", data: dist },
      { type: "dfa_a1", data: dfa },
      { type: "latlng", data: lat, data2: lng },
    ],
  };
}
