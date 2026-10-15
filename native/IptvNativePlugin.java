package app.iptvcast.player;

import android.content.Intent;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "IptvNative")
public class IptvNativePlugin extends Plugin {
    private CastContext castContext;

    @Override
    public void load() {
        try {
            CastContext.getSharedInstance(getContext(), Executors.newSingleThreadExecutor())
                .addOnSuccessListener(c -> castContext = c);
        } catch (Throwable ignored) { /* нет Google Play Services */ }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("url required"); return; }
        Intent i = new Intent(getContext(), PlayerActivity.class);
        i.putExtra("url", url);
        i.putExtra("title", call.getString("title", ""));
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void castPicker(PluginCall call) {
        if (castContext == null) { call.reject("Cast недоступен на этом устройстве"); return; }
        getActivity().runOnUiThread(() -> {
            MediaRouteChooserDialog d = new MediaRouteChooserDialog(getActivity());
            d.setRouteSelector(castContext.getMergedSelector());
            d.show();
            call.resolve();
        });
    }

    @PluginMethod
    public void castState(PluginCall call) {
        JSObject r = new JSObject();
        if (castContext == null) { r.put("connected", false); call.resolve(r); return; }
        getActivity().runOnUiThread(() -> {
            CastSession s = castContext.getSessionManager().getCurrentCastSession();
            boolean ok = s != null && s.isConnected();
            r.put("connected", ok);
            r.put("device", ok && s.getCastDevice() != null ? s.getCastDevice().getFriendlyName() : "");
            call.resolve(r);
        });
    }

    @PluginMethod
    public void castLoad(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "");
        if (castContext == null || url == null) { call.reject("Cast недоступен"); return; }
        getActivity().runOnUiThread(() -> {
            CastSession s = castContext.getSessionManager().getCurrentCastSession();
            if (s == null || !s.isConnected() || s.getRemoteMediaClient() == null) {
                call.reject("Нет активной Cast-сессии"); return;
            }
            MediaMetadata md = new MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC);
            md.putString(MediaMetadata.KEY_TITLE, title);
            String type = url.toLowerCase().contains(".m3u8") ? "application/x-mpegURL" : "video/mp2t";
            MediaInfo info = new MediaInfo.Builder(url)
                .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
                .setContentType(type).setMetadata(md).build();
            s.getRemoteMediaClient().load(new MediaLoadRequestData.Builder()
                .setMediaInfo(info).setAutoplay(true).build());
            call.resolve();
        });
    }

    @PluginMethod
    public void castStop(PluginCall call) {
        if (castContext != null) getActivity().runOnUiThread(() ->
            castContext.getSessionManager().endCurrentSession(true));
        call.resolve();
    }
}
