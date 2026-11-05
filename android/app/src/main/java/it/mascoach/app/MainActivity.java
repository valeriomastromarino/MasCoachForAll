package it.mascoach.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

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
        // The app is already open: tell the page now.
        String route = takeRoute();
        if (route != null && getBridge() != null) {
            getBridge().triggerWindowJSEvent("mascoach-route", "{\"route\":" + JSONObject.quote(route) + "}");
        }
    }
}
