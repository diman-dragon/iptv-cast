package com.iptvcast.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(IptvPlugin.class);
    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onDestroy() {
    // The app is closed for good: free the player (there is no background service to keep it).
    if (isFinishing()) {
      ChannelQueue.clear();
      PlayerHolder.release();
    }
    super.onDestroy();
  }
}
