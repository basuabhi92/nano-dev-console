package org.nanonative.devconsole.util;

import org.nanonative.nano.services.http.model.ContentType;
import org.nanonative.nano.services.http.model.HttpObject;

public class ResponseHelper {

    private ResponseHelper() {}

    public static HttpObject responseOk(final HttpObject payload, final String body, ContentType cntType) {
        HttpObject resp = payload.createCorsResponse().statusCode(200).contentType(cntType).body(body);
        return resp;
    }

    public static ContentType getTypeFromFileExt(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1);
        return switch (ext) {
            case "html" -> ContentType.TEXT_HTML;
            case "css" -> ContentType.TEXT_CSS;
            case "js" -> ContentType.APPLICATION_JAVASCRIPT;
            default -> ContentType.TEXT_PLAIN;
        };
    }
}
