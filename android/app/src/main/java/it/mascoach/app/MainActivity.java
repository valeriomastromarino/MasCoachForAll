package it.mascoach.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Page asked by a tap on the home-screen widget (see MasCoachWidget). */
    public static final String EXTRA_ROUTE = "route";
    private static String pendingRoute;

    /** The page to open, once: null when there is none. */
    public static synchronized String takeRoute() {
        String r = pendingRoute;
        pendingRoute = null;
        return r;
    }

    private static synchronized void remember(Intent intent) {
        if (intent != null && intent.hasExtra(EXTRA_ROUTE)) {
            pendingRoute = intent.getStringExtra(EXTRA_ROUTE);
            intent.removeExtra(EXTRA_ROUTE);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written for this app must be registered before the bridge starts.
        registerPlugin(MasCoachNative.class);
        remember(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        remember(intent);
        // Tell the page, which then asks for the route (takeRoute). The route stays here until the page takes it: when the app
        // was closed but its task was still among the recent ones, the activity comes back with onNewIntent while the page is
        // still loading, and the event finds nobody (before 22 November the route was taken here and lost: a widget tap
        // opened Oggi); the page asks at start-up too.
        if (intent != null && pendingRoute() != null && getBridge() != null) {
            getBridge().eval("window.Capacitor&&window.Capacitor.triggerEvent&&window.Capacitor.triggerEvent('mascoach-route','window')", null);
        }
    }

    private static synchronized String pendingRoute() {
        return pendingRoute;
    }
}
