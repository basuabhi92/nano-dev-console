/*package org.nanonative.devconsole;

import org.nanonative.devconsole.service.DevConsoleService;
import org.nanonative.nano.core.Nano;
import org.nanonative.nano.services.http.HttpServer;
import org.nanonative.nano.services.metric.logic.MetricService;

import java.util.Map;

import static org.nanonative.devconsole.service.DevConsoleService.CONFIG_DEV_CONSOLE_MAX_EVENTS;
import static org.nanonative.devconsole.service.DevConsoleService.CONFIG_DEV_CONSOLE_MAX_LOGS;
import static org.nanonative.devconsole.service.DevConsoleService.CONFIG_DEV_CONSOLE_URL;
import static org.nanonative.nano.services.http.HttpServer.CONFIG_SERVICE_HTTP_PORT;

public class Main {

    public static void main(String[] args) {
        final Nano nano = new Nano(Map.of(
                CONFIG_DEV_CONSOLE_MAX_EVENTS, 1000,
                CONFIG_DEV_CONSOLE_MAX_LOGS, 9999,
                CONFIG_DEV_CONSOLE_URL, "/user1",
                CONFIG_SERVICE_HTTP_PORT, "8080"
        ), new HttpServer(), new DevConsoleService());
    }
}*/
