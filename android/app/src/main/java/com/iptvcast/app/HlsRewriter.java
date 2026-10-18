package com.iptvcast.app;

import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Rewrites every URL of an HLS playlist so that it goes through the phone proxy. Pure Java. */
final class HlsRewriter {
  interface Wrap {
    String apply(String absoluteUrl);
  }

  private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]*)\"");

  private HlsRewriter() {}

  static String resolve(String base, String ref) {
    try {
      return new URL(new URL(base), ref).toString();
    } catch (Exception e) {
      return ref;
    }
  }

  static String rewrite(String body, String baseUrl, Wrap wrap) {
    StringBuilder out = new StringBuilder(body.length() + 256);
    int pos = 0;
    while (pos < body.length()) {
      int nl = body.indexOf('\n', pos);
      String line = nl < 0 ? body.substring(pos) : body.substring(pos, nl);
      String ending = nl < 0 ? "" : "\n";
      String trimmed = line.trim();
      if (trimmed.isEmpty()) {
        out.append(line);
      } else if (trimmed.startsWith("#")) {
        out.append(rewriteTag(line, baseUrl, wrap));
      } else {
        String cr = line.endsWith("\r") ? "\r" : "";
        out.append(wrap.apply(resolve(baseUrl, trimmed))).append(cr);
      }
      out.append(ending);
      pos = nl < 0 ? body.length() : nl + 1;
    }
    return out.toString();
  }

  // Tags such as #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA carry URI="..." attributes.
  private static String rewriteTag(String line, String baseUrl, Wrap wrap) {
    Matcher m = URI_ATTR.matcher(line);
    StringBuffer sb = new StringBuffer();
    while (m.find()) {
      String ref = m.group(1);
      String replacement = ref.startsWith("data:") ? ref : wrap.apply(resolve(baseUrl, ref));
      m.appendReplacement(sb, Matcher.quoteReplacement("URI=\"" + replacement + "\""));
    }
    m.appendTail(sb);
    return sb.toString();
  }
}
