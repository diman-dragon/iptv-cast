package com.iptvcast.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Pair;
import android.util.Rational;
import android.view.WindowManager;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.Player;
import androidx.media3.ui.PlayerView;

/** Full-screen video on the shared player. Leaving the screen keeps the sound going (notification). */
public class PlayerActivity extends AppCompatActivity {
  private PlayerView view;

  @Override
  protected void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    view = new PlayerView(this);
    view.setBackgroundColor(0xFF000000);
    view.setKeepScreenOn(true);
    view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
    // Без этого мёртвый поток — просто чёрный экран. Теперь видно, что случилось.
    view.setErrorMessageProvider(
        e -> Pair.create(0, (CharSequence) (getString(R.string.player_error) + "\n" + e.getErrorCodeName())));
    setContentView(view);
    setTitle(getIntent().getStringExtra("title"));
    hideBars();
  }

  private void hideBars() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), view);
    c.hide(WindowInsetsCompat.Type.systemBars());
    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
  }

  @Override
  protected void onStart() {
    super.onStart();
    view.setPlayer(PlayerHolder.get(this));
  }

  @Override
  protected void onStop() {
    super.onStop();
    view.setPlayer(null); // sound continues in the service, the picture stops
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
  }
}
