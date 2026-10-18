package com.iptvcast.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import javax.net.ssl.SSLException;

/**
 * "Is there a stream at this address?" Opens it like a player would and looks at the first bytes.
 * HLS is followed down to the first media segment. Pure Java (no Android classes).
 */
final class Prober {
  static final class Result {
    final boolean ok;
    final String reason; // ok | http | timeout | network | ssl | html | empty | format | hls | segment | scheme | error
    final int code;
    final String info;
    final long ms;

    Result(boolean ok, String reason, int code, String info, long ms) {
      this.ok = ok;
      this.reason = reason;
      this.code = code;
      this.info = info == null ? "" : info;
      this.ms = ms;
    }
  }

  private static final class Resp {
    final int code;
    final String type;
    final byte[] body;
    final String url;

    Resp(int code, String type, byte[] body, String url) {
      this.code = code;
      this.type = type == null ? "" : type.toLowerCase(Locale.ROOT);
      this.body = body;
      this.url = url;
    }
  }

  private static final int PEEK = 65536;

  private Prober() {}

  static Result probe(String url, String ua, String ref, int timeoutMs) {
    long t0 = System.currentTimeMillis();
    try {
      String lower = url.toLowerCase(Locale.ROOT);
      if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
        int c = lower.indexOf(':');
        return fail("scheme", 0, c > 0 ? lower.substring(0, c) : "?", t0);
      }
      Resp r = get(url, ua, ref, timeoutMs, false, PEEK);
      if (r.code < 200 || r.code >= 300) return fail("http", r.code, "HTTP " + r.code, t0);
      if (r.body.length == 0) return fail("empty", r.code, "", t0);
      String head = new String(r.body, 0, Math.min(r.body.length, 1024), StandardCharsets.ISO_8859_1).trim();
      if (head.startsWith("\u00EF\u00BB\u00BF")) head = head.substring(3).trim(); // UTF-8 BOM
      if (head.startsWith("#EXTM3U")) return hls(r, ua, ref, timeoutMs, t0);
      if (r.type.contains("text/html") || head.startsWith("<")) return fail("html", r.code, r.type, t0);
      if (looksLikeMedia(r.type, r.body)) return new Result(true, "ok", r.code, r.type, System.currentTimeMillis() - t0);
      return fail("format", r.code, r.type, t0);
    } catch (SocketTimeoutException e) {
      return fail("timeout", 0, "", t0);
    } catch (UnknownHostException e) {
      return fail("network", 0, "DNS: " + e.getMessage(), t0);
    } catch (SSLException e) {
      return fail("ssl", 0, e.getMessage(), t0);
    } catch (IOException e) {
      return fail("network", 0, String.valueOf(e.getMessage()), t0);
    } catch (RuntimeException e) {
      return fail("error", 0, String.valueOf(e.getMessage()), t0);
    }
  }

  private static Result hls(Resp master, String ua, String ref, int timeoutMs, long t0) throws IOException {
    String text = new String(master.body, StandardCharsets.UTF_8);
    String uri = firstUri(text);
    if (uri == null) return fail("hls", master.code, "no segments", t0);
    String next = HlsRewriter.resolve(master.url, uri);
    if (text.contains("#EXT-X-STREAM-INF")) {
      // A master playlist: go into the first variant.
      Resp v = get(next, ua, ref, timeoutMs, false, PEEK);
      if (v.code < 200 || v.code >= 300) return fail("hls", v.code, "variant HTTP " + v.code, t0);
      String vt = new String(v.body, StandardCharsets.UTF_8);
      if (!vt.trim().startsWith("#EXTM3U")) return fail("hls", v.code, "variant is not a playlist", t0);
      String seg = firstUri(vt);
      if (seg == null) return fail("hls", v.code, "no segments", t0);
      next = HlsRewriter.resolve(v.url, seg);
    }
    Resp s = get(next, ua, ref, timeoutMs, true, 2048);
    if (s.code < 200 || s.code >= 300) return fail("segment", s.code, "segment HTTP " + s.code, t0);
    if (s.body.length == 0) return fail("segment", s.code, "empty segment", t0);
    return new Result(true, "ok", s.code, "hls", System.currentTimeMillis() - t0);
  }

  private static String firstUri(String playlist) {
    for (String line : playlist.split("\n")) {
      String t = line.trim();
      if (!t.isEmpty() && !t.startsWith("#")) return t;
    }
    return null;
  }

  // TS starts with 0x47, MP4 has "ftyp", plus the usual audio containers.
  private static boolean looksLikeMedia(String type, byte[] b) {
    if (type.startsWith("video/") || type.startsWith("audio/") || type.contains("mpegurl") || type.contains("octet-stream")) {
      return b.length >= 188 || type.startsWith("audio/");
    }
    if (b.length >= 188 && b[0] == 0x47 && b[188] == 0x47) return true;
    if (b.length >= 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p') return true;
    if (b.length >= 4 && b[0] == 'O' && b[1] == 'g' && b[2] == 'g' && b[3] == 'S') return true;
    if (b.length >= 3 && b[0] == 'I' && b[1] == 'D' && b[2] == '3') return true;
    return b.length >= 2 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xF0) == 0xF0; // ADTS / MP3 frame
  }

  private static Result fail(String reason, int code, String info, long t0) {
    return new Result(false, reason, code, info, System.currentTimeMillis() - t0);
  }

  private static Resp get(String url, String ua, String ref, int timeout, boolean range, int max) throws IOException {
    String cur = url;
    for (int hop = 0; hop < 6; hop++) {
      HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
      try {
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout);
        c.setRequestProperty("User-Agent", ua == null || ua.isEmpty() ? Net.UA : ua);
        if (ref != null && !ref.isEmpty()) c.setRequestProperty("Referer", ref);
        c.setRequestProperty("Accept", "*/*");
        c.setRequestProperty("Accept-Encoding", "identity");
        if (range) c.setRequestProperty("Range", "bytes=0-" + (max - 1));
        int code = c.getResponseCode();
        String loc = c.getHeaderField("Location");
        if (code >= 300 && code < 400 && loc != null) {
          cur = HlsRewriter.resolve(cur, loc);
          continue;
        }
        byte[] body = new byte[0];
        if (code >= 200 && code < 300) body = readLimited(c.getInputStream(), max, timeout);
        return new Resp(code, c.getContentType(), body, cur);
      } finally {
        c.disconnect();
      }
    }
    throw new IOException("too many redirects");
  }

  // A live stream never ends: read up to max bytes, but not longer than the deadline.
  private static byte[] readLimited(InputStream in, int max, int timeoutMs) throws IOException {
    long deadline = System.currentTimeMillis() + Math.max(2000, timeoutMs);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[8192];
    int first = -1;
    try {
      while (out.size() < max && System.currentTimeMillis() < deadline) {
        int n = in.read(buf, 0, Math.min(buf.length, max - out.size()));
        if (n < 0) break;
        if (first < 0 && n > 0) first = buf[0] & 0xFF;
        out.write(buf, 0, n);
        // Media needs only the first bytes; a playlist ("#EXTM3U") or markup is read on to the end.
        if (out.size() >= 4096 && first != '#' && first != '<' && first != 0xEF) break;
      }
    } catch (SocketTimeoutException e) {
      if (out.size() == 0) throw e; // nothing came at all
    }
    return out.toByteArray();
  }
}
