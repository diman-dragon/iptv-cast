package com.iptvcast.app;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(IptvPlugin.class);
    super.onCreate(savedInstanceState);
  }

  /** Поворот телефона: в альбомной ориентации играющий канал открывается на весь экран. */
  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    IptvPlugin p = IptvPlugin.instance;
    if (p != null) p.onOrientation(newConfig.orientation);
  }

  @Override
  public void onDestroy() {
    // The app is closed for good: free the player (there is no background service to keep it).
    if (isFinishing()) {
      ChannelQueue.clear();
      PlayerHolder.release();
    }
    super.onDestroy();
  }
}
