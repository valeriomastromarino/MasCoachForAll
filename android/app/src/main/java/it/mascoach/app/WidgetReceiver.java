package it.mascoach.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The 8:00 alarm of the widget, its «Aggiorna», and the re-arming after a reboot or an app update. */
public class WidgetReceiver extends BroadcastReceiver {
    public static final String ACTION_REFRESH = "it.mascoach.app.WIDGET_REFRESH";
    /** «Aggiorna» on the widget: the site's day now, even over a recent one from the app. */
    public static final String ACTION_REFRESH_NOW = "it.mascoach.app.WIDGET_REFRESH_NOW";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action) || ACTION_REFRESH_NOW.equals(action)) {
            final boolean now = ACTION_REFRESH_NOW.equals(action);
            final PendingResult pending = goAsync();
            MasCoachWidget.refreshAsync(context, now, () -> {
                if (!now) MasCoachWidget.scheduleDaily(context);
                pending.finish();
            });
        } else {
            // Boot completed or app replaced: alarms are gone, set the next one and redraw (the new layouts, after an update).
            MasCoachWidget.scheduleDaily(context);
            MasCoachWidget.updateAll(context);
        }
    }
}
