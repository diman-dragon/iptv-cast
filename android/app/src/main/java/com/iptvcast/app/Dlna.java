package com.iptvcast.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * DLNA / UPnP "media renderer" control: most smart TVs (Samsung, LG, Sony, Philips...) can play
 * a stream by address. The TV opens the address itself. Pure Java (no Android classes).
 */
final class Dlna {
  static final class Device {
    final String name;
    final String location;
    final String controlUrl;
    final String serviceType;

    Device(String name, String location, String controlUrl, String serviceType) {
      this.name = name;
      this.location = location;
      this.controlUrl = controlUrl;
      this.serviceType = serviceType;
    }
  }

  private static final String[] SEARCH_TARGETS = {
    "urn:schemas-upnp-org:device:MediaRenderer:1", "urn:schemas-upnp-org:service:AVTransport:1"
  };

  private Dlna() {}

  // ------------------------------------------------------------------ discovery

  /** Looks for renderers for about timeoutMs. Call with the Wi-Fi multicast lock held. */
  static List<Device> discover(int timeoutMs) throws IOException {
    Set<String> locations = new LinkedHashSet<>();
    DatagramSocket socket = new DatagramSocket();
    try {
      socket.setSoTimeout(400);
      InetAddress group = InetAddress.getByName("239.255.255.250");
      for (int round = 0; round < 2; round++) {
        for (String st : SEARCH_TARGETS) {
          String msg =
              "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + st + "\r\n\r\n";
          byte[] b = msg.getBytes(StandardCharsets.US_ASCII);
          socket.send(new DatagramPacket(b, b.length, group, 1900));
        }
      }
      long end = System.currentTimeMillis() + timeoutMs;
      byte[] buf = new byte[4096];
      while (System.currentTimeMillis() < end) {
        try {
          DatagramPacket p = new DatagramPacket(buf, buf.length);
          socket.receive(p);
          String loc = header(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8), "LOCATION");
          if (loc != null) locations.add(loc);
        } catch (SocketTimeoutException ignored) {
          // keep listening until the deadline
        }
      }
    } finally {
      socket.close();
    }
    return describeAll(new ArrayList<>(locations));
  }

  static String header(String response, String name) {
    for (String line : response.split("\r\n")) {
      int c = line.indexOf(':');
      if (c > 0 && line.substring(0, c).trim().equalsIgnoreCase(name)) return line.substring(c + 1).trim();
    }
    return null;
  }

  private static List<Device> describeAll(List<String> locations) {
    List<Device> found = new ArrayList<>();
    ExecutorService pool = Executors.newFixedThreadPool(4);
    try {
      List<Future<Device>> futures = new ArrayList<>();
      for (final String loc : locations) {
        futures.add(
            pool.submit(
                new Callable<Device>() {
                  @Override
                  public Device call() {
                    try {
                      return describe(loc);
                    } catch (Exception e) {
                      return null;
                    }
                  }
                }));
      }
      for (Future<Device> f : futures) {
        try {
          Device d = f.get(6, TimeUnit.SECONDS);
          if (d != null) found.add(d);
        } catch (Exception ignored) {
          // skip a slow or broken device
        }
      }
    } finally {
      pool.shutdownNow();
    }
    return found;
  }

  /** Reads the device description. Returns null when the device cannot play media (no AVTransport). */
  static Device describe(String location) throws Exception {
    HttpURLConnection c = (HttpURLConnection) new URL(location).openConnection();
    Document doc;
    try {
      c.setConnectTimeout(3000);
      c.setReadTimeout(3000);
      InputStream in = c.getInputStream();
      doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(in);
    } finally {
      c.disconnect();
    }
    String base = text(doc.getDocumentElement(), "URLBase");
    if (base == null || base.isEmpty()) base = location;
    String name = text(doc.getDocumentElement(), "friendlyName");
    NodeList services = doc.getElementsByTagName("service");
    for (int i = 0; i < services.getLength(); i++) {
      Node n = services.item(i);
      if (!(n instanceof Element)) continue;
      Element s = (Element) n;
      String type = text(s, "serviceType");
      String ctl = text(s, "controlURL");
      if (type != null && ctl != null && type.contains("AVTransport")) {
        return new Device(name == null || name.isEmpty() ? location : name, location, HlsRewriter.resolve(base, ctl), type);
      }
    }
    return null;
  }

  private static String text(Element root, String tag) {
    NodeList l = root.getElementsByTagName(tag);
    return l.getLength() == 0 ? null : l.item(0).getTextContent().trim();
  }

  // ------------------------------------------------------------------ control

  /** Sends the address to the TV and starts playing. mime: e.g. application/vnd.apple.mpegurl or video/mpeg. */
  static void play(Device d, String uri, String title, String mime) throws IOException {
    try {
      soap(d, "Stop", "<InstanceID>0</InstanceID>");
    } catch (IOException ignored) {
      // nothing was playing
    }
    try {
      soap(d, "SetAVTransportURI", uriArgs(uri, didl(uri, title, mime)));
    } catch (IOException first) {
      // Some TVs reject the metadata: try without it.
      soap(d, "SetAVTransportURI", uriArgs(uri, ""));
    }
    soap(d, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
  }

  static void resume(Device d) throws IOException {
    soap(d, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
  }

  static void pause(Device d) throws IOException {
    soap(d, "Pause", "<InstanceID>0</InstanceID>");
  }

  static void stop(Device d) throws IOException {
    soap(d, "Stop", "<InstanceID>0</InstanceID>");
  }

  private static String uriArgs(String uri, String meta) {
    return "<InstanceID>0</InstanceID><CurrentURI>" + esc(uri) + "</CurrentURI><CurrentURIMetaData>" + esc(meta) + "</CurrentURIMetaData>";
  }

  static String didl(String uri, String title, String mime) {
    String type = mime == null || mime.isEmpty() ? "video/mpeg" : mime;
    return "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" "
        + "xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>"
        + esc(title)
        + "</dc:title><upnp:class>object.item.videoItem.videoBroadcast</upnp:class><res protocolInfo=\"http-get:*:"
        + type
        + ":*\">"
        + esc(uri)
        + "</res></item></DIDL-Lite>";
  }

  static String esc(String s) {
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
  }

  private static final Pattern FAULT = Pattern.compile("<(?:errorDescription|faultstring)>([^<]*)<");

  private static void soap(Device d, String action, String args) throws IOException {
    String body =
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" "
            + "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:"
            + action
            + " xmlns:u=\""
            + d.serviceType
            + "\">"
            + args
            + "</u:"
            + action
            + "></s:Body></s:Envelope>";
    HttpURLConnection c = (HttpURLConnection) new URL(d.controlUrl).openConnection();
    try {
      c.setConnectTimeout(4000);
      c.setReadTimeout(8000);
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"");
      c.setRequestProperty("SOAPACTION", "\"" + d.serviceType + "#" + action + "\"");
      byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
      c.setFixedLengthStreamingMode(bytes.length);
      OutputStream out = c.getOutputStream();
      out.write(bytes);
      out.flush();
      int code = c.getResponseCode();
      if (code >= 300) {
        String detail = "";
        InputStream err = c.getErrorStream();
        if (err != null) {
          ByteArrayOutputStream buf = new ByteArrayOutputStream();
          byte[] tmp = new byte[2048];
          int n;
          while ((n = err.read(tmp)) > 0 && buf.size() < 16384) buf.write(tmp, 0, n);
          Matcher m = FAULT.matcher(new String(buf.toByteArray(), StandardCharsets.UTF_8));
          if (m.find()) detail = " (" + m.group(1) + ")";
        }
        throw new IOException("UPnP " + action + ": HTTP " + code + detail);
      }
    } finally {
      c.disconnect();
    }
  }
}
