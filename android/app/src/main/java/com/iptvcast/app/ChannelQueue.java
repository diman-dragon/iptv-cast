package com.iptvcast.app;

import android.content.Context;
import android.net.Uri;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.exoplayer.ExoPlayer;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * The list of channels around the one that is playing. It lives in native code so that
 * "previous / next" works from the video window without waking up the web UI.
 */
final class ChannelQueue {
  static final class Channel {
    final String url;
    final String title;
    final String sub;
    final String logo;
    final String ua;
    final String ref;

    Channel(String url, String title, String sub, String logo, String ua, String ref) {
      this.url = url;
      this.title = title;
      this.sub = sub;
      this.logo = logo;
      this.ua = ua;
      this.ref = ref;
    }

    static Channel from(JSONObject o) {
      return new Channel(
          o.optString("url"),
          o.optString("title"),
          o.optString("subtitle"),
          o.optString("logo"),
          o.optString("ua"),
          o.optString("ref"));
    }
  }

  /** Last player error code ("" when everything is fine). */
  static volatile String error = "";

  private static List<Channel> items = new ArrayList<>();
  private static int index = -1;

  private ChannelQueue() {}

  static synchronized void set(List<Channel> list, int i) {
    items = list;
    index = i;
  }

  static synchronized void clear() {
    items = new ArrayList<>();
    index = -1;
    error = "";
  }

  static synchronized Channel current() {
    return index >= 0 && index < items.size() ? items.get(index) : null;
  }

  static synchronized boolean hasPrev() {
    return index > 0;
  }

  static synchronized boolean hasNext() {
    return index >= 0 && index < items.size() - 1;
  }

  /** Moves by step; false when there is nowhere to go. */
  static synchronized boolean move(int step) {
    int n = index + step;
    if (n < 0 || n >= items.size()) return false;
    index = n;
    return true;
  }

  /** Starts the current channel on the shared player. Main thread only. */
  static void start(Context ctx) {
    Channel c = current();
    if (c == null) return;
    error = "";
    PlayerHolder.setHeaders(c.ua, c.ref);
    ExoPlayer p = PlayerHolder.get(ctx);
    MediaMetadata.Builder md = new MediaMetadata.Builder().setTitle(c.title).setArtist(c.sub);
    if (c.logo.startsWith("http")) md.setArtworkUri(Uri.parse(c.logo));
    p.setMediaItem(
        new MediaItem.Builder().setUri(c.url).setMediaId(c.url).setMediaMetadata(md.build()).build());
    p.setVolume(1f);
    p.prepare();
    p.play();
  }
}
