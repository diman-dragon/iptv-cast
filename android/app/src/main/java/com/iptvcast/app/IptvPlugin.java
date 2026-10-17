package com.iptvcast.app;

import android.content.Intent;
import android.net.Uri;
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
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
  private CastContext cast;
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

  /** channel: {url, title, logo}. Sends the stream to the TV; the TV fetches it by URL itself. */
  @PluginMethod
  public void castLoad(PluginCall call) {
    String stream = call.getString("url");
    String name = call.getString("title", "");
    if (stream == null || stream.isEmpty()) {
      call.reject("url required");
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
              new MediaInfo.Builder(stream)
                  .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
                  .setContentType(contentType(stream))
                  .setMetadata(md)
                  .build();
          rc.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build());
          // The phone stops playing: the picture is on the TV now.
          ExoPlayer p = PlayerHolder.get(getContext());
          p.pause();
          call.resolve(castInfo());
        });
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
