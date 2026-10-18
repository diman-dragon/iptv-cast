package com.iptvcast.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.GoogleApiAvailability;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.json.JSONException;

/**
 * Bridge between the web UI and the native side: playback (Media3), sleep timer,
 * Google Cast and "open in another app".
 */
@CapacitorPlugin(name = "Iptv")
public class IptvPlugin extends Plugin {
  private static final long FADE_MS = 15_000;

  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newFixedThreadPool(6); // network work never runs on the main thread
  private CastContext cast;
  private RemoteMediaClient.Callback castCallback;
  private RemoteMediaClient castCallbackOwner;
  private ExoPlayer listened;
  private boolean moved = true; // result of the last zap
  private long sleepEnd = 0; // SystemClock.elapsedRealtime() deadline, 0 = off

  // ------------------------------------------------------------------ lifecycle

  @Override
  public void load() {
    try {
      CastContext.getSharedInstance(getContext(), Executors.newSingleThreadExecutor())
          .addOnSuccessListener(
              c -> {
                cast = c;
                c.getSessionManager().addSessionManagerListener(castListener, CastSession.class);
                notifyListeners("cast", castInfo());
              });
    } catch (Throwable ignored) {
      // no Google Play services: everything except Cast keeps working
    }
  }

  // ------------------------------------------------------------------ player

  /** ExoPlayer lives on the main thread; plugin calls arrive on another one. Resolves with the new state. */
  private void onPlayer(PluginCall call, Consumer<ExoPlayer> job) {
    main.post(
        () -> {
          try {
            ExoPlayer p = PlayerHolder.get(getContext());
            watch(p);
            job.accept(p);
            call.resolve(stateOf(p));
          } catch (Exception e) {
            call.reject("player: " + e.getMessage());
          }
        });
  }

  /** Changes from outside (notification, headset, a call) reach JavaScript at once. */
  private void watch(ExoPlayer p) {
    if (p == listened) return;
    listened = p;
    p.addListener(
        new Player.Listener() {
          @Override
          public void onIsPlayingChanged(boolean playing) {
            if (playing) ChannelQueue.error = "";
            push(p);
          }

          @Override
          public void onPlaybackStateChanged(int state) {
            push(p);
          }

          @Override
          public void onPlayerError(PlaybackException e) {
            ChannelQueue.error = e.getErrorCodeName();
            push(p);
          }
        });
  }

  private void push(Player p) {
    notifyListeners("state", stateOf(p));
  }

  private JSObject stateOf(Player p) {
    ChannelQueue.Channel c = ChannelQueue.current();
    JSObject o = new JSObject();
    o.put("loaded", p.getMediaItemCount() > 0);
    o.put("playing", p.isPlaying());
    o.put("loading", p.getPlaybackState() == Player.STATE_BUFFERING);
    o.put("error", ChannelQueue.error);
    o.put("title", c == null ? "" : c.title);
    o.put("url", c == null ? "" : c.url);
    o.put("sub", c == null ? "" : c.sub);
    o.put("logo", c == null ? "" : c.logo);
    o.put("hasPrev", ChannelQueue.hasPrev());
    o.put("hasNext", ChannelQueue.hasNext());
    o.put("moved", moved);
    o.put("sleepLeft", sleepEnd == 0 ? 0 : Math.max(0, (sleepEnd - SystemClock.elapsedRealtime()) / 1000));
    return o;
  }

  /**
   * Plays a channel. {url, title, subtitle, logo, ua, ref} plus optionally queue: [channel, ...] and
   * index: the position in the queue, so previous / next work natively.
   */
  @PluginMethod
  public void play(PluginCall call) {
    List<ChannelQueue.Channel> list = new ArrayList<>();
    int index = call.getInt("index", 0);
    JSArray queue = call.getArray("queue");
    try {
      if (queue != null) {
        for (int i = 0; i < queue.length(); i++) list.add(ChannelQueue.Channel.from(queue.getJSONObject(i)));
      }
    } catch (JSONException e) {
      call.reject("bad queue");
      return;
    }
    if (list.isEmpty()) {
      String stream = call.getString("url");
      if (stream == null || stream.isEmpty()) {
        call.reject("url required");
        return;
      }
      list.add(
          new ChannelQueue.Channel(
              stream,
              call.getString("title", ""),
              call.getString("subtitle", ""),
              call.getString("logo", ""),
              call.getString("ua", ""),
              call.getString("ref", "")));
      index = 0;
    }
    final int start = Math.max(0, Math.min(index, list.size() - 1));
    onPlayer(
        call,
        p -> {
          moved = true;
          ChannelQueue.set(list, start);
          ChannelQueue.start(getContext());
          if (Boolean.TRUE.equals(call.getBoolean("video", false))) {
            getActivity().startActivity(new Intent(getContext(), PlayerActivity.class));
          }
        });
  }

  /** step: +1 next, -1 previous. The state tells whether it moved. */
  @PluginMethod
  public void zap(PluginCall call) {
    int step = call.getInt("step", 1);
    onPlayer(
        call,
        p -> {
          moved = ChannelQueue.move(step);
          if (moved) ChannelQueue.start(getContext());
        });
  }

  @PluginMethod
  public void pause(PluginCall call) {
    onPlayer(call, Player::pause);
  }

  @PluginMethod
  public void resume(PluginCall call) {
    onPlayer(call, Player::play);
  }

  @PluginMethod
  public void stop(PluginCall call) {
    onPlayer(
        call,
        p -> {
          sleepEnd = 0;
          p.stop();
          p.clearMediaItems();
          ChannelQueue.clear();
        });
  }

  @PluginMethod
  public void state(PluginCall call) {
    onPlayer(call, p -> {});
  }

  /** Opens the full-screen video on the same player. */
  @PluginMethod
  public void openVideo(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              getActivity().startActivity(new Intent(getContext(), PlayerActivity.class));
              call.resolve();
            });
  }

  /** "Open in another app": VLC, MX Player, a DLNA app, a TV box... */
  @PluginMethod
  public void openExternal(PluginCall call) {
    String stream = call.getString("url");
    if (stream == null || stream.isEmpty()) {
      call.reject("url required");
      return;
    }
    getActivity()
        .runOnUiThread(
            () -> {
              try {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(Uri.parse(stream), "video/*");
                view.putExtra("title", call.getString("title", ""));
                getActivity().startActivity(Intent.createChooser(view, call.getString("title", "")));
                call.resolve();
              } catch (Exception e) {
                call.reject("no app: " + e.getMessage());
              }
            });
  }

  // ------------------------------------------------------------------ sleep timer

  /** minutes > 0: pause after N minutes (the last 15 seconds fade out); 0: off. */
  @PluginMethod
  public void sleep(PluginCall call) {
    int minutes = call.getInt("minutes", 0);
    onPlayer(
        call,
        p -> {
          main.removeCallbacks(sleepTick);
          p.setVolume(1f);
          if (minutes > 0) {
            sleepEnd = SystemClock.elapsedRealtime() + minutes * 60_000L;
            main.post(sleepTick);
          } else {
            sleepEnd = 0;
          }
        });
  }

  private final Runnable sleepTick =
      new Runnable() {
        @Override
        public void run() {
          if (sleepEnd == 0) return;
          ExoPlayer p = PlayerHolder.get(getContext());
          long left = sleepEnd - SystemClock.elapsedRealtime();
          if (left <= 0) {
            sleepEnd = 0;
            p.pause();
            p.setVolume(1f);
            RemoteMediaClient rc = remoteClient();
            if (rc != null) rc.pause();
            push(p);
            return;
          }
          p.setVolume(left < FADE_MS ? (float) left / FADE_MS : 1f);
          main.postDelayed(this, left < FADE_MS ? 250 : 1000);
        }
      };

  // ------------------------------------------------------------------ Google Cast

  private final SessionManagerListener<CastSession> castListener =
      new SessionManagerListener<CastSession>() {
        private void changed() {
          notifyListeners("cast", castInfo());
        }

        @Override public void onSessionStarting(CastSession s) {}
        @Override public void onSessionStarted(CastSession s, String id) { changed(); }
        @Override public void onSessionStartFailed(CastSession s, int e) { changed(); }
        @Override public void onSessionEnding(CastSession s) {}
        @Override public void onSessionEnded(CastSession s, int e) { changed(); }
        @Override public void onSessionResuming(CastSession s, String id) {}
        @Override public void onSessionResumed(CastSession s, boolean wasSuspended) { changed(); }
        @Override public void onSessionResumeFailed(CastSession s, int e) { changed(); }
        @Override public void onSessionSuspended(CastSession s, int reason) { changed(); }
      };

  /** Main thread only. */
  private CastSession session() {
    if (cast == null) return null;
    CastSession s = cast.getSessionManager().getCurrentCastSession();
    return s != null && s.isConnected() ? s : null;
  }

  private RemoteMediaClient remoteClient() {
    CastSession s = session();
    return s == null ? null : s.getRemoteMediaClient();
  }

  private JSObject castInfo() {
    JSObject o = new JSObject();
    CastSession s = session();
    o.put("available", cast != null);
    o.put("connected", s != null);
    o.put("device", s != null && s.getCastDevice() != null ? s.getCastDevice().getFriendlyName() : "");
    return o;
  }

  @PluginMethod
  public void castState(PluginCall call) {
    main.post(() -> call.resolve(castInfo()));
  }

  /** The system list of TVs on the local network. After a TV is chosen the "cast" event fires. */
  @PluginMethod
  public void castPicker(PluginCall call) {
    if (cast == null) {
      call.reject("Cast is not available on this device");
      return;
    }
    getActivity()
        .runOnUiThread(
            () -> {
              MediaRouteChooserDialog d = new MediaRouteChooserDialog(getActivity());
              d.setRouteSelector(cast.getMergedSelector());
              d.show();
              call.resolve();
            });
  }

  /**
   * channel: {url, title, logo, ua, ref, proxy}. Sends the stream to the TV. With proxy (default) the TV
   * receives an address on this phone, which adds the CORS headers a Chromecast insists on, sends the
   * User-Agent / Referer the stream wants, and rewrites HLS playlists.
   */
  @PluginMethod
  public void castLoad(PluginCall call) {
    final String stream = call.getString("url");
    final String name = call.getString("title", "");
    final String ua = call.getString("ua", "");
    final String ref = call.getString("ref", "");
    final boolean proxy = !Boolean.FALSE.equals(call.getBoolean("proxy", true));
    if (stream == null || stream.isEmpty()) {
      call.reject("url required");
      return;
    }
    io.execute(
        () -> {
          final String address;
          try {
            address = proxy ? proxied(stream, ua, ref) : stream;
          } catch (IOException e) {
            call.reject(e.getMessage());
            return;
          }
          main.post(
              () -> {
                RemoteMediaClient rc = remoteClient();
                if (rc == null) {
                  call.reject("No active Cast session");
                  return;
                }
                com.google.android.gms.cast.MediaMetadata md =
                    new com.google.android.gms.cast.MediaMetadata(
                        com.google.android.gms.cast.MediaMetadata.MEDIA_TYPE_GENERIC);
                md.putString(com.google.android.gms.cast.MediaMetadata.KEY_TITLE, name);
                MediaInfo info =
                    new MediaInfo.Builder(address)
                        .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
                        .setContentType(contentType(stream))
                        .setMetadata(md)
                        .build();
                watchCast(rc);
                rc.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build())
                    .setResultCallback(
                        r -> {
                          if (!r.getStatus().isSuccess()) castFailed("load " + r.getStatus().getStatusCode());
                        });
                // The phone stops playing: the picture is on the TV now.
                PlayerHolder.get(getContext()).pause();
                call.resolve(castInfo());
              });
        });
  }

  /** The receiver accepted the request but could not play the stream: tell the web UI why. */
  private void castFailed(String message) {
    JSObject e = new JSObject();
    e.put("message", message);
    notifyListeners("castError", e);
  }

  private void watchCast(RemoteMediaClient rc) {
    if (castCallbackOwner == rc) return;
    if (castCallbackOwner != null && castCallback != null) castCallbackOwner.unregisterCallback(castCallback);
    castCallback =
        new RemoteMediaClient.Callback() {
          @Override
          public void onStatusUpdated() {
            MediaStatus ms = rc.getMediaStatus();
            if (ms != null
                && ms.getPlayerState() == MediaStatus.PLAYER_STATE_IDLE
                && ms.getIdleReason() == MediaStatus.IDLE_REASON_ERROR) {
              castFailed("receiver");
            }
          }
        };
    rc.registerCallback(castCallback);
    castCallbackOwner = rc;
  }

  /** The address of the stream on this phone's proxy (blocking: not for the main thread). */
  private static String proxied(String stream, String ua, String ref) throws IOException {
    if (StreamProxy.localIp() == null) throw new IOException("no local network (Wi-Fi)");
    return StreamProxy.get().urlFor(stream, ua, ref);
  }

  // ------------------------------------------------------------------ stream check

  /** Is there a stream at this address? {url, ua, ref, timeout} -> {ok, reason, code, info, ms}. */
  @PluginMethod
  public void probe(PluginCall call) {
    final String stream = call.getString("url");
    if (stream == null || stream.isEmpty()) {
      call.reject("url required");
      return;
    }
    final String ua = call.getString("ua", "");
    final String ref = call.getString("ref", "");
    final int timeout = call.getInt("timeout", 8000);
    io.execute(
        () -> {
          Prober.Result r = Prober.probe(stream, ua, ref, timeout);
          JSObject o = new JSObject();
          o.put("ok", r.ok);
          o.put("reason", r.reason);
          o.put("code", r.code);
          o.put("info", r.info);
          o.put("ms", r.ms);
          call.resolve(o);
        });
  }

  // ------------------------------------------------------------------ DLNA

  /** TVs on the local network that can play a stream by address (Samsung, LG, Sony, Philips...). */
  @PluginMethod
  public void dlnaScan(PluginCall call) {
    final int timeout = call.getInt("timeout", 3500);
    io.execute(
        () -> {
          WifiManager.MulticastLock lock = null;
          try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
              lock = wm.createMulticastLock("iptvcast-ssdp");
              lock.setReferenceCounted(false);
              lock.acquire();
            }
            JSArray devices = new JSArray();
            for (Dlna.Device d : Dlna.discover(timeout)) {
              JSObject o = new JSObject();
              o.put("name", d.name);
              o.put("location", d.location);
              o.put("controlUrl", d.controlUrl);
              o.put("serviceType", d.serviceType);
              devices.put(o);
            }
            JSObject res = new JSObject();
            res.put("devices", devices);
            call.resolve(res);
          } catch (Exception e) {
            call.reject("dlna: " + e.getMessage());
          } finally {
            if (lock != null && lock.isHeld()) lock.release();
          }
        });
  }

  private static Dlna.Device deviceOf(PluginCall call) {
    String control = call.getString("controlUrl");
    String type = call.getString("serviceType");
    if (control == null || type == null) return null;
    return new Dlna.Device(call.getString("name", ""), call.getString("location", ""), control, type);
  }

  /** {name, location, controlUrl, serviceType} of the TV + {url, title, ua, ref, proxy}. */
  @PluginMethod
  public void dlnaPlay(PluginCall call) {
    final Dlna.Device d = deviceOf(call);
    final String stream = call.getString("url");
    if (d == null || stream == null || stream.isEmpty()) {
      call.reject("device and url required");
      return;
    }
    final String title = call.getString("title", "");
    final String ua = call.getString("ua", "");
    final String ref = call.getString("ref", "");
    final boolean proxy = Boolean.TRUE.equals(call.getBoolean("proxy", false));
    io.execute(
        () -> {
          try {
            String address = proxy ? proxied(stream, ua, ref) : stream;
            String mime = contentType(stream).equals("application/x-mpegURL") ? "application/vnd.apple.mpegurl" : "video/mpeg";
            Dlna.play(d, address, title, mime);
            main.post(() -> PlayerHolder.get(getContext()).pause());
            call.resolve();
          } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
          }
        });
  }

  /** action: "play" | "pause" | "stop", plus the TV's fields. */
  @PluginMethod
  public void dlnaControl(PluginCall call) {
    final Dlna.Device d = deviceOf(call);
    if (d == null) {
      call.reject("device required");
      return;
    }
    final String action = call.getString("action", "pause");
    io.execute(
        () -> {
          try {
            if ("play".equals(action)) Dlna.resume(d);
            else if ("stop".equals(action)) Dlna.stop(d);
            else Dlna.pause(d);
            call.resolve();
          } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
          }
        });
  }

  /** For diagnostics: the phone's address, Google Play services status, Cast readiness. */
  @PluginMethod
  public void netInfo(PluginCall call) {
    JSObject o = new JSObject();
    String ip = StreamProxy.localIp();
    o.put("ip", ip == null ? "" : ip);
    int gms = -1; // 0 = Google Play services are available
    try {
      gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
    } catch (Throwable ignored) {
      // no Play services at all
    }
    o.put("gms", gms);
    o.put("castReady", cast != null);
    call.resolve(o);
  }

  /** action: "play" | "pause". */
  @PluginMethod
  public void castControl(PluginCall call) {
    String action = call.getString("action", "pause");
    main.post(
        () -> {
          RemoteMediaClient rc = remoteClient();
          if (rc != null) {
            if ("play".equals(action)) rc.play();
            else rc.pause();
          }
          call.resolve(castInfo());
        });
  }

  /** Disconnects from the TV and stops the receiver. */
  @PluginMethod
  public void castStop(PluginCall call) {
    main.post(
        () -> {
          if (cast != null) cast.getSessionManager().endCurrentSession(true);
          call.resolve(castInfo());
        });
  }

  private static String contentType(String stream) {
    String u = stream.toLowerCase(Locale.ROOT);
    int q = u.indexOf('?');
    if (q > 0) u = u.substring(0, q);
    if (u.endsWith(".m3u8") || u.contains("/hls") || u.contains("m3u8")) return "application/x-mpegURL";
    if (u.endsWith(".mpd")) return "application/dash+xml";
    if (u.endsWith(".mp4")) return "video/mp4";
    if (u.endsWith(".mp3")) return "audio/mpeg";
    if (u.endsWith(".aac")) return "audio/aac";
    return "video/mp2t";
  }
}
