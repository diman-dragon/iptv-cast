package com.iptvcast.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import androidx.annotation.Nullable;
import androidx.media3.common.Player;
import androidx.media3.session.CommandButton;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

/** Keeps playback alive in the background (sound with the screen off) and shows the media notification. */
public class PlaybackService extends MediaSessionService {
  private static final SessionCommand CLOSE = new SessionCommand("iptvcast.close", Bundle.EMPTY);
  private MediaSession session;

  @Override
  public void onCreate() {
    super.onCreate();
    Intent open = new Intent(this, MainActivity.class);
    PendingIntent tap =
        PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    session =
        new MediaSession.Builder(this, PlayerHolder.get(this))
            .setCallback(new CloseCallback())
            .setSessionActivity(tap)
            .build();
    DefaultMediaNotificationProvider provider = new DefaultMediaNotificationProvider.Builder(this).build();
    provider.setSmallIcon(R.drawable.ic_stat_player);
    setMediaNotificationProvider(provider);
    // Nobody binds to the service (the player is driven by the plugin), so without this
    // the session is never attached and no notification is ever shown.
    addSession(session);
  }

  /** ✕ in the notification: stop, forget the channel and remove the notification. */
  private void close() {
    Player p = session.getPlayer();
    p.pause();
    p.clearMediaItems();
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }

  @Nullable
  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
    return session;
  }

  @Override
  public void onTaskRemoved(@Nullable Intent rootIntent) {
    // App swiped away from recents: stop playback and remove the notification.
    pauseAllPlayersAndStopSelf();
  }

  @Override
  public void onDestroy() {
    session.release();
    PlayerHolder.release();
    session = null;
    super.onDestroy();
  }

  /** Adds a "Close" (✕) button to the notification and handles it. */
  private final class CloseCallback implements MediaSession.Callback {
    @Override
    public MediaSession.ConnectionResult onConnect(
        MediaSession s, MediaSession.ControllerInfo controller) {
      CommandButton closeButton =
          new CommandButton.Builder(CommandButton.ICON_UNDEFINED)
              .setCustomIconResId(R.drawable.ic_close)
              .setDisplayName(getString(R.string.notif_close))
              .setSessionCommand(CLOSE)
              .setEnabled(true)
              .build();
      SessionCommands commands =
          MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(CLOSE).build();
      return new MediaSession.ConnectionResult.AcceptedResultBuilder(s)
          .setAvailableSessionCommands(commands)
          .setMediaButtonPreferences(ImmutableList.of(closeButton))
          .build();
    }

    @Override
    public ListenableFuture<SessionResult> onCustomCommand(
        MediaSession s, MediaSession.ControllerInfo controller, SessionCommand command, Bundle args) {
      if (CLOSE.customAction.equals(command.customAction)) close();
      return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
    }
  }
}
