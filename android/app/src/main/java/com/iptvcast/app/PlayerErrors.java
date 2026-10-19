package com.iptvcast.app;

import android.content.Context;
import androidx.media3.common.PlaybackException;
import androidx.media3.datasource.HttpDataSource;

/** A readable reason why a stream does not play (shared by the embedded view). */
final class PlayerErrors {
  private PlayerErrors() {}

  static String explain(Context ctx, PlaybackException e) {
    Throwable cause = e.getCause();
    if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
      return ctx.getString(R.string.err_http, ((HttpDataSource.InvalidResponseCodeException) cause).responseCode);
    }
    switch (e.errorCode) {
      case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
      case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
      case PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED:
        return ctx.getString(R.string.err_net);
      case PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS:
      case PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND:
        return ctx.getString(R.string.err_gone);
      case PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED:
      case PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED:
      case PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED:
      case PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED:
      case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
      case PlaybackException.ERROR_CODE_DECODING_FAILED:
      case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
        return ctx.getString(R.string.err_format);
      default:
        return ctx.getString(R.string.err_generic);
    }
  }
}
