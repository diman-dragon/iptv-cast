package com.iptvcast.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

/**
 * The viewing window of the "Player" tab: a native video view laid over the web page at the place the
 * page reserves for it. Two buttons sit inside the picture: quality and full screen.
 */
final class EmbeddedPlayer {
  private final AppCompatActivity activity;
  private final FrameLayout box;
  private final PlayerView view;
  private final TextView error;
  private boolean shown;

  private final Player.Listener listener =
      new Player.Listener() {
        @Override
        public void onPlayerError(PlaybackException e) {
          error.setText(PlayerErrors.explain(activity, e) + "\n" + e.getErrorCodeName());
          error.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPlaybackStateChanged(int state) {
          if (state == Player.STATE_READY) error.setVisibility(View.GONE);
        }

        @Override
        public void onIsPlayingChanged(boolean playing) {
          if (playing) error.setVisibility(View.GONE);
        }
      };

  EmbeddedPlayer(AppCompatActivity a) {
    activity = a;
    box = new FrameLayout(a);
    box.setBackgroundColor(Color.BLACK);

    view = new PlayerView(a);
    view.setUseController(false); // the buttons under the window belong to the web page
    view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
    view.setBackgroundColor(Color.BLACK);
    box.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    error = new TextView(a);
    error.setTextColor(Color.WHITE);
    error.setTextSize(13);
    error.setGravity(Gravity.CENTER);
    error.setPadding(dp(16), dp(8), dp(16), dp(8));
    error.setVisibility(View.GONE);
    box.addView(
        error, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

    LinearLayout bar = new LinearLayout(a);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.addView(button(R.drawable.ic_tune, R.string.player_quality, v -> QualityPicker.show(activity, PlayerHolder.get(activity))));
    bar.addView(
        button(R.drawable.ic_fullscreen, R.string.player_fullscreen, v -> activity.startActivity(new Intent(activity, PlayerActivity.class))));
    box.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END));
    box.setVisibility(View.GONE);
  }

  private int dp(int v) {
    return Math.round(v * activity.getResources().getDisplayMetrics().density);
  }

  private ImageButton button(int icon, int description, View.OnClickListener click) {
    ImageButton b = new ImageButton(activity);
    b.setImageResource(icon);
    b.setColorFilter(Color.WHITE);
    b.setContentDescription(activity.getString(description));
    GradientDrawable bg = new GradientDrawable();
    bg.setShape(GradientDrawable.OVAL);
    bg.setColor(0x88000000);
    b.setBackground(bg);
    b.setOnClickListener(click);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
    lp.setMargins(dp(4), dp(4), dp(4), dp(8));
    b.setLayoutParams(lp);
    return b;
  }

  /** Puts the window over the web page. x, y, w, h are CSS pixels measured inside the web view. */
  void show(View web, double x, double y, double w, double h) {
    ViewGroup root = activity.findViewById(android.R.id.content);
    if (box.getParent() == null) {
      root.addView(box, new FrameLayout.LayoutParams(1, 1));
    }
    float d = activity.getResources().getDisplayMetrics().density;
    int[] a = new int[2];
    int[] b = new int[2];
    web.getLocationInWindow(a);
    root.getLocationInWindow(b);
    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.round((float) w * d), Math.round((float) h * d), Gravity.TOP | Gravity.START);
    lp.leftMargin = a[0] - b[0] + Math.round((float) x * d);
    lp.topMargin = a[1] - b[1] + Math.round((float) y * d);
    box.setLayoutParams(lp);
    box.setVisibility(View.VISIBLE);
    box.bringToFront();
    attach();
  }

  private void attach() {
    ExoPlayer p = PlayerHolder.get(activity);
    p.removeListener(listener);
    p.addListener(listener);
    view.setPlayer(p);
    shown = true;
  }

  /** The app came back from the full-screen window: the picture has to be handed to this view again. */
  void reattach() {
    if (shown) attach();
  }

  void hide() {
    shown = false;
    box.setVisibility(View.GONE);
    Player p = view.getPlayer();
    if (p != null) p.removeListener(listener);
    view.setPlayer(null);
  }
}
