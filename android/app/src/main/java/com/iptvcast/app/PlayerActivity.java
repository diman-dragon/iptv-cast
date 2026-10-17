package com.iptvcast.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Toast;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Timeline;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeSet;

/**
 * The video window: full screen, with a close button, the system Back, transport controls,
 * previous / next channel, and a readable reason when a stream does not play.
 */
public class PlayerActivity extends AppCompatActivity {
  private PlayerView view;
  private LinearLayout topBar;
  private LinearLayout errorBox;
  private TextView titleView;
  private TextView errorText;
  private ImageButton prevBtn;
  private ImageButton nextBtn;

  private final Player.Listener listener =
      new Player.Listener() {
        @Override
        public void onPlayerError(PlaybackException e) {
          showError(e);
        }

        @Override
        public void onPlaybackStateChanged(int state) {
          if (state == Player.STATE_READY) errorBox.setVisibility(View.GONE);
          updateLiveUi();
        }

        @Override
        public void onTimelineChanged(Timeline timeline, int reason) {
          updateLiveUi();
        }

        @Override
        public void onTracksChanged(Tracks tracks) {
          updateLiveUi();
        }

        @Override
        public void onIsPlayingChanged(boolean playing) {
          if (playing) errorBox.setVisibility(View.GONE);
        }

        @Override
        public void onMediaItemTransition(MediaItem item, int reason) {
          refreshTitle();
        }

        @Override
        public void onMediaMetadataChanged(MediaMetadata metadata) {
          refreshTitle();
        }
      };

  private int dp(int v) {
    return Math.round(v * getResources().getDisplayMetrics().density);
  }

  private ImageButton iconButton(int res, int descRes, View.OnClickListener click) {
    ImageButton b = new ImageButton(this);
    b.setImageResource(res);
    b.setBackground(null);
    b.setColorFilter(Color.WHITE);
    b.setContentDescription(getString(descRes));
    b.setOnClickListener(click);
    b.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48)));
    return b;
  }

  @Override
  protected void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.BLACK);

    view = new PlayerView(this);
    view.setBackgroundColor(Color.BLACK);
    view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
    view.setControllerShowTimeoutMs(4000);
    view.setControllerHideOnTouch(true);
    // «Предыдущий / следующий» — это каналы, они сверху; в нижнем ряду только пауза.
    view.setShowNextButton(false);
    view.setShowPreviousButton(false);
    // Шестерёнка внизу плеера — выбор качества (вместо скорости и звуковых дорожек, они для эфира не нужны).
    View gear = controlView("exo_settings");
    if (gear != null) {
      gear.setVisibility(View.VISIBLE);
      gear.setContentDescription(getString(R.string.player_quality));
      gear.setOnClickListener(v -> showQualityDialog());
    }
    root.addView(
        view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    // Top bar: close, title, previous / next. It follows the controller: tap the picture to hide or show.
    topBar = new LinearLayout(this);
    topBar.setOrientation(LinearLayout.HORIZONTAL);
    topBar.setGravity(Gravity.CENTER_VERTICAL);
    topBar.setBackground(
        new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {0xCC000000, 0x00000000}));
    topBar.setPadding(dp(8), dp(8), dp(8), dp(24));

    ImageButton close = iconButton(R.drawable.ic_close, R.string.player_close, v -> closePlayer());
    titleView = new TextView(this);
    titleView.setTextColor(Color.WHITE);
    titleView.setTextSize(17);
    titleView.setTypeface(null, Typeface.BOLD);
    titleView.setSingleLine(true);
    titleView.setEllipsize(TextUtils.TruncateAt.END);
    titleView.setPadding(dp(4), 0, dp(8), 0);
    prevBtn = iconButton(R.drawable.ic_prev, R.string.player_prev, v -> zap(-1));
    nextBtn = iconButton(R.drawable.ic_next, R.string.player_next, v -> zap(1));
    topBar.addView(close);
    topBar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    topBar.addView(prevBtn);
    topBar.addView(nextBtn);
    root.addView(
        topBar,
        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

    // Error box in the middle: what went wrong and a retry button.
    errorBox = new LinearLayout(this);
    errorBox.setOrientation(LinearLayout.VERTICAL);
    errorBox.setGravity(Gravity.CENTER_HORIZONTAL);
    errorBox.setPadding(dp(24), dp(20), dp(24), dp(20));
    GradientDrawable boxBg = new GradientDrawable();
    boxBg.setColor(0xDD111318);
    boxBg.setCornerRadius(dp(18));
    errorBox.setBackground(boxBg);
    errorText = new TextView(this);
    errorText.setTextColor(Color.WHITE);
    errorText.setTextSize(15);
    errorText.setGravity(Gravity.CENTER);
    Button retry = new Button(this);
    retry.setText(R.string.player_retry);
    retry.setOnClickListener(
        v -> {
          errorBox.setVisibility(View.GONE);
          ExoPlayer p = PlayerHolder.get(this);
          p.prepare();
          p.play();
        });
    errorBox.addView(errorText);
    LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    rp.topMargin = dp(14);
    errorBox.addView(retry, rp);
    errorBox.setVisibility(View.GONE);
    FrameLayout.LayoutParams ep =
        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
    ep.leftMargin = dp(24);
    ep.rightMargin = dp(24);
    root.addView(errorBox, ep);

    setContentView(root);

    // Keep the top bar clear of the notch and the status bar when they are visible.
    ViewCompat.setOnApplyWindowInsetsListener(
        root,
        (v, insets) -> {
          Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          topBar.setPadding(dp(8) + i.left, dp(8) + i.top, dp(8) + i.right, dp(24));
          return insets;
        });

    view.setControllerVisibilityListener(
        new PlayerView.ControllerVisibilityListener() {
          @Override
          public void onVisibilityChanged(int visibility) {
            topBar.setVisibility(visibility);
          }
        });

    // System Back / gesture closes the window and stops the channel.
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                closePlayer();
              }
            });

    hideBars();
    refreshTitle();
  }

  private void hideBars() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), view);
    c.hide(WindowInsetsCompat.Type.systemBars());
    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
  }

  /** A view of the stock player controls, found by its id name (null when this version has none). */
  private View controlView(String name) {
    int id = getResources().getIdentifier(name, "id", getPackageName());
    return id == 0 ? null : view.findViewById(id);
  }

  /** TV is a live stream: a progress bar and the time make no sense there. Files (VOD) keep them. */
  private void updateLiveUi() {
    Player p = view.getPlayer();
    boolean live = p == null || p.isCurrentMediaItemLive() || p.getDuration() == C.TIME_UNSET;
    int vis = live ? View.GONE : View.VISIBLE;
    for (String name : new String[] {"exo_progress", "exo_position", "exo_duration", "exo_time"}) {
      View v = controlView(name);
      if (v != null) v.setVisibility(vis);
    }
  }

  /** Quality = the highest picture height the player may choose (it still adapts below that). */
  private void showQualityDialog() {
    ExoPlayer p = PlayerHolder.get(this);
    TreeSet<Integer> found = new TreeSet<>(Collections.reverseOrder());
    for (Tracks.Group g : p.getCurrentTracks().getGroups()) {
      if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
      for (int i = 0; i < g.length; i++) {
        int h = g.getTrackFormat(i).height;
        if (g.isTrackSupported(i) && h > 0) found.add(h);
      }
    }
    if (found.size() < 2) {
      Toast.makeText(this, R.string.player_quality_none, Toast.LENGTH_SHORT).show();
      return;
    }
    List<Integer> heights = new ArrayList<>(found);
    String[] labels = new String[heights.size() + 1];
    labels[0] = getString(R.string.player_quality_auto);
    int limit = p.getTrackSelectionParameters().maxVideoHeight; // Integer.MAX_VALUE = auto
    int checked = 0;
    for (int i = 0; i < heights.size(); i++) {
      labels[i + 1] = heights.get(i) + "p";
      if (heights.get(i) == limit) checked = i + 1;
    }
    new AlertDialog.Builder(this)
        .setTitle(R.string.player_quality)
        .setSingleChoiceItems(
            labels,
            checked,
            (dialog, which) -> {
              TrackSelectionParameters.Builder b = p.getTrackSelectionParameters().buildUpon();
              b.setMaxVideoSize(Integer.MAX_VALUE, which == 0 ? Integer.MAX_VALUE : heights.get(which - 1));
              p.setTrackSelectionParameters(b.build());
              dialog.dismiss();
              view.showController();
            })
        .show();
  }

  private void refreshTitle() {
    ChannelQueue.Channel c = ChannelQueue.current();
    titleView.setText(c == null ? "" : c.title);
    prevBtn.setVisibility(ChannelQueue.hasPrev() ? View.VISIBLE : View.INVISIBLE);
    nextBtn.setVisibility(ChannelQueue.hasNext() ? View.VISIBLE : View.INVISIBLE);
  }

  private void zap(int step) {
    if (!ChannelQueue.move(step)) return;
    errorBox.setVisibility(View.GONE);
    ChannelQueue.start(this);
    refreshTitle();
  }

  /** ✕ or Back: stop the channel and leave. (Home goes to picture-in-picture when the stream is playing.) */
  private void closePlayer() {
    ExoPlayer p = PlayerHolder.get(this);
    p.stop();
    p.clearMediaItems();
    ChannelQueue.clear();
    finish();
  }

  private String explain(PlaybackException e) {
    Throwable cause = e.getCause();
    if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
      return getString(R.string.err_http, ((HttpDataSource.InvalidResponseCodeException) cause).responseCode);
    }
    switch (e.errorCode) {
      case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
      case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
      case PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED:
        return getString(R.string.err_net);
      case PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS:
      case PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND:
        return getString(R.string.err_gone);
      case PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED:
      case PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED:
      case PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED:
      case PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED:
      case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
      case PlaybackException.ERROR_CODE_DECODING_FAILED:
      case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
        return getString(R.string.err_format);
      default:
        return getString(R.string.err_generic);
    }
  }

  private void showError(PlaybackException e) {
    if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
      // The live stream ran ahead: jump to the live edge and try again.
      ExoPlayer p = PlayerHolder.get(this);
      p.seekToDefaultPosition();
      p.prepare();
      return;
    }
    errorText.setText(explain(e) + "\n\n" + e.getErrorCodeName());
    errorBox.setVisibility(View.VISIBLE);
    view.showController();
  }

  @Override
  protected void onStart() {
    super.onStart();
    ExoPlayer p = PlayerHolder.get(this);
    p.addListener(listener);
    view.setPlayer(p);
    view.showController();
    refreshTitle();
    updateLiveUi();
    PlaybackException pending = p.getPlayerError();
    if (pending != null) showError(pending);
  }

  @Override
  protected void onStop() {
    super.onStop();
    ExoPlayer p = PlayerHolder.get(this);
    p.removeListener(listener);
    p.pause(); // no background playback and no notification: the picture is gone, so is the sound
    view.setPlayer(null);
  }

  @Override
  protected void onUserLeaveHint() {
    super.onUserLeaveHint();
    Player p = view.getPlayer();
    if (Build.VERSION.SDK_INT >= 26 && p != null && p.isPlaying()) {
      try {
        enterPictureInPictureMode(
            new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build());
      } catch (Exception ignored) {
        // picture-in-picture is not available on this device
      }
    }
  }

  @RequiresApi(Build.VERSION_CODES.O)
  @Override
  public void onPictureInPictureModeChanged(boolean inPip, Configuration config) {
    super.onPictureInPictureModeChanged(inPip, config);
    view.setUseController(!inPip);
    topBar.setVisibility(inPip ? View.GONE : View.VISIBLE);
  }
}
