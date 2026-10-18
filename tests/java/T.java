package com.iptvcast.app;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class T {
  static int fails = 0;
  static void check(String name, boolean ok, Object info) {
    System.out.println((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + info));
    if (!ok) fails++;
  }
  static byte[] ts(int packets) { byte[] b = new byte[188 * packets]; for (int i = 0; i < packets; i++) b[i * 188] = 0x47; return b; }
  static void reply(HttpExchange x, int code, String type, byte[] body) throws IOException {
    if (type != null) x.getResponseHeaders().add("Content-Type", type);
    x.sendResponseHeaders(code, body.length == 0 && code != 200 ? -1 : body.length);
    if (body.length > 0) x.getResponseBody().write(body);
    x.close();
  }
  static String get(String url, Map<String, String> h, int[] code, Map<String, String> outH) throws IOException {
    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
    if (h != null) h.forEach(c::setRequestProperty);
    code[0] = c.getResponseCode();
    if (outH != null) for (String k : c.getHeaderFields().keySet()) if (k != null) outH.put(k.toLowerCase(), c.getHeaderField(k));
    InputStream in = code[0] >= 400 ? c.getErrorStream() : c.getInputStream();
    ByteArrayOutputStream o = new ByteArrayOutputStream(); if (in != null) { byte[] b = new byte[4096]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); }
    return o.toString("ISO-8859-1");
  }

  public static void main(String[] a) throws Exception {
    // ---------- HlsRewriter
    String master = "#EXTM3U\r\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\r\n#EXT-X-STREAM-INF:BANDWIDTH=1\r\nlow/index.m3u8\r\n#EXT-X-STREAM-INF:BANDWIDTH=2\r\nhttp://other.example/hi.m3u8?x=1&y=2\r\n";
    String rw = HlsRewriter.rewrite(master, "http://h.example/a/b/master.m3u8", u -> "P(" + u + ")");
    check("rewrite relative", rw.contains("P(http://h.example/a/b/low/index.m3u8)\r\n"), rw);
    check("rewrite absolute+query", rw.contains("P(http://other.example/hi.m3u8?x=1&y=2)"), rw);
    check("rewrite key URI", rw.contains("URI=\"P(http://h.example/a/b/key.bin)\""), rw);
    check("rewrite keeps tags/CRLF", rw.startsWith("#EXTM3U\r\n") && rw.contains("BANDWIDTH=1\r\n"), rw);

    // ---------- upstream server
    final List<String> seenUa = Collections.synchronizedList(new ArrayList<>());
    HttpServer up = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    up.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
    up.createContext("/", x -> {
      String p = x.getRequestURI().getPath();
      String ua = x.getRequestHeaders().getFirst("User-Agent");
      seenUa.add(p + "=" + ua);
      switch (p) {
        case "/ok.ts": reply(x, 200, "video/mp2t", ts(100)); break;
        case "/rawts": reply(x, 200, null, ts(100)); break;
        case "/hls/master.m3u8": reply(x, 200, "application/vnd.apple.mpegurl", "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv/index.m3u8\n".getBytes()); break;
        case "/hls/v/index.m3u8": reply(x, 200, "application/x-mpegURL", "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k.bin\"\n#EXTINF:6,\nseg1.ts\n#EXTINF:6,\nseg2.ts\n".getBytes()); break;
        case "/hls/v/seg1.ts": case "/hls/v/seg2.ts": {
          String r = x.getRequestHeaders().getFirst("Range");
          if (r != null) { x.getResponseHeaders().add("Content-Range", "bytes 0-1023/18800"); reply(x, 206, "video/mp2t", Arrays.copyOf(ts(100), 1024)); } else reply(x, 200, "video/mp2t", ts(100));
          break; }
        case "/hls/v/k.bin": reply(x, 200, "application/octet-stream", new byte[16]); break;
        case "/bad/media.m3u8": reply(x, 200, "application/vnd.apple.mpegurl", "#EXTM3U\n#EXTINF:6,\nmissing.ts\n".getBytes()); break;
        case "/bad/empty.m3u8": reply(x, 200, "application/vnd.apple.mpegurl", "#EXTM3U\n#EXT-X-VERSION:3\n".getBytes()); break;
        case "/page": reply(x, 200, "text/html", "<html>nope</html>".getBytes()); break;
        case "/empty": reply(x, 200, "video/mp2t", new byte[0]); break;
        case "/redir": x.getResponseHeaders().add("Location", "/ok.ts"); reply(x, 302, null, new byte[0]); break;
        case "/needua": if ("X".equals(ua)) reply(x, 200, "video/mp2t", ts(100)); else reply(x, 403, null, new byte[0]); break;
        case "/slow": try { Thread.sleep(3000); } catch (Exception e) {} reply(x, 200, "video/mp2t", ts(10)); break;
        case "/text": reply(x, 200, "text/plain", "hello world, this is not a stream".getBytes()); break;
        default: reply(x, 404, null, new byte[0]);
      }
    });
    up.start();
    String B = "http://127.0.0.1:" + up.getAddress().getPort();

    // ---------- Prober
    Prober.Result r;
    r = Prober.probe(B + "/ok.ts", "", "", 3000); check("probe ts ok", r.ok, r.reason + r.info);
    r = Prober.probe(B + "/rawts", "", "", 3000); check("probe raw ts (sync byte)", r.ok, r.reason + r.info);
    r = Prober.probe(B + "/hls/master.m3u8", "", "", 3000); check("probe hls master->variant->segment", r.ok, r.reason + r.info);
    r = Prober.probe(B + "/redir", "", "", 3000); check("probe redirect", r.ok, r.reason + r.info);
    r = Prober.probe(B + "/nothing", "", "", 3000); check("probe 404 -> http/404", !r.ok && r.reason.equals("http") && r.code == 404, r.reason);
    r = Prober.probe(B + "/page", "", "", 3000); check("probe html -> html", !r.ok && r.reason.equals("html"), r.reason);
    r = Prober.probe(B + "/empty", "", "", 3000); check("probe empty -> empty", !r.ok && r.reason.equals("empty"), r.reason);
    r = Prober.probe(B + "/text", "", "", 3000); check("probe text -> format", !r.ok && r.reason.equals("format"), r.reason);
    r = Prober.probe(B + "/bad/media.m3u8", "", "", 3000); check("probe dead segment -> segment/404", !r.ok && r.reason.equals("segment") && r.code == 404, r.reason + r.code);
    r = Prober.probe(B + "/bad/empty.m3u8", "", "", 3000); check("probe manifest w/o segments -> hls", !r.ok && r.reason.equals("hls"), r.reason);
    r = Prober.probe(B + "/needua", "", "", 3000); check("probe needs UA -> 403", !r.ok && r.code == 403, r.reason);
    r = Prober.probe(B + "/needua", "X", "", 3000); check("probe with UA ok", r.ok, r.reason);
    r = Prober.probe(B + "/slow", "", "", 1000); check("probe slow -> timeout", !r.ok && r.reason.equals("timeout"), r.reason);
    r = Prober.probe("http://127.0.0.1:1/x", "", "", 2000); check("probe closed port -> network", !r.ok && r.reason.equals("network"), r.reason);
    r = Prober.probe("rtmp://x/y", "", "", 2000); check("probe rtmp -> scheme", !r.ok && r.reason.equals("scheme"), r.reason);

    // ---------- StreamProxy
    StreamProxy px = StreamProxy.get();
    String purl = px.urlFor(B + "/hls/master.m3u8", "X", "http://ref.example/").replaceFirst("http://[^:/]+:", "http://127.0.0.1:");
    check("proxy url shape", purl.matches("http://127\\.0\\.0\\.1:\\d+/p/[0-9a-f]+/[0-9a-f]+\\.m3u8"), purl);
    int[] code = new int[1]; Map<String, String> hh = new HashMap<>();
    String m = get(purl, null, code, hh);
    check("proxy manifest 200 + CORS", code[0] == 200 && "*".equals(hh.get("access-control-allow-origin")), code[0] + " " + hh);
    check("proxy manifest content-type", String.valueOf(hh.get("content-type")).contains("mpegurl"), hh);
    check("proxy variant URL rewritten", m.contains("/p/") && !m.contains("v/index.m3u8\n"), m);
    String variant = null; for (String l : m.split("\n")) if (l.contains("/p/")) variant = l.trim();
    variant = variant.replaceFirst("http://[^:/]+:", "http://127.0.0.1:");
    String vm = get(variant, null, code, hh);
    check("proxy nested playlist rewritten (segments+key)", code[0] == 200 && vm.split("/p/").length >= 4, vm);
    String seg = null; for (String l : vm.split("\n")) if (l.contains("/p/") && !l.startsWith("#")) { seg = l.trim(); break; }
    seg = seg.replaceFirst("http://[^:/]+:", "http://127.0.0.1:");
    String sb = get(seg, null, code, hh);
    check("proxy segment passthrough", code[0] == 200 && sb.length() == 188 * 100, code[0] + " len " + sb.length());
    Map<String, String> rh = new HashMap<>(); rh.put("Range", "bytes=0-1023");
    String rb = get(seg, rh, code, hh);
    check("proxy Range -> 206", code[0] == 206 && rb.length() == 1024, code[0] + " len " + rb.length());
    check("proxy forwarded UA 'X' upstream", seenUa.stream().anyMatch(s -> s.startsWith("/hls/master.m3u8=X")) && seenUa.stream().anyMatch(s -> s.startsWith("/hls/v/seg1.ts=X")), seenUa);
    String nu = px.urlFor(B + "/needua", "X", "").replaceFirst("http://[^:/]+:", "http://127.0.0.1:");
    check("proxy makes UA-locked stream playable", get(nu, null, code, hh).length() == 188 * 100 && code[0] == 200, code[0]);
    String opt; HttpURLConnection oc = (HttpURLConnection) new URL(purl).openConnection(); oc.setRequestMethod("OPTIONS");
    check("proxy OPTIONS 204 + CORS", oc.getResponseCode() == 204 && "*".equals(oc.getHeaderField("Access-Control-Allow-Origin")), oc.getResponseCode());
    String bad = get(px.urlFor(B + "/nothing", "", "").replaceFirst("http://[^:/]+:", "http://127.0.0.1:"), null, code, hh);
    check("proxy passes upstream 404", code[0] == 404, code[0]);
    System.out.println("localIp() = " + StreamProxy.localIp());

    // ---------- Dlna against a fake renderer
    final List<String> soap = Collections.synchronizedList(new ArrayList<>());
    final boolean[] rejectMeta = {false};
    HttpServer tv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    tv.createContext("/desc.xml", x -> reply(x, 200, "text/xml", ("<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:device-1-0\"><device><friendlyName>Living Room TV</friendlyName><serviceList>"
        + "<service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/rc</controlURL></service>"
        + "<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/ctl</controlURL></service>"
        + "</serviceList></device></root>").getBytes()));
    tv.createContext("/nodev.xml", x -> reply(x, 200, "text/xml", "<root><device><friendlyName>Printer</friendlyName></device></root>".getBytes()));
    tv.createContext("/ctl", x -> {
      String action = x.getRequestHeaders().getFirst("SOAPACTION");
      String body = new String(x.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      soap.add(action + " | " + body);
      if (action.contains("SetAVTransportURI") && rejectMeta[0] && body.contains("DIDL")) {
        reply(x, 500, "text/xml", "<s:Envelope><s:Body><s:Fault><detail><errorDescription>Bad metadata</errorDescription></detail></s:Fault></s:Body></s:Envelope>".getBytes());
      } else reply(x, 200, "text/xml", "<ok/>".getBytes());
    });
    tv.start();
    String TV = "http://127.0.0.1:" + tv.getAddress().getPort();
    Dlna.Device d = Dlna.describe(TV + "/desc.xml");
    check("dlna describe name+control", d != null && d.name.equals("Living Room TV") && d.controlUrl.equals(TV + "/ctl") && d.serviceType.endsWith("AVTransport:1"), d == null ? null : d.name + d.controlUrl);
    check("dlna describe skips non-renderers", Dlna.describe(TV + "/nodev.xml") == null, "not null");
    Dlna.play(d, "http://x/a?b=1&c=2", "News <1>", "application/vnd.apple.mpegurl");
    String all = String.join("\n", soap);
    check("dlna sequence Stop,SetURI,Play", all.indexOf("#Stop") < all.indexOf("#SetAVTransportURI") && all.indexOf("#SetAVTransportURI") < all.indexOf("#Play"), all);
    check("dlna URI escaped in SOAP", all.contains("<CurrentURI>http://x/a?b=1&amp;c=2</CurrentURI>"), all);
    check("dlna DIDL title escaped + protocolInfo", all.contains("News &amp;lt;1&amp;gt;") && all.contains("application/vnd.apple.mpegurl"), all);
    soap.clear(); rejectMeta[0] = true;
    Dlna.play(d, "http://x/y", "T", "video/mpeg");
    long setCalls = soap.stream().filter(s -> s.contains("#SetAVTransportURI")).count();
    check("dlna retries without metadata on 500", setCalls == 2 && soap.get(soap.size() - 1).contains("#Play"), soap.size() + " calls=" + setCalls);
    soap.clear(); Dlna.pause(d); Dlna.resume(d); Dlna.stop(d);
    check("dlna pause/play/stop", soap.size() == 3 && soap.get(0).contains("#Pause") && soap.get(1).contains("#Play") && soap.get(2).contains("#Stop"), soap);
    try { tv.stop(0); Dlna.pause(d); check("dlna error surfaces", false, "no exception"); } catch (IOException e) { check("dlna error surfaces", true, e); }
    check("ssdp header parse", "http://1.2.3.4/d.xml".equals(Dlna.header("HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLocation: http://1.2.3.4/d.xml\r\nST: x\r\n\r\n", "LOCATION")), "");

    System.out.println(fails == 0 ? "ALL PASSED" : (fails + " FAILED"));
    System.exit(fails == 0 ? 0 : 1);
  }
}
