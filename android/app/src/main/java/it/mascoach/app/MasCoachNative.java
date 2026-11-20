package it.mascoach.app;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** What the web page cannot do by itself: keep the screen on, stay alive during a ride, colour the system bars, share and save files. */
@CapacitorPlugin(name = "MasCoachNative")
public class MasCoachNative extends Plugin {

    /** Screen always on while the trainer player is open. */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /** Foreground service: keeps Bluetooth and the session clock running with the screen off or another app in front. */
    @PluginMethod
    public void sessionService(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            Intent intent = new Intent(getContext(), SessionService.class);
            if (on) {
                if (Build.VERSION.SDK_INT >= 33
                        && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    // Without it the service still runs, only its notification stays hidden.
                    ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, 7001);
                }
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().stopService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Servizio non avviato: " + e.getMessage());
        }
    }

    /**
     * Writes a file (base64) in the cache and opens Android's share sheet on it: the WebView cannot download blobs.
     * `mime`: generic for the FIT of a session, image/png or image/jpeg for the picture of a ride (then the apps that take
     * pictures appear, and the sheet shows it). `title`: the title of the sheet.
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        final String name = call.getString("name", "mascoach.fit");
        final String data = call.getString("data", "");
        final String mime = call.getString("mime", "application/octet-stream");
        final String title = call.getString("title", "Salva o condividi il file FIT");
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("cartella non creata");
            File file = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .putExtra(Intent.EXTRA_SUBJECT, name)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // Also as ClipData: the sheet shows the picture and every app it is sent to can read the file.
            send.setClipData(ClipData.newRawUri(name, uri));
            Intent chooser = Intent.createChooser(send, title);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("File non condiviso: " + e.getMessage());
        }
    }

    /** Saves a picture (base64) in the gallery, in Pictures/MasCoach. From Android 10 no permission is needed. */
    @PluginMethod
    public void saveImage(PluginCall call) {
        final String name = call.getString("name", "mascoach.png");
        final String data = call.getString("data", "");
        final String mime = call.getString("mime", "image/png");
        if (Build.VERSION.SDK_INT < 29) {
            call.reject("su questa versione di Android si salva da «Condividi»");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/MasCoach");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
            if (uri == null) throw new IOException("galleria non disponibile");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("file non aperto");
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            call.resolve();
        } catch (Exception e) {
            if (uri != null) resolver.delete(uri, null, null);
            call.reject(e.getMessage() != null ? e.getMessage() : "immagine non salvata");
        }
    }

    /** Colour behind the status and navigation bars (the page's background) and light or dark icons on them. */
    @PluginMethod
    public void setBars(PluginCall call) {
        final String color = call.getString("color", "#12151f");
        final boolean lightIcons = Boolean.TRUE.equals(call.getBoolean("lightIcons", true));
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                int c = Color.parseColor(color);
                w.setBackgroundDrawable(new ColorDrawable(c));
                w.getDecorView().setBackgroundColor(c);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(w, w.getDecorView());
                controller.setAppearanceLightStatusBars(!lightIcons);
                controller.setAppearanceLightNavigationBars(!lightIcons);
                call.resolve();
            } catch (IllegalArgumentException e) {
                call.reject("Colore non valido");
            }
        });
    }

    /** Server and password for the home-screen widget (it asks /api/widget by itself, also at 8:00 with the app closed). */
    @PluginMethod
    public void widgetSetup(PluginCall call) {
        MasCoachWidget.configure(getContext(), call.getString("url", ""), call.getString("password", ""));
        MasCoachWidget.refreshAsync(getContext(), null);
        call.resolve();
    }

    /** Page a widget tap asked for (once): the app navigates to it. */
    @PluginMethod
    public void takeRoute(PluginCall call) {
        JSObject r = new JSObject();
        r.put("route", MainActivity.takeRoute());
        call.resolve(r);
    }
}
