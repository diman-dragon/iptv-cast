package com.iptvcast.app;

import android.content.Context;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.media3.common.C;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.ExoPlayer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeSet;

/** Quality = the highest picture height the player may choose (it still adapts below that). */
final class QualityPicker {
  private QualityPicker() {}

  static void show(Context ctx, final ExoPlayer p) {
    TreeSet<Integer> found = new TreeSet<>(Collections.reverseOrder());
    for (Tracks.Group g : p.getCurrentTracks().getGroups()) {
      if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
      for (int i = 0; i < g.length; i++) {
        int h = g.getTrackFormat(i).height;
        if (g.isTrackSupported(i) && h > 0) found.add(h);
      }
    }
    if (found.size() < 2) {
      Toast.makeText(ctx, R.string.player_quality_none, Toast.LENGTH_SHORT).show();
      return;
    }
    final List<Integer> heights = new ArrayList<>(found);
    String[] labels = new String[heights.size() + 1];
    labels[0] = ctx.getString(R.string.player_quality_auto);
    int limit = p.getTrackSelectionParameters().maxVideoHeight; // Integer.MAX_VALUE = auto
    int checked = 0;
    for (int i = 0; i < heights.size(); i++) {
      labels[i + 1] = heights.get(i) + "p";
      if (heights.get(i) == limit) checked = i + 1;
    }
    new AlertDialog.Builder(ctx)
        .setTitle(R.string.player_quality)
        .setSingleChoiceItems(
            labels,
            checked,
            (dialog, which) -> {
              TrackSelectionParameters.Builder b = p.getTrackSelectionParameters().buildUpon();
              b.setMaxVideoSize(Integer.MAX_VALUE, which == 0 ? Integer.MAX_VALUE : heights.get(which - 1));
              p.setTrackSelectionParameters(b.build());
              dialog.dismiss();
            })
        .show();
  }
}
