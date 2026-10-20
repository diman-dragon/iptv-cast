package com.iptvcast.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.widget.ImageButton;
import android.widget.LinearLayout;

/**
 * The same round buttons in the viewing window of the Player tab and in the full-screen window:
 * one size, one look, one place (bottom right: quality, then full screen / exit full screen).
 */
final class PlayerButtons {
  private PlayerButtons() {}

  static int dp(Context ctx, int v) {
    return Math.round(v * ctx.getResources().getDisplayMetrics().density);
  }

  static ImageButton button(Context ctx, int icon, int description, View.OnClickListener click) {
    ImageButton b = new ImageButton(ctx);
    b.setImageResource(icon);
    b.setColorFilter(Color.WHITE);
    b.setContentDescription(ctx.getString(description));
    GradientDrawable bg = new GradientDrawable();
    bg.setShape(GradientDrawable.OVAL);
    bg.setColor(0x88000000);
    b.setBackground(bg);
    b.setOnClickListener(click);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(ctx, 40), dp(ctx, 40));
    lp.setMargins(dp(ctx, 4), dp(ctx, 4), dp(ctx, 4), dp(ctx, 8));
    b.setLayoutParams(lp);
    return b;
  }

  /** Bottom-right cluster. exit: show "exit full screen" instead of "full screen". */
  static LinearLayout cluster(Context ctx, View.OnClickListener quality, View.OnClickListener fullscreen, boolean exit) {
    LinearLayout bar = new LinearLayout(ctx);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.addView(button(ctx, R.drawable.ic_tune, R.string.player_quality, quality));
    bar.addView(
        button(
            ctx,
            exit ? R.drawable.ic_fullscreen_exit : R.drawable.ic_fullscreen,
            exit ? R.string.player_exit_fullscreen : R.string.player_fullscreen,
            fullscreen));
    return bar;
  }
}
