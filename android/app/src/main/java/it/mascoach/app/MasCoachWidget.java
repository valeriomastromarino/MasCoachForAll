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
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.util.DisplayMetrics;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget «B + C», chosen on 22 November 2026 among five previews: the verdict
 * of the day on the brand colour with the bar Recupero · Riduci · Pronto, the night's numbers against the athlete's norm
 * with their week, today's session with one action. Five layouts, from the 2×1 strip to the 5×4 (layout/widget_s*.xml).
 *
 * The day is the JSON v2 of lib/widget.ts, with the strings ready to show: the app pushes it while open (widgetPush: it also
 * knows the chat's «solo per oggi» requests), the widget asks GET /api/widget by itself at 8:00 and with «Aggiorna» (with the
 * site's password, if the app has it). Here it is only laid out, and the small charts are drawn.
 */
public class MasCoachWidget extends AppWidgetProvider {
    static final String PREFS = "mascoach-widget";
    static final String KEY_URL = "url";
    static final String KEY_PASSWORD = "password";
    static final String KEY_DATA = "data";
    /** When the day was stored (ms): the time the header shows. */
    static final String KEY_FETCHED = "fetched";
    /** Why the last ask to the site failed: «rete», «password» or «server»; gone after a success or a push of the app. */
    static final String KEY_ERROR = "error";
    /** A refresh running since (ms): the header says «Aggiorno…». */
    static final String KEY_BUSY = "busy";
    /** Hour of the daily refresh. */
    static final int REFRESH_HOUR = 8;
    /** The app's day of today (with the chat's requests) is not replaced by the site's for this long, except by «Aggiorna». */
    static final long APP_WINS_MS = 2 * 60 * 60 * 1000L;
    /** A refresh that never ended (process killed) stops showing «Aggiorno…» after this. */
    static final long BUSY_MS = 90_000L;

    private static final int S21 = 0;
    private static final int S22 = 1;
    private static final int S42 = 2;
    private static final int S43 = 3;
    private static final int S54 = 4;
    private static final int[] LAYOUTS = {R.layout.widget_s21, R.layout.widget_s22, R.layout.widget_s42, R.layout.widget_s43, R.layout.widget_s54};
    /** Width (dp) each layout needs: the 5×4 has three numbers in a row with their week, too narrow on four columns. */
    private static final float[] NEED_W = {110f, 110f, 250f, 250f, 300f};
    private static final int[] SEGS = {R.id.w_seg0, R.id.w_seg1, R.id.w_seg2};
    private static final int[] SEG_LABELS = {R.id.w_seg_l0, R.id.w_seg_l1, R.id.w_seg_l2};
    private static final String[] SEG_NAMES = {"Recupero", "Riduci", "Pronto"};
    private static final int[] ZONES = {R.color.w_z1, R.color.w_z2, R.color.w_z3, R.color.w_z4, R.color.w_z5, R.color.w_z6, R.color.w_z7};

    // What a tap opens (request code: widget id * 16 + one of these).
    private static final int TAP_HOME = 1;
    private static final int TAP_NIGHT = 2;
    private static final int TAP_FORM = 3;
    private static final int TAP_SESSION = 4;
    private static final int TAP_ACTION = 5;
    private static final int TAP_NEXT = 6;
    private static final int TAP_REFRESH = 7;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        scheduleDaily(context);
        // Just added and nothing yet: ask the site (the app gives the day as soon as it opens).
        if (data(context) == null && configured(prefs(context))) refreshAsync(context, false, null);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        // Resized: the charts are drawn again to the room they have.
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

    /** Server and password come from the app (Impostazioni → Coach scritto); they stay on this phone. */
    static void configure(Context c, String url, String password) {
        prefs(c).edit().putString(KEY_URL, url == null ? "" : url).putString(KEY_PASSWORD, password == null ? "" : password).remove(KEY_ERROR).apply();
    }

    static boolean configured(SharedPreferences p) {
        return !p.getString(KEY_URL, "").isEmpty() && !p.getString(KEY_PASSWORD, "").isEmpty();
    }

    /** The day to show, or null: nothing yet, or the format of before 22 November (the app sends the new one when it opens). */
    static JSONObject data(Context c) {
        return parse(prefs(c).getString(KEY_DATA, null));
    }

    private static JSONObject parse(String raw) {
        if (raw == null) return null;
        try {
            JSONObject d = new JSONObject(raw);
            return d.optInt("v") == 2 ? d : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** The widget already has today's day. */
    static boolean hasToday(Context c) {
        JSONObject d = data(c);
        return d != null && today().equals(str(d, "date"));
    }

    /** The day built by the app (widgetPush): it always wins, it knows the chat's requests for today. */
    static boolean store(Context c, String json) {
        if (parse(json) == null) return false;
        prefs(c).edit().putString(KEY_DATA, json).putLong(KEY_FETCHED, System.currentTimeMillis()).remove(KEY_ERROR).apply();
        return true;
    }

    /**
     * Asks the site for the day (blocking: call from a thread). force = «Aggiorna»: the site's day replaces the app's even
     * when the app's is recent. Returns true when a new day was stored.
     */
    static boolean fetch(Context c, boolean force) {
        SharedPreferences p = prefs(c);
        if (!configured(p)) return false;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(p.getString(KEY_URL, "").replaceAll("/+$", "") + "/api/widget").openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("x-mascoach-password", p.getString(KEY_PASSWORD, ""));
            int code = conn.getResponseCode();
            if (code == 401) return failed(c, force, "password");
            if (code != 200) return failed(c, force, "server");
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            String body = sb.toString();
            JSONObject site = parse(body);
            if (site == null) return failed(c, force, "server");
            JSONObject mine = data(c);
            boolean appWins = !force && mine != null && "app".equals(str(mine, "from")) && str(mine, "date").equals(str(site, "date"))
                    && System.currentTimeMillis() - p.getLong(KEY_FETCHED, 0) < APP_WINS_MS;
            if (appWins) {
                p.edit().remove(KEY_ERROR).apply();
                return false;
            }
            p.edit().putString(KEY_DATA, body).putLong(KEY_FETCHED, System.currentTimeMillis()).remove(KEY_ERROR).apply();
            return true;
        } catch (Exception e) {
            return failed(c, force, "rete");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** A failed ask is shown only if the user asked or the widget has nothing for today (at 8:00 the app's day may be there). */
    private static boolean failed(Context c, boolean force, String why) {
        if (force || !hasToday(c)) prefs(c).edit().putString(KEY_ERROR, why).apply();
        return false;
    }

    private static boolean busy(SharedPreferences p) {
        long since = p.getLong(KEY_BUSY, 0);
        return since > 0 && System.currentTimeMillis() - since < BUSY_MS;
    }

    /** Asks the site on a background thread («Aggiorno…» meanwhile), then redraws every widget. */
    static void refreshAsync(Context context, boolean force, Runnable done) {
        final Context c = context.getApplicationContext();
        if (!configured(prefs(c))) {
            updateAll(c);
            if (done != null) done.run();
            return;
        }
        prefs(c).edit().putLong(KEY_BUSY, System.currentTimeMillis()).apply();
        updateAll(c);
        new Thread(() -> {
            try {
                fetch(c, force);
            } finally {
                prefs(c).edit().remove(KEY_BUSY).apply();
                updateAll(c);
                if (done != null) done.run();
            }
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

    // ── Choosing the layout ──

    /**
     * Height (dp) each layout needs to show everything, with the phone's font size (Impostazioni → Display makes the text,
     * and so the layouts, taller). Sums of the paddings and of the lines of text of layout/widget_s*.xml, with a line of
     * Roboto at 1.172 times its size (includeFontPadding off), plus 2 dp for rounding.
     */
    private static float[] needH(Context c) {
        float l = 1.172f * c.getResources().getConfiguration().fontScale;
        float s21 = 34 + 34.5f * l;
        float s22 = 66 + 32.5f * l + 20 + 39 * l + Math.max(34, 12 * l);
        float s42 = 50 + 20 * l + Math.max(6, 12.5f * l) + 30 + 12 * l + Math.max(20, 16 * l) + Math.max(44, 26 * l);
        float s43 = 67 + 35 * l + 66 + 24 * l + 2 * Math.max(22, 18 * l) + Math.max(44, 39 * l) + Math.max(14, 12 * l);
        float s54 = 81 + 51 * l + 79 + 36 * l + Math.max(48, 2 + 36 * l) + Math.max(20, 16 * l) + Math.max(44, 39 * l) + Math.max(18, 12 * l);
        return new float[] {s21 + 2, s22 + 2, s42 + 2, s43 + 2, s54 + 2};
    }

    /**
     * Android 12+: the launcher gets the five layouts with the room each needs and shows the biggest that fits, at every
     * size the widget is resized to. Older Android: the layout is picked here from the size in portrait.
     */
    static void render(Context c, AppWidgetManager m, int id) {
        JSONObject d = data(c);
        if (d == null) {
            m.updateAppWidget(id, setup(c, id));
            return;
        }
        Bundle o = m.getAppWidgetOptions(id);
        int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        float[] need = needH(c);
        try {
            Draw g = new Draw(c, d, w);
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> map = new LinkedHashMap<>();
                for (int s = S21; s <= S54; s++) map.put(new SizeF(NEED_W[s], need[s]), build(g, id, s));
                m.updateAppWidget(id, new RemoteViews(map));
            } else {
                int size = S42; // size not known yet: the default 4×2
                if (w > 0 && h > 0) {
                    size = S21;
                    for (int s = S22; s <= S54; s++) if (w >= NEED_W[s] && h >= need[s]) size = s;
                }
                m.updateAppWidget(id, build(g, id, size));
            }
        } catch (Exception e) {
            // Data the layouts cannot show must not leave «Impossibile caricare il widget»: back to «Apri MasCoach».
            m.updateAppWidget(id, setup(c, id));
        }
    }

    // ── Filling the layouts ──

    /** One render: the data, the colours light and dark, the widget's width and the charts shared by the five layouts. */
    private static final class Draw {
        final Context c;
        final JSONObject d;
        final SharedPreferences p;
        final DisplayMetrics dm;
        final float dp;
        /** Width of the widget (dp): each chart is drawn to the room it gets, so the view does not stretch it. */
        final float width;
        final boolean night;
        final Context light;
        final Context dark;
        /** The same bitmap in the five layouts is sent once. */
        final Map<String, Bitmap> charts = new HashMap<>();
        final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);

        Draw(Context c, JSONObject d, int widthDp) {
            this.c = c;
            this.d = d;
            p = prefs(c);
            dm = c.getResources().getDisplayMetrics();
            dp = dm.density;
            width = widthDp > 0 ? widthDp : 276;
            night = (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            light = themed(c, Configuration.UI_MODE_NIGHT_NO);
            dark = themed(c, Configuration.UI_MODE_NIGHT_YES);
        }

        /** A colour of the phone's mode now (the zones of the profile: they follow a change of mode at the next update). */
        int color(int res) {
            return (night ? dark : light).getColor(res);
        }

        /** Width (dp) of a text in the widget's font, at the phone's font size. */
        float textDp(String s, float sp, boolean bold) {
            text.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            text.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, dm));
            return text.measureText(s) / dp;
        }
    }

    private static Context themed(Context c, int mode) {
        Configuration cfg = new Configuration(c.getResources().getConfiguration());
        cfg.uiMode = (cfg.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | mode;
        return c.createConfigurationContext(cfg);
    }

    /** A colour that follows the phone's light or dark mode, also when it changes later (Android 12+). */
    private static void tint(RemoteViews v, Draw g, int viewId, String method, int colorRes) {
        if (Build.VERSION.SDK_INT >= 31) v.setColorInt(viewId, method, g.light.getColor(colorRes), g.dark.getColor(colorRes));
        else v.setInt(viewId, method, g.color(colorRes));
    }

    private static RemoteViews build(Draw g, int id, int size) {
        Context c = g.c;
        JSONObject d = g.d;
        RemoteViews v = new RemoteViews(c.getPackageName(), LAYOUTS[size]);
        int seg = d.optInt("seg", -1);
        for (int i = 0; i < 3; i++) v.setImageViewResource(SEGS[i], i == seg ? R.drawable.w_seg_on : R.drawable.w_seg_off);
        tap(c, v, android.R.id.background, "/", id * 16 + TAP_HOME);

        if (size == S21 || size == S22) {
            v.setTextViewText(R.id.w_word, str(d, "word"));
            v.setTextViewText(R.id.w_nums, str(d, "nums"));
        } else {
            header(v, g, id);
            v.setTextViewText(R.id.w_headline, str(d, "headline"));
        }
        if (size != S21) tap(c, v, R.id.w_hero, "/", id * 16 + TAP_HOME);
        if (size == S42) v.setTextViewText(R.id.w_short, str(d, "short"));
        if (size == S43 || size == S54) segLabels(v, seg);
        if (size == S54) v.setTextViewText(R.id.w_why, str(d, "why"));

        if (size == S42) nightS42(v, g, id);
        if (size == S43) nightS43(v, g, id);
        if (size == S54) nightS54(v, g, id);
        if (size != S21) session(v, g, id, size);
        return v;
    }

    /** Logo, day and time of the data (or what went wrong), «Aggiorna». */
    private static void header(RemoteViews v, Draw g, int id) {
        v.setTextViewText(R.id.w_stamp, stamp(g.p, g.d));
        if (configured(g.p)) {
            Intent i = new Intent(g.c, WidgetReceiver.class).setAction(WidgetReceiver.ACTION_REFRESH_NOW);
            v.setOnClickPendingIntent(R.id.w_refresh, PendingIntent.getBroadcast(g.c, id * 16 + TAP_REFRESH, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } else {
            // Without the site's password the day comes from the app: opening it refreshes the widget.
            tap(g.c, v, R.id.w_refresh, "/", id * 16 + TAP_REFRESH);
        }
    }

    private static String stamp(SharedPreferences p, JSONObject d) {
        if (busy(p)) return "Aggiorno…";
        long at = p.getLong(KEY_FETCHED, 0);
        String time = at > 0 ? new SimpleDateFormat("H:mm", Locale.ITALY).format(new Date(at)) : "";
        String err = p.getString(KEY_ERROR, "");
        if ("rete".equals(err)) return "Nessuna rete · " + time;
        if (!err.isEmpty()) return "Non aggiornato · " + time;
        return str(d, "day") + (time.isEmpty() ? "" : " · " + time);
    }

    /** The words under the bar, the day's one in bold. */
    private static void segLabels(RemoteViews v, int seg) {
        for (int i = 0; i < 3; i++) {
            SpannableString t = new SpannableString(SEG_NAMES[i]);
            if (i == seg) t.setSpan(new StyleSpan(Typeface.BOLD), 0, t.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            v.setTextViewText(SEG_LABELS[i], t);
        }
    }

    // ── The night's numbers ──

    private static String hrvValue(JSONObject hrv) {
        return hrv == null ? "–" : String.valueOf(hrv.optInt("value"));
    }

    /** Resting HR with its arrow (7-day average above or below the norm) when there is no status beside it. */
    private static String rhrValue(JSONObject rhr, boolean arrow) {
        if (rhr == null) return "–";
        String a = str(rhr, "arrow");
        return (arrow && !a.isEmpty() ? a + " " : "") + rhr.optInt("value");
    }

    /** «nella norma» → «norma», «sotto la norma» → «↓ bassa», «sopra la norma» → «↑ alta» (medium tiles). */
    private static String statusShort(JSONObject n) {
        String s = str(n, "status");
        if ("sotto la norma".equals(s)) return "↓ bassa";
        if ("sopra la norma".equals(s)) return "↑ alta";
        if ("nella norma".equals(s)) return "norma";
        return "";
    }

    /** 4×2: HRV 7 gg, resting HR and sleep with their week. */
    private static void nightS42(RemoteViews v, Draw g, int id) {
        JSONObject hrv = g.d.optJSONObject("hrv");
        JSONObject rhr = g.d.optJSONObject("rhr");
        JSONObject sleep = g.d.optJSONObject("sleep");
        // Room inside a tile: the sheet's padding, two gaps between three tiles, the tile's padding.
        float tile = (g.width - 24 - 12) / 3f - 16;
        String h = hrvValue(hrv);
        String r = rhrValue(rhr, true);
        String s = sleep == null ? "–" : str(sleep, "text");
        v.setTextViewText(R.id.w_hrv_val, h);
        v.setTextViewText(R.id.w_rhr_val, r);
        v.setTextViewText(R.id.w_sleep_val, s);
        chart(v, g, R.id.w_hrv_chart, spark(g, hrv, tile - g.textDp(h, 16, true) - 6, 16), R.color.w_hrv);
        chart(v, g, R.id.w_rhr_chart, spark(g, rhr, tile - g.textDp(r, 16, true) - 6, 16), R.color.w_rhr);
        chart(v, g, R.id.w_sleep_chart, bars(g, sleep, tile - g.textDp(s, 16, true) - 6, 16), R.color.w_sleep);
        tapNight(v, g, id, R.id.w_t_hrv, R.id.w_t_rhr, R.id.w_t_sleep);
    }

    /** 4×3: the four numbers against the norm, with status and trend. */
    private static void nightS43(RemoteViews v, Draw g, int id) {
        JSONObject hrv = g.d.optJSONObject("hrv");
        JSONObject rhr = g.d.optJSONObject("rhr");
        JSONObject sleep = g.d.optJSONObject("sleep");
        JSONObject form = g.d.optJSONObject("form");
        float tile = (g.width - 28 - 6) / 2f - 20;
        String h = hrvValue(hrv);
        String r = rhrValue(rhr, false);
        String s = sleep == null ? "–" : str(sleep, "text");
        String f = form == null ? "–" : str(form, "text");
        v.setTextViewText(R.id.w_hrv_st, statusShort(hrv));
        v.setTextViewText(R.id.w_hrv_val, h);
        v.setTextViewText(R.id.w_rhr_st, statusShort(rhr));
        v.setTextViewText(R.id.w_rhr_val, r);
        v.setTextViewText(R.id.w_sleep_st, sleep == null ? "" : "stanotte");
        v.setTextViewText(R.id.w_sleep_val, s);
        v.setTextViewText(R.id.w_form_st, str(form, "zone"));
        v.setTextViewText(R.id.w_form_val, f);
        chart(v, g, R.id.w_hrv_chart, spark(g, hrv, tile - g.textDp(h, 18, true) - 3 - g.textDp("ms", 12, false) - 8, 18), R.color.w_hrv);
        chart(v, g, R.id.w_rhr_chart, spark(g, rhr, tile - g.textDp(r, 18, true) - 3 - g.textDp("bpm", 12, false) - 8, 18), R.color.w_rhr);
        chart(v, g, R.id.w_sleep_chart, bars(g, sleep, tile - g.textDp(s, 18, true) - 8, 18), R.color.w_sleep);
        chart(v, g, R.id.w_form_chart, form(g, form, tile - g.textDp(f, 18, true) - 8, 18), R.color.w_form_ink);
        tapNight(v, g, id, R.id.w_t_hrv, R.id.w_t_rhr, R.id.w_t_sleep);
        tap(g.c, v, R.id.w_t_form, "/analisi", id * 16 + TAP_FORM);
    }

    /** 5×4: the HRV of the last 14 nights against the norm (Altini), then resting HR, sleep and form. */
    private static void nightS54(RemoteViews v, Draw g, int id) {
        JSONObject hrv = g.d.optJSONObject("hrv");
        JSONObject rhr = g.d.optJSONObject("rhr");
        JSONObject sleep = g.d.optJSONObject("sleep");
        JSONObject form = g.d.optJSONObject("form");
        float inner = g.width - 32;
        String h = hrvValue(hrv);
        boolean norm = hrv != null && !hrv.isNull("lo") && !hrv.isNull("hi");
        v.setTextViewText(R.id.w_hrv_head, "HRV · 14 notti" + (norm ? " · norma " + hrv.optInt("lo") + "–" + hrv.optInt("hi") : ""));
        v.setTextViewText(R.id.w_hrv_st, hrv == null ? "dati insufficienti" : str(hrv, "status"));
        v.setTextViewText(R.id.w_hrv_val, h);
        float col = Math.max(g.textDp(h, 24, true), g.textDp("ms · 7 gg", 12, false));
        chart(v, g, R.id.w_hrv_line, line14(g, hrv, inner - 22 - col - 12, 48), R.color.w_hrv);

        float tile = (inner - 12) / 3f - 16;
        String r = rhrValue(rhr, true);
        String s = sleep == null ? "–" : str(sleep, "text");
        String f = form == null ? "–" : str(form, "text");
        v.setTextViewText(R.id.w_rhr_val, r);
        v.setTextViewText(R.id.w_sleep_val, s);
        v.setTextViewText(R.id.w_form_val, f);
        chart(v, g, R.id.w_rhr_chart, spark(g, rhr, tile - g.textDp(r, 16, true) - 6, 16), R.color.w_rhr);
        chart(v, g, R.id.w_sleep_chart, bars(g, sleep, tile - g.textDp(s, 16, true) - 6, 16), R.color.w_sleep);
        chart(v, g, R.id.w_form_chart, form(g, form, tile - g.textDp(f, 16, true) - 6, 16), R.color.w_form_ink);
        tapNight(v, g, id, R.id.w_hrv_card, R.id.w_t_rhr, R.id.w_t_sleep);
        tap(g.c, v, R.id.w_t_form, "/analisi", id * 16 + TAP_FORM);
    }

    /** The night's numbers open Analisi → Recupero. */
    private static void tapNight(RemoteViews v, Draw g, int id, int... views) {
        for (int x : views) tap(g.c, v, x, "/analisi/recupero", id * 16 + TAP_NIGHT);
    }

    // ── Today's session ──

    private static void session(RemoteViews v, Draw g, int id, int size) {
        Context c = g.c;
        JSONObject s = g.d.optJSONObject("session");
        if (s == null) s = new JSONObject();
        JSONObject a = s.optJSONObject("action");
        if (a == null) a = new JSONObject();
        String warn = str(s, "warn");
        String kind = str(s, "kind");
        String route = str(s, "route").isEmpty() ? "/" : str(s, "route");
        String actRoute = str(a, "route").isEmpty() ? route : str(a, "route");
        String actLabel = str(a, "label");
        String icon = str(a, "icon");

        // The line over the name, in the colour of what the session is; on the 4×2 a session that does not suit the day says so there.
        boolean warnLabel = size == S42;
        int lab = !warn.isEmpty() && warnLabel ? R.id.w_lab_warn : "proposal".equals(kind) ? R.id.w_lab_prop : "done".equals(kind) ? R.id.w_lab_done : R.id.w_lab;
        int[] labs = warnLabel ? new int[] {R.id.w_lab, R.id.w_lab_prop, R.id.w_lab_done, R.id.w_lab_warn} : new int[] {R.id.w_lab, R.id.w_lab_prop, R.id.w_lab_done};
        for (int x : labs) v.setViewVisibility(x, x == lab ? View.VISIBLE : View.GONE);
        v.setTextViewText(lab, lab == R.id.w_lab_warn ? warn : str(s, "label"));
        // Always set: the launcher may reuse the views of the last update, colour included.
        tint(v, g, R.id.w_lab, "setTextColor", !warn.isEmpty() && lab == R.id.w_lab ? R.color.w_warn_ink : R.color.w_ink2);
        v.setTextViewText(R.id.w_title, str(s, "title"));
        tap(c, v, R.id.w_session, route, id * 16 + TAP_SESSION);

        if (size != S42) {
            boolean w = !warn.isEmpty();
            v.setViewVisibility(R.id.w_meta, w ? View.GONE : View.VISIBLE);
            v.setViewVisibility(R.id.w_meta_warn, w ? View.VISIBLE : View.GONE);
            if (w) v.setTextViewText(R.id.w_meta_warn, warn);
            else v.setTextViewText(R.id.w_meta, str(s, size == S22 ? "meta" : "metaLong"));
        }

        // The one action: «Pedala» only for a session on the trainer that suits the day (decided by lib/widget.ts).
        PendingIntent act = activity(c, actRoute, id * 16 + TAP_ACTION);
        boolean play = "play".equals(icon);
        boolean cal = "calendar".equals(icon);
        if (size == S54) {
            int show = play ? R.id.w_act_pedala : R.id.w_act_pill;
            v.setViewVisibility(R.id.w_act_pedala, play ? View.VISIBLE : View.GONE);
            v.setViewVisibility(R.id.w_act_pill, play ? View.GONE : View.VISIBLE);
            v.setTextViewText(show, actLabel);
            if (!play) v.setTextViewCompoundDrawablesRelative(R.id.w_act_pill, cal ? R.drawable.w_ic_calendar : 0, 0, cal ? 0 : R.drawable.w_ic_right, 0);
            v.setOnClickPendingIntent(show, act);
        } else {
            int playId = size == S22 ? R.id.w_act_play : R.id.w_act_pedala;
            int show = play ? playId : cal ? R.id.w_act_cal : R.id.w_act_go;
            for (int x : new int[] {playId, R.id.w_act_go, R.id.w_act_cal}) v.setViewVisibility(x, x == show ? View.VISIBLE : View.GONE);
            if (show == R.id.w_act_pedala) v.setTextViewText(show, actLabel);
            v.setContentDescription(show, actLabel);
            v.setOnClickPendingIntent(show, act);
        }

        // Under it: the profile, or what to do instead of a session that does not suit the day.
        if (size == S43 || size == S54) {
            String better = str(s, "better");
            Bitmap prof = warn.isEmpty() ? profile(g, s.optJSONArray("blocks"), g.width - (size == S43 ? 28 : 32), size == S43 ? 14 : 18) : null;
            chart(v, g, R.id.w_profile, prof, 0);
            boolean showBetter = !warn.isEmpty() && !better.isEmpty();
            v.setViewVisibility(R.id.w_better, showBetter ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.w_better, better);
        }
        if (size == S54) {
            String next = str(g.d, "next");
            v.setViewVisibility(R.id.w_next, next.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.w_next, next);
            tap(c, v, R.id.w_next, "/calendario", id * 16 + TAP_NEXT);
        }
    }

    // ── No data yet ──

    private static RemoteViews setup(Context c, int id) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_setup);
        SharedPreferences p = prefs(c);
        String text;
        if (busy(p)) text = "Aggiorno…";
        else {
            switch (p.getString(KEY_ERROR, "")) {
                case "password":
                    text = "La password del sito non è valida: correggila in Impostazioni → Coach scritto, oppure apri l’app.";
                    break;
                case "rete":
                    text = "Nessuna rete. Apri l’app quando torna: il widget prende da lì la giornata.";
                    break;
                case "server":
                    text = "Il sito non risponde. Apri l’app: il widget prende da lì la giornata.";
                    break;
                default:
                    text = "Il widget prende la giornata dall’app: aprila una volta.";
            }
        }
        v.setTextViewText(R.id.w_setup_text, text);
        tap(c, v, android.R.id.background, "/", id * 16 + TAP_HOME);
        return v;
    }

    // ── Taps ──

    private static PendingIntent activity(Context c, String route, int code) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("mascoach://app" + route))
                .putExtra(MainActivity.EXTRA_ROUTE, route)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void tap(Context c, RemoteViews v, int viewId, String route, int code) {
        v.setOnClickPendingIntent(viewId, activity(c, route, code));
    }

    // ── Small charts: white, the view tints them with their colour, light or dark ──

    private static String str(JSONObject o, String key) {
        return o == null || o.isNull(key) ? "" : o.optString(key, "");
    }

    /** The values of a JSON array, NaN for the nights without data. */
    private static double[] values(JSONArray a) {
        int n = a == null ? 0 : a.length();
        double[] v = new double[n];
        for (int i = 0; i < n; i++) v[i] = a.isNull(i) ? Double.NaN : a.optDouble(i, Double.NaN);
        return v;
    }

    private static int known(double[] v) {
        int n = 0;
        for (double x : v) if (!Double.isNaN(x)) n++;
        return n;
    }

    /** Shows a chart, tinted with its colour (0 = drawn in its colours); hidden when there is nothing to draw or no room. */
    private static void chart(RemoteViews v, Draw g, int viewId, Bitmap b, int colorRes) {
        if (b == null) {
            v.setViewVisibility(viewId, View.GONE);
            return;
        }
        v.setViewVisibility(viewId, View.VISIBLE);
        v.setImageViewBitmap(viewId, b);
        if (colorRes != 0) tint(v, g, viewId, "setColorFilter", colorRes);
    }

    /** The last seven nights as a line, the norm as a band, the last night a dot (spark of the previews). */
    private static Bitmap spark(Draw g, JSONObject n, float wDp, float hDp) {
        if (n == null || wDp < 12) return null;
        double[] v = values(n.optJSONArray("nights"));
        if (known(v) < 2) return null;
        double lo = n.optDouble("lo", Double.NaN);
        double hi = n.optDouble("hi", Double.NaN);
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        for (double x : v) {
            if (Double.isNaN(x)) continue;
            min = Math.min(min, x);
            max = Math.max(max, x);
        }
        if (!Double.isNaN(lo) && !Double.isNaN(hi)) {
            min = Math.min(min, lo);
            max = Math.max(max, hi);
        }
        String key = "spark" + System.identityHashCode(n) + ":" + Math.round(wDp) + "x" + Math.round(hDp);
        Bitmap b = g.charts.get(key);
        if (b == null) {
            b = line(g, v, min, max, lo, hi, 36, false, wDp, hDp, 2, 3, 2.6f, 0);
            g.charts.put(key, b);
        }
        return b;
    }

    /** The HRV of the last 14 nights with the norm (5×4): gaps stay gaps, the last night a dot with a ring. */
    private static Bitmap line14(Draw g, JSONObject hrv, float wDp, float hDp) {
        if (hrv == null || wDp < 40) return null;
        double[] v = values(hrv.optJSONArray("n14"));
        if (known(v) < 2) return null;
        double lo = hrv.optDouble("lo", Double.NaN);
        double hi = hrv.optDouble("hi", Double.NaN);
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        for (double x : v) {
            if (Double.isNaN(x)) continue;
            min = Math.min(min, x);
            max = Math.max(max, x);
        }
        if (!Double.isNaN(lo)) min = Math.min(min, lo);
        if (!Double.isNaN(hi)) max = Math.max(max, hi);
        return line(g, v, min - 3, max + 3, lo, hi, 41, false, wDp, hDp, 4, 4, 2.65f, 1.5f);
    }

    /** Form of the last 14 days on a fixed scale (−32…+12) with the optimal band −10…−30 and the zero, as in the app. */
    private static Bitmap form(Draw g, JSONObject form, float wDp, float hDp) {
        if (form == null || wDp < 12) return null;
        double[] v = values(form.optJSONArray("days"));
        if (known(v) < 2) return null;
        for (int i = 0; i < v.length; i++) if (!Double.isNaN(v[i])) v[i] = Math.max(-32, Math.min(12, v[i]));
        String key = "form:" + Math.round(wDp) + "x" + Math.round(hDp);
        Bitmap b = g.charts.get(key);
        if (b == null) {
            b = line(g, v, -32, 12, -30, -10, 71, true, wDp, hDp, 3, 3, 2.65f, 1.5f);
            g.charts.put(key, b);
        }
        return b;
    }

    /**
     * A line over min…max in a box of wDp × hDp with padX/padY inside: the band lo–hi at bandAlpha, the zero as a thin line,
     * the values as a 2 dp line broken where a value is missing, the last one a dot (with a ring cut out of what is under it).
     */
    private static Bitmap line(Draw g, double[] v, double min, double max, double lo, double hi, int bandAlpha, boolean zero,
                               float wDp, float hDp, float padX, float padY, float dot, float ring) {
        float dp = g.dp;
        int w = Math.max(1, Math.round(wDp * dp));
        int h = Math.max(1, Math.round(hDp * dp));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        double span = max - min > 0 ? max - min : 1;
        float px = padX * dp;
        float py = padY * dp;
        float stepX = v.length > 1 ? (w - 2 * px) / (v.length - 1) : 0;
        if (!Double.isNaN(lo) && !Double.isNaN(hi) && hi > lo) {
            p.setAlpha(bandAlpha);
            float top = (float) (py + (1 - (hi - min) / span) * (h - 2 * py));
            float bottom = (float) (py + (1 - (lo - min) / span) * (h - 2 * py));
            cv.drawRoundRect(new RectF(0, top, w, bottom), 3 * dp, 3 * dp, p);
        }
        if (zero) {
            p.setAlpha(70);
            float y0 = (float) (py + (1 - (0 - min) / span) * (h - 2 * py));
            cv.drawRect(0, y0 - dp / 2, w, y0 + dp / 2, p);
        }
        p.setAlpha(255);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2 * dp);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeCap(Paint.Cap.ROUND);
        Path path = new Path();
        boolean pen = false;
        int last = -1;
        for (int i = 0; i < v.length; i++) {
            if (Double.isNaN(v[i])) {
                pen = false;
                continue;
            }
            float x = v.length > 1 ? px + i * stepX : w / 2f;
            float y = (float) (py + (1 - (v[i] - min) / span) * (h - 2 * py));
            if (pen) path.lineTo(x, y);
            else path.moveTo(x, y);
            pen = true;
            last = i;
        }
        cv.drawPath(path, p);
        if (last >= 0) {
            float x = v.length > 1 ? px + last * stepX : w / 2f;
            float y = (float) (py + (1 - (v[last] - min) / span) * (h - 2 * py));
            p.setStyle(Paint.Style.FILL);
            if (ring > 0) {
                p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
                cv.drawCircle(x, y, (dot + ring) * dp, p);
                p.setXfermode(null);
            }
            cv.drawCircle(x, y, dot * dp, p);
        }
        return b;
    }

    /** Sleep of the last seven nights as bars from 0 to 10 h, the last night full, the others lighter. */
    private static Bitmap bars(Draw g, JSONObject sleep, float wDp, float hDp) {
        if (sleep == null || wDp < 12) return null;
        double[] v = values(sleep.optJSONArray("nights"));
        if (known(v) == 0) return null;
        String key = "sleep:" + Math.round(wDp) + "x" + Math.round(hDp);
        Bitmap cached = g.charts.get(key);
        if (cached != null) return cached;
        float dp = g.dp;
        int w = Math.max(1, Math.round(wDp * dp));
        int h = Math.max(1, Math.round(hDp * dp));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        float slot = w / (float) v.length;
        for (int i = 0; i < v.length; i++) {
            if (Double.isNaN(v[i])) continue;
            float bh = Math.max(2 * dp, (float) Math.min(1, Math.max(0, v[i]) / 10) * h);
            float x0 = i * slot + slot * 0.18f;
            float bw = slot * 0.64f;
            float r = Math.min(2.5f * dp, bw / 2);
            p.setAlpha(i == v.length - 1 ? 255 : 140);
            cv.drawRoundRect(new RectF(x0, h - bh, x0 + bw, h), r, r, p);
        }
        g.charts.put(key, b);
        return b;
    }

    /** The session as blocks: width = time, height = % of FTP (full at 140%), colour = zone (the phone's mode now). */
    private static Bitmap profile(Draw g, JSONArray blocks, float wDp, float hDp) {
        if (blocks == null || blocks.length() == 0 || wDp < 20) return null;
        double total = 0;
        for (int i = 0; i < blocks.length(); i++) {
            JSONObject bl = blocks.optJSONObject(i);
            if (bl != null) total += Math.max(0, bl.optDouble("secs", 0));
        }
        if (total <= 0) return null;
        String key = "profile:" + Math.round(wDp) + "x" + Math.round(hDp);
        Bitmap cached = g.charts.get(key);
        if (cached != null) return cached;
        float dp = g.dp;
        int w = Math.max(1, Math.round(wDp * dp));
        int h = Math.max(1, Math.round(hDp * dp));
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float x = 0;
        for (int i = 0; i < blocks.length(); i++) {
            JSONObject bl = blocks.optJSONObject(i);
            if (bl == null) continue;
            float bw = (float) (Math.max(0, bl.optDouble("secs", 0)) / total * w);
            int zone = Math.max(1, Math.min(7, bl.optInt("zone", 1)));
            float bh = Math.max(dp, (float) (Math.min(140, Math.max(0, bl.optDouble("pct", 0))) / 140 * h));
            float gap = Math.min(0.5f * dp, bw / 4);
            p.setColor(g.color(ZONES[zone - 1]));
            cv.drawRect(x + gap, h - bh, x + bw - gap, h, p);
            x += bw;
        }
        g.charts.put(key, b);
        return b;
    }
}
