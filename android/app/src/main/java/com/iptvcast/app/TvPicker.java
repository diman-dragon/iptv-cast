package com.iptvcast.app;

import android.content.Context;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

/**
 * "Show on TV", the only place in the app where a channel is sent to a TV: Chromecast / Google TV
 * (the system list) and DLNA TVs found on the network. After a TV is chosen the phone goes dark.
 */
final class TvPicker {
  private TvPicker() {}

  static void show(final AppCompatActivity host) {
    final IptvPlugin plugin = IptvPlugin.instance;
    final ChannelQueue.Channel channel = ChannelQueue.current();
    if (plugin == null || channel == null) {
      Toast.makeText(host, R.string.tv_unavailable, Toast.LENGTH_LONG).show();
      return;
    }
    LinearLayout box = new LinearLayout(host);
    box.setOrientation(LinearLayout.VERTICAL);
    int pad = dp(host, 16);
    box.setPadding(pad, dp(host, 4), pad, 0);
    ScrollView scroll = new ScrollView(host);
    scroll.addView(box);

    final AlertDialog dialog =
        new AlertDialog.Builder(host)
            .setTitle(R.string.tv_title)
            .setView(scroll)
            .setNegativeButton(android.R.string.cancel, null)
            .create();

    box.addView(
        row(
            host,
            host.getString(R.string.tv_chromecast),
            v -> {
              dialog.dismiss();
              plugin.tvCast(host, channel);
            }));
    TextView header = new TextView(host);
    header.setText(R.string.tv_dlna);
    header.setTextSize(13);
    header.setPadding(dp(host, 4), dp(host, 16), 0, dp(host, 4));
    box.addView(header);
    final ProgressBar spinner = new ProgressBar(host);
    box.addView(spinner, new LinearLayout.LayoutParams(dp(host, 36), dp(host, 36)));
    final LinearLayout list = new LinearLayout(host);
    list.setOrientation(LinearLayout.VERTICAL);
    box.addView(list);
    dialog.show();

    plugin.tvScan(
        devices -> {
          if (!dialog.isShowing()) return;
          spinner.setVisibility(View.GONE);
          if (devices.isEmpty()) {
            TextView none = new TextView(host);
            none.setText(R.string.tv_none);
            none.setPadding(dp(host, 4), dp(host, 4), 0, dp(host, 8));
            list.addView(none);
            return;
          }
          for (final Dlna.Device d : devices) {
            list.addView(
                row(
                    host,
                    d.name,
                    v -> {
                      dialog.dismiss();
                      plugin.tvDlna(d, channel);
                    }));
          }
        });
  }

  private static TextView row(Context ctx, CharSequence text, View.OnClickListener click) {
    TextView t = new TextView(ctx);
    t.setText(text);
    t.setTextSize(17);
    t.setPadding(dp(ctx, 4), dp(ctx, 14), dp(ctx, 4), dp(ctx, 14));
    TypedValue tv = new TypedValue();
    if (ctx.getTheme().resolveAttribute(android.R.attr.selectableItemBackground, tv, true)) {
      t.setBackgroundResource(tv.resourceId);
    }
    t.setOnClickListener(click);
    t.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    return t;
  }

  private static int dp(Context ctx, int v) {
    return Math.round(v * ctx.getResources().getDisplayMetrics().density);
  }
}
