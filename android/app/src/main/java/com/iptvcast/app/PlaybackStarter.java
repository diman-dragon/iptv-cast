package com.iptvcast.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/** Starts the background service and asks for the notification permission (Android 13+). */
final class PlaybackStarter {
  private PlaybackStarter() {}

  static void start(Context ctx, Activity activity) {
    ctx.startService(new Intent(ctx, PlaybackService.class));
    if (Build.VERSION.SDK_INT >= 33
        && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(activity, new String[] {Manifest.permission.POST_NOTIFICATIONS}, 0);
    }
  }
}
