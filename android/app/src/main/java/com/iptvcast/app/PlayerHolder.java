package com.iptvcast.app;

import android.content.Context;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import java.util.HashMap;
import java.util.Map;

/** One ExoPlayer for the whole app, shared by the plugin, the video screen and the playback service. */
final class PlayerHolder {
  static final String DEFAULT_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 IPTVCast";

  private static ExoPlayer player;
  // Headers can differ per channel: the factory is shared, we change its defaults before each start.
  private static final DefaultHttpDataSource.Factory HTTP =
      new DefaultHttpDataSource.Factory()
          .setAllowCrossProtocolRedirects(true)
          .setConnectTimeoutMs(15000)
          .setReadTimeoutMs(20000)
          .setUserAgent(DEFAULT_UA);

  private PlayerHolder() {}

  /** Must be called on the main thread. */
  static synchronized ExoPlayer get(Context ctx) {
    if (player == null) {
      Context app = ctx.getApplicationContext();
      player =
          new ExoPlayer.Builder(app)
              .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(app, HTTP)))
              .setAudioAttributes(
                  new AudioAttributes.Builder()
                      .setUsage(C.USAGE_MEDIA)
                      .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                      .build(),
                  true) // pause on calls and when another app takes audio focus
              .setHandleAudioBecomingNoisy(true) // pause when headphones are unplugged
              .setWakeMode(C.WAKE_MODE_NETWORK)
              .build();
    }
    return player;
  }

  /** User-Agent and Referer of the channel (from #EXTVLCOPT lines or the settings). */
  static void setHeaders(String userAgent, String referer) {
    HTTP.setUserAgent(userAgent == null || userAgent.isEmpty() ? DEFAULT_UA : userAgent);
    Map<String, String> headers = new HashMap<>();
    if (referer != null && !referer.isEmpty()) headers.put("Referer", referer);
    HTTP.setDefaultRequestProperties(headers);
  }

  static synchronized void release() {
    if (player != null) {
      player.release();
      player = null;
    }
  }
}
