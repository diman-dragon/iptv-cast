package com.iptvcast.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.HttpURLConnection;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny HTTP proxy on the phone. The TV asks the phone, the phone asks the real server.
 * Why: Chromecast refuses streams without CORS headers, and many lists need a special
 * User-Agent / Referer that a TV cannot send. HLS playlists are rewritten so that every
 * segment comes through the proxy as well. Pure Java (no Android classes).
 */
final class StreamProxy {
  private static final int MAX_MANIFEST = 4 * 1024 * 1024;
  private static StreamProxy instance;

  private ServerSocket server;
  private final ExecutorService pool = Executors.newCachedThreadPool();
  // session id -> {userAgent, referer}; a segment URL only has to carry the id.
  private final Map<String, String[]> sessions = new ConcurrentHashMap<>();
  private final Map<String, String> sessionIds = new ConcurrentHashMap<>();

  static synchronized StreamProxy get() throws IOException {
    if (instance == null) instance = new StreamProxy();
    instance.ensureStarted();
    return instance;
  }

  private synchronized void ensureStarted() throws IOException {
    if (server != null && !server.isClosed()) return;
    server = new ServerSocket(0);
    final ServerSocket s = server;
    Thread t =
        new Thread(
            () -> {
              while (!s.isClosed()) {
                try {
                  final Socket c = s.accept();
                  pool.execute(() -> handle(c));
                } catch (IOException e) {
                  return;
                }
              }
            },
            "iptvcast-proxy");
    t.setDaemon(true);
    t.start();
  }

  int port() {
    return server.getLocalPort();
  }

  synchronized void stop() {
    try {
      if (server != null) server.close();
    } catch (IOException ignored) {
      // already closed
    }
    server = null;
  }

  // ------------------------------------------------------------------ URLs

  /** Best guess of the phone's address in the local network (Wi-Fi or hotspot). */
  static String localIp() {
    String fallback = null;
    try {
      Enumeration<NetworkInterface> all = NetworkInterface.getNetworkInterfaces();
      for (NetworkInterface ni : Collections.list(all)) {
        if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
        String name = ni.getName().toLowerCase(Locale.ROOT);
        for (InetAddress a : Collections.list(ni.getInetAddresses())) {
          if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
          if (name.startsWith("wlan") || name.startsWith("eth") || name.startsWith("ap")) return a.getHostAddress();
          if (fallback == null && !name.startsWith("rmnet") && !name.startsWith("tun")) fallback = a.getHostAddress();
        }
      }
    } catch (Exception ignored) {
      // no interfaces
    }
    return fallback;
  }

  private String session(String ua, String ref) {
    String key = (ua == null ? "" : ua) + "\n" + (ref == null ? "" : ref);
    String id = sessionIds.get(key);
    if (id == null) {
      id = Integer.toHexString(sessionIds.size() + 1);
      sessionIds.put(key, id);
      sessions.put(id, new String[] {ua == null ? "" : ua, ref == null ? "" : ref});
    }
    return id;
  }

  private static String hex(String s) {
    byte[] b = s.getBytes(StandardCharsets.UTF_8);
    StringBuilder sb = new StringBuilder(b.length * 2);
    for (byte x : b) {
      sb.append(Character.forDigit((x >> 4) & 15, 16)).append(Character.forDigit(x & 15, 16));
    }
    return sb.toString();
  }

  private static String unhex(String h) {
    byte[] b = new byte[h.length() / 2];
    for (int i = 0; i < b.length; i++) {
      b[i] = (byte) ((Character.digit(h.charAt(i * 2), 16) << 4) | Character.digit(h.charAt(i * 2 + 1), 16));
    }
    return new String(b, StandardCharsets.UTF_8);
  }

  private static String extensionOf(String url) {
    String path = url;
    int q = path.indexOf('?');
    if (q >= 0) path = path.substring(0, q);
    int slash = path.lastIndexOf('/');
    int dot = path.lastIndexOf('.');
    if (dot > slash && path.length() - dot <= 6) return path.substring(dot).toLowerCase(Locale.ROOT);
    return "";
  }

  /** The address that the TV should use instead of the real one. */
  String urlFor(String target, String ua, String ref) {
    return build(localIp(), target, session(ua, ref));
  }

  private String build(String host, String target, String sid) {
    return "http://" + host + ":" + port() + "/p/" + sid + "/" + hex(target) + extensionOf(target);
  }

  // ------------------------------------------------------------------ serving

  private void handle(Socket c) {
    try {
      c.setSoTimeout(20000);
      InputStream in = c.getInputStream();
      OutputStream out = c.getOutputStream();
      String request = readHeaders(in);
      if (request == null) return;
      String[] lines = request.split("\r\n");
      String[] first = lines[0].split(" ");
      if (first.length < 2) return;
      String method = first[0];
      String range = null;
      for (int i = 1; i < lines.length; i++) {
        if (lines[i].regionMatches(true, 0, "Range:", 0, 6)) range = lines[i].substring(6).trim();
      }
      if (method.equals("OPTIONS")) {
        send(out, 204, "No Content", null, null);
        return;
      }
      if (!method.equals("GET") && !method.equals("HEAD")) {
        send(out, 405, "Method Not Allowed", null, null);
        return;
      }
      String[] parts = first[1].split("/");
      // "", "p", sid, hex[.ext]
      if (parts.length < 4 || !parts[1].equals("p")) {
        send(out, 404, "Not Found", null, null);
        return;
      }
      String[] hdr = sessions.get(parts[2]);
      String file = parts[3];
      int dot = file.indexOf('.');
      String target = unhex(dot < 0 ? file : file.substring(0, dot));
      forward(c, out, method, target, hdr == null ? new String[] {"", ""} : hdr, parts[2], range);
    } catch (Exception ignored) {
      // client went away
    } finally {
      try {
        c.close();
      } catch (IOException ignored) {
        // closed
      }
    }
  }

  private static String readHeaders(InputStream in) throws IOException {
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    int b;
    int state = 0;
    while (buf.size() < 16384 && (b = in.read()) >= 0) {
      buf.write(b);
      state = (b == '\r' && (state == 0 || state == 2)) ? state + 1 : (b == '\n' && (state == 1 || state == 3)) ? state + 1 : 0;
      if (state == 4) return buf.toString("ISO-8859-1");
    }
    return null;
  }

  private static void send(OutputStream out, int code, String text, String[][] headers, byte[] body) throws IOException {
    StringBuilder sb = new StringBuilder();
    sb.append("HTTP/1.1 ").append(code).append(' ').append(text).append("\r\n");
    sb.append("Access-Control-Allow-Origin: *\r\n");
    sb.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
    sb.append("Access-Control-Allow-Headers: *\r\n");
    sb.append("Access-Control-Expose-Headers: *\r\n");
    sb.append("Connection: close\r\n");
    if (headers != null) {
      for (String[] h : headers) {
        if (h[1] != null) sb.append(h[0]).append(": ").append(h[1]).append("\r\n");
      }
    }
    if (body != null) sb.append("Content-Length: ").append(body.length).append("\r\n");
    else if (headers == null) sb.append("Content-Length: 0\r\n");
    sb.append("\r\n");
    out.write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
    if (body != null) out.write(body);
    out.flush();
  }

  private void forward(Socket client, OutputStream out, String method, String target, String[] hdr, String sid, String range)
      throws IOException {
    String cur = target;
    HttpURLConnection up = null;
    int code = 0;
    for (int hop = 0; hop < 6; hop++) {
      up = (HttpURLConnection) new URL(cur).openConnection();
      up.setInstanceFollowRedirects(false);
      up.setConnectTimeout(15000);
      up.setReadTimeout(30000);
      up.setRequestMethod(method);
      up.setRequestProperty("User-Agent", hdr[0].isEmpty() ? Net.UA : hdr[0]);
      if (!hdr[1].isEmpty()) up.setRequestProperty("Referer", hdr[1]);
      up.setRequestProperty("Accept", "*/*");
      up.setRequestProperty("Accept-Encoding", "identity");
      if (range != null) up.setRequestProperty("Range", range);
      code = up.getResponseCode();
      String loc = up.getHeaderField("Location");
      if (code >= 300 && code < 400 && loc != null) {
        cur = HlsRewriter.resolve(cur, loc);
        up.disconnect();
        continue;
      }
      break;
    }
    try {
      InputStream in = code >= 400 ? up.getErrorStream() : up.getInputStream();
      String type = up.getContentType();
      if (in == null || method.equals("HEAD")) {
        send(out, code, "OK", new String[][] {{"Content-Type", type}}, new byte[0]);
        return;
      }
      byte[] peek = new byte[7];
      int got = 0;
      while (got < 7) {
        int n = in.read(peek, got, 7 - got);
        if (n < 0) break;
        got += n;
      }
      boolean manifest = got == 7 && new String(peek, StandardCharsets.ISO_8859_1).equals("#EXTM3U");
      if (manifest) {
        ByteArrayOutputStream all = new ByteArrayOutputStream();
        all.write(peek, 0, got);
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0 && all.size() < MAX_MANIFEST) all.write(buf, 0, n);
        final String base = cur;
        final String host = localIp();
        String text = new String(all.toByteArray(), StandardCharsets.UTF_8);
        String rewritten = HlsRewriter.rewrite(text, base, abs -> build(host, abs, sid));
        send(out, 200, "OK", new String[][] {{"Content-Type", "application/vnd.apple.mpegurl"}, {"Cache-Control", "no-cache"}}, rewritten.getBytes(StandardCharsets.UTF_8));
        return;
      }
      // Media: pass through as is, until either side closes.
      List<String[]> h = new ArrayList<>();
      h.add(new String[] {"Content-Type", type});
      h.add(new String[] {"Content-Range", up.getHeaderField("Content-Range")});
      h.add(new String[] {"Accept-Ranges", up.getHeaderField("Accept-Ranges")});
      long len = up.getContentLengthLong();
      if (len >= 0) h.add(new String[] {"Content-Length", String.valueOf(len)});
      send(out, code == 206 ? 206 : (code >= 400 ? code : 200), code == 206 ? "Partial Content" : "OK", h.toArray(new String[0][]), null);
      out.write(peek, 0, got);
      byte[] buf = new byte[16384];
      int n;
      while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      out.flush();
    } finally {
      up.disconnect();
    }
  }
}
