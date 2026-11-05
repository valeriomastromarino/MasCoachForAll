package it.mascoach.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: today's verdict, the key numbers and the planned workout. Three sizes (small 4x2, medium, large),
 * picked from the room the widget has. The data is the summary of GET /api/widget, cached on the phone and refreshed
 * every morning at 8:00 (and whenever the app opens). Each area opens the matching page of the app.
 */
public class MasCoachWidget extends AppWidgetProvider {
    static final String PREFS = "mascoach-widget";
    static final String KEY_URL = "url";
    static final String KEY_PASSWORD = "password";
    static final String KEY_DATA = "data";
    static final String KEY_FETCHED = "fetched";
    static final String KEY_ERROR = "error";
    /** Hour of the daily refresh. */
    static final int REFRESH_HOUR = 8;

    private static final int[] ZONE_COLORS = {
        0xFFB4B2A9, 0xFF378ADD, 0xFF1D9E75, 0xFFEF9F27, 0xFFD85A30, 0xFFE24B4A, 0xFF993556
    };
    private static final float[] ZONE_HEIGHT = {0.2f, 0.35f, 0.5f, 0.65f, 0.8f, 0.92f, 1f};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        scheduleDaily(context);
        // Never fetched yet (just added): ask now.
        if (prefs(context).getString(KEY_DATA, null) == null) refreshAsync(context, null);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleDaily(context);
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(context));
    }

    // ── Data ──

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Server and password come from the app (Impostazioni); they stay on this phone. */
    static void configure(Context c, String url, String password) {
        prefs(c).edit().putString(KEY_URL, url == null ? "" : url).putString(KEY_PASSWORD, password == null ? "" : password).apply();
    }

    /** Fetches the summary (blocking: call from a thread). Returns true when the cache was refreshed. */
    static boolean fetch(Context c) {
        SharedPreferences p = prefs(c);
        String base = p.getString(KEY_URL, "");
        String pw = p.getString(KEY_PASSWORD, "");
        if (base.isEmpty() || pw.isEmpty()) {
            p.edit().putString(KEY_ERROR, "Imposta la password in Impostazioni").apply();
            return false;
        }
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(base.replaceAll("/+$", "") + "/api/widget").openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("x-mascoach-password", pw);
            int code = conn.getResponseCode();
            if (code == 401) {
                p.edit().putString(KEY_ERROR, "Password non valida").apply();
                return false;
            }
            if (code != 200) {
                p.edit().putString(KEY_ERROR, "Server non raggiungibile (" + code + ")").apply();
                return false;
            }
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            new JSONObject(sb.toString()); // must parse
            p.edit().putString(KEY_DATA, sb.toString()).putLong(KEY_FETCHED, System.currentTimeMillis()).remove(KEY_ERROR).apply();
            return true;
        } catch (Exception e) {
            p.edit().putString(KEY_ERROR, "Nessuna rete").apply();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Fetch on a background thread, then redraw every widget. */
    static void refreshAsync(Context context, Runnable done) {
        final Context c = context.getApplicationContext();
        new Thread(() -> {
            fetch(c);
            updateAll(c);
            if (done != null) done.run();
        }).start();
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, MasCoachWidget.class))) render(c, m, id);
    }

    // ── Daily refresh at 8:00 ──

    static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, WidgetReceiver.class).setAction(WidgetReceiver.ACTION_REFRESH);
        return PendingIntent.getBroadcast(c, 100, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Sets the next 8:00 refresh (inexact: no special permission needed; it may come a little late). */
    static void scheduleDaily(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, REFRESH_HOUR);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis() + 60_000) next.add(Calendar.DAY_OF_YEAR, 1);
        am.setAndAllowWhileIdle(AlarmManager.RTC, next.getTimeInMillis(), alarmIntent(c));
    }

    // ── Drawing ──

    private static boolean night(Context c) {
        return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Minimum height (dp) each layout needs to show everything without clipping. */
    private static final int MEDIUM_MIN_DP = 280;
    private static final int LARGE_MIN_DP = 480;

    /**
     * Android 12+: gives the launcher all three layouts with the room each one needs and it picks the biggest that fits,
     * at every size the widget is resized to. Older Android: picks by the current height.
     */
    static void render(Context c, AppWidgetManager m, int id) {
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            java.util.Map<android.util.SizeF, RemoteViews> map = new java.util.LinkedHashMap<>();
            map.put(new android.util.SizeF(180f, 110f), build(c, id, 0));
            map.put(new android.util.SizeF(250f, MEDIUM_MIN_DP), build(c, id, 1));
            map.put(new android.util.SizeF(250f, LARGE_MIN_DP), build(c, id, 2));
            m.updateAppWidget(id, new RemoteViews(map));
            return;
        }
        Bundle o = m.getAppWidgetOptions(id);
        int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        m.updateAppWidget(id, build(c, id, h < MEDIUM_MIN_DP ? 0 : (h < LARGE_MIN_DP ? 1 : 2)));
    }

    /** One layout (0 small, 1 medium, 2 large) filled with the cached data. */
    private static RemoteViews build(Context c, int id, int size) {
        int layout = size == 0 ? R.layout.widget_small : size == 1 ? R.layout.widget_medium : R.layout.widget_large;
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);

        SharedPreferences p = prefs(c);
        JSONObject d = null;
        try {
            String raw = p.getString(KEY_DATA, null);
            if (raw != null) d = new JSONObject(raw);
        } catch (Exception ignored) {
            d = null;
        }

        if (d == null) {
            v.setImageViewBitmap(R.id.w_dot, dot(0xFF888780));
            v.setTextViewText(R.id.w_headline, "MasCoach");
            String err = p.getString(KEY_ERROR, null);
            v.setTextViewText(R.id.w_sub, err != null ? err : "Aggiorno i dati…");
            if (size == 0) {
                v.setTextViewText(R.id.w_tsb, "–");
                v.setTextViewText(R.id.w_wo_name, "");
                v.setTextViewText(R.id.w_wo_info, "");
            } else {
                v.setTextViewText(R.id.w_tsb, "–");
                v.setTextViewText(R.id.w_hrv, "–");
                v.setTextViewText(R.id.w_sleep, "–");
                v.setTextViewText(R.id.w_wo_name, "");
                v.setTextViewText(R.id.w_wo_info, "");
                v.setViewVisibility(R.id.w_profile, android.view.View.GONE);
            }
            if (size == 2) {
                v.setTextViewText(R.id.w_rhr, "–");
                v.setTextViewText(R.id.w_ctl, "–");
                v.setTextViewText(R.id.w_atl, "–");
                v.setTextViewText(R.id.w_yest, "");
                v.setViewVisibility(R.id.w_week, android.view.View.GONE);
            }
            tap(c, v, R.id.w_root, "/", id * 10 + 1);
            tap(c, v, R.id.w_btn_rulli, "/rulli", id * 10 + 4);
            if (size == 2) tap(c, v, R.id.w_btn_coach, "/coach", id * 10 + 5);
            return v;
        }

        String level = d.optString("level", "grigio");
        int color = "verde".equals(level) ? 0xFF1D9E75 : "giallo".equals(level) ? 0xFFEF9F27 : "rosso".equals(level) ? 0xFFE24B4A : 0xFF888780;
        v.setImageViewBitmap(R.id.w_dot, dot(color));
        v.setTextViewText(R.id.w_headline, d.optString("headline", "MasCoach"));
        String sub = d.optString("advice", "");
        if (size == 0) sub = shortAdvice(level);
        long fetched = p.getLong(KEY_FETCHED, 0);
        v.setTextViewText(R.id.w_sub, sub);
        v.setTextViewText(R.id.w_tsb, signed(d, "tsb"));

        JSONObject wo = d.optJSONObject("workout");
        String woName = wo == null ? "Nessun allenamento previsto" : wo.optString("name", "Allenamento");
        String woInfo = wo == null ? "Riposo o allenamento libero" : info(wo, size);
        v.setTextViewText(R.id.w_wo_name, woName);
        v.setTextViewText(R.id.w_wo_info, woInfo);

        if (size >= 1) {
            v.setTextViewText(R.id.w_hrv, num(d, "hrv", " ms"));
            v.setTextViewText(R.id.w_sleep, hours(d.optDouble("sleepHours", Double.NaN)));
            if (wo != null && wo.optJSONArray("blocks") != null && wo.optJSONArray("blocks").length() > 0) {
                v.setImageViewBitmap(R.id.w_profile, profile(wo.optJSONArray("blocks")));
                v.setViewVisibility(R.id.w_profile, android.view.View.VISIBLE);
            } else {
                v.setViewVisibility(R.id.w_profile, android.view.View.INVISIBLE);
            }
        }
        if (size == 2) {
            v.setTextViewText(R.id.w_rhr, num(d, "rhr", " bpm"));
            v.setTextViewText(R.id.w_ctl, num(d, "ctl", ""));
            v.setTextViewText(R.id.w_atl, num(d, "atl", ""));
            JSONObject y = d.optJSONObject("yesterday");
            String stamp = fetched > 0 ? "  ·  aggiornato " + new java.text.SimpleDateFormat("d/M HH:mm", java.util.Locale.ITALY).format(new java.util.Date(fetched)) : "";
            v.setTextViewText(R.id.w_yest, (y == null ? "Ieri: riposo" : "Ieri: " + y.optString("name", "") + " · " + duration(y.optInt("secs", 0)) + (y.isNull("tss") ? "" : " · TSS " + y.optInt("tss"))) + stamp);
            JSONArray week = d.optJSONArray("week");
            if (week != null) {
                v.setImageViewBitmap(R.id.w_week, weekBars(c, week));
                v.setViewVisibility(R.id.w_week, android.view.View.VISIBLE);
            }
        }

        // Each area opens its page: the verdict → Oggi, numbers → Analisi, workout → Oggi, buttons → Rulli and Coach.
        tap(c, v, R.id.w_root, "/", id * 10 + 1);
        tap(c, v, R.id.w_top, "/", id * 10 + 1);
        if (size == 0) tap(c, v, R.id.w_tsb_box, "/analisi", id * 10 + 2);
        else tap(c, v, R.id.w_nums, "/analisi", id * 10 + 2);
        if (size == 2) tap(c, v, R.id.w_nums2, "/analisi", id * 10 + 2);
        tap(c, v, R.id.w_wo_box, "/", id * 10 + 3);
        String rulli = wo != null && !wo.optString("id").isEmpty() ? "/rulli/" + Uri.encode(wo.optString("id")) : "/rulli";
        tap(c, v, R.id.w_btn_rulli, rulli, id * 10 + 4);
        if (size == 2) {
            tap(c, v, R.id.w_btn_coach, "/coach", id * 10 + 5);
            tap(c, v, R.id.w_week, "/calendario", id * 10 + 6);
        }
        return v;
    }

    private static void tap(Context c, RemoteViews v, int viewId, String route, int code) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("mascoach://app" + route))
                .putExtra(MainActivity.EXTRA_ROUTE, route)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(viewId, PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    // ── Text helpers ──

    private static String shortAdvice(String level) {
        switch (level) {
            case "verde": return "Allenamento previsto ok";
            case "giallo": return "Meglio Z2 oggi";
            case "rosso": return "Riposo o Z1 breve";
            default: return "Segui il piano";
        }
    }

    private static String signed(JSONObject d, String key) {
        if (d.isNull(key) || !d.has(key)) return "–";
        int v = (int) Math.round(d.optDouble(key));
        return v > 0 ? "+" + v : (v < 0 ? "−" + Math.abs(v) : "0");
    }

    private static String num(JSONObject d, String key, String unit) {
        if (d.isNull(key) || !d.has(key)) return "–";
        return Math.round(d.optDouble(key)) + unit;
    }

    private static String hours(double h) {
        if (Double.isNaN(h)) return "–";
        int mins = (int) Math.round(h * 60);
        return (mins / 60) + " h " + String.format(java.util.Locale.ITALY, "%02d", mins % 60);
    }

    private static String duration(int secs) {
        int mins = Math.round(secs / 60f);
        return mins >= 60 ? (mins / 60) + " h " + String.format(java.util.Locale.ITALY, "%02d", mins % 60) : mins + " min";
    }

    private static String info(JSONObject wo, int size) {
        StringBuilder sb = new StringBuilder();
        if (!wo.isNull("secs")) sb.append(duration(wo.optInt("secs")));
        if (!wo.isNull("tss")) sb.append(sb.length() > 0 ? " · " : "").append("TSS ").append(wo.optInt("tss"));
        return sb.toString();
    }

    // ── Bitmaps ──

    private static Bitmap dot(int color) {
        Bitmap b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        cv.drawCircle(48, 48, 46, p);
        return b;
    }

    /** The workout as blocks: width = time, height = zone. */
    private static Bitmap profile(JSONArray blocks) {
        final int w = 600;
        final int h = 120;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        double total = 0;
        for (int i = 0; i < blocks.length(); i++) total += Math.max(0, blocks.optJSONObject(i).optDouble("secs", 0));
        if (total <= 0) return b;
        float x = 0;
        for (int i = 0; i < blocks.length(); i++) {
            JSONObject bl = blocks.optJSONObject(i);
            int zone = Math.max(1, Math.min(7, bl.optInt("zone", 1)));
            float bw = (float) (bl.optDouble("secs", 0) / total * w);
            p.setColor(ZONE_COLORS[zone - 1]);
            float top = h * (1 - ZONE_HEIGHT[zone - 1]);
            cv.drawRoundRect(new RectF(x + 0.5f, top, x + Math.max(1f, bw - 0.5f), h), 3, 3, p);
            x += bw;
        }
        return b;
    }

    /** Seven bars (Monday to Sunday), today highlighted, with the day letter under each. */
    private static Bitmap weekBars(Context c, JSONArray week) {
        final int w = 700;
        final int h = 128;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setColor(night(c) ? 0xFFB4B2A9 : 0xFF5F5E5A);
        t.setTextSize(24);
        t.setTextAlign(Paint.Align.CENTER);
        double max = 1;
        for (int i = 0; i < week.length(); i++) max = Math.max(max, week.optJSONObject(i).optDouble("tss", 0));
        String[] letters = {"L", "M", "M", "G", "V", "S", "D"};
        float slot = w / 7f;
        for (int i = 0; i < Math.min(7, week.length()); i++) {
            JSONObject day = week.optJSONObject(i);
            double tss = day.isNull("tss") ? 0 : day.optDouble("tss", 0);
            float bh = (float) (tss / max * (h - 40));
            p.setColor(day.optBoolean("today") ? 0xFF378ADD : (night(c) ? 0xFF3C4A66 : 0xFFB5D4F4));
            float left = i * slot + 10;
            float right = (i + 1) * slot - 10;
            cv.drawRoundRect(new RectF(left, h - 32 - Math.max(bh, 4), right, h - 32), 5, 5, p);
            cv.drawText(letters[i], i * slot + slot / 2, h - 6, t);
        }
        return b;
    }
}
