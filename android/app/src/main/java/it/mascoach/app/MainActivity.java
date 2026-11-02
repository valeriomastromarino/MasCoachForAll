package it.mascoach.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written for this app must be registered before the bridge starts.
        registerPlugin(MasCoachNative.class);
        super.onCreate(savedInstanceState);
    }
}
