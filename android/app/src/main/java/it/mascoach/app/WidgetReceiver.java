package it.mascoach.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The 8:00 alarm of the widget, and the re-arming after a reboot or an app update. */
public class WidgetReceiver extends BroadcastReceiver {
    public static final String ACTION_REFRESH = "it.mascoach.app.WIDGET_REFRESH";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            final PendingResult pending = goAsync();
            MasCoachWidget.refreshAsync(context, () -> {
                MasCoachWidget.scheduleDaily(context);
                pending.finish();
            });
        } else {
            // Boot completed or app replaced: alarms are gone, set the next one and redraw.
            MasCoachWidget.scheduleDaily(context);
            MasCoachWidget.updateAll(context);
        }
    }
}
