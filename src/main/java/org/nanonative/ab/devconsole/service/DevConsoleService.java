package org.nanonative.ab.devconsole.service;

import berlin.yuna.typemap.model.TypeMapI;
import org.nanonative.ab.devconsole.model.EventWrapper;
import org.nanonative.nano.core.NanoBase;
import org.nanonative.nano.core.model.NanoThread;
import org.nanonative.nano.core.model.Service;
import org.nanonative.nano.helper.ExRunnable;
import org.nanonative.nano.helper.event.model.Event;
import org.nanonative.nano.services.http.model.HttpObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentLinkedDeque;

import berlin.yuna.typemap.logic.JsonEncoder;
import berlin.yuna.typemap.model.ConcurrentTypeSet;
import org.nanonative.nano.services.logging.LogService;

import static java.util.concurrent.TimeUnit.SECONDS;
import static  org.nanonative.nano.core.model.Context.EVENT_APP_HEARTBEAT;
import static org.nanonative.nano.helper.config.ConfigRegister.registerConfig;

public class DevConsoleService extends Service {

    // All modifications to eventHistory must be thread safe
    private final Deque<EventWrapper> eventHistory = new ConcurrentLinkedDeque<>();
    private final Deque<Object> logHistory = new ConcurrentLinkedDeque<>();
    private final ConcurrentTypeSet subscribedChannels = new ConcurrentTypeSet();
    public static final String CONFIG_DEV_CONSOLE_MAX_EVENTS = registerConfig("dev_console_max_events", "Max number of events to retain in the DevConsoleService");
    public static final String CONFIG_DEV_CONSOLE_URL = registerConfig("dev_console_url", "Endpoint for the dev console ui");
    private Integer maxEvents;
    private String basePath;
    private final int DEFAULT_MAX_EVENTS = 1000;
    private final String DEFAULT_PATH = "/dev-console/ui/";
    private final String DEV_EVENTS_PATH = "/dev-console/events";
    private final String DEV_INFO_PATH = "/dev-console/system-info";
    private final String LOGS_PATH = "/dev-console/logs";
    private final String CSS_PATH = "/style.css";
    private final String JS_PATH = "/script.js";

    private static final Map<String, String> STATIC_FILES = new HashMap<>();

    private static void loadStaticFile(String path, String baseUrl) {
        try (InputStream in = Objects.requireNonNull(
            DevConsoleService.class.getResourceAsStream(path),
            path + " not found in resources")) {
            String content = new String(in.readAllBytes(), StandardCharsets.UTF_8);

            if (path.contains("index.html")) {
                content = content.replace("{{BASE_URL}}", baseUrl);
            }
            STATIC_FILES.put(path, content);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load " + path, e);
        }
    }

    @Override
    public void start() {
        loadStaticFile("/index.html", basePath);
        loadStaticFile("/style.css", basePath);
        loadStaticFile("/script.js", basePath);
        context.info(() -> "[" + name() + "] started at " + basePath);
        context.run(checkForNewChannelsAndSubscribe(), 0, 5, SECONDS);
    }

    private ExRunnable checkForNewChannelsAndSubscribe() {
        return () -> NanoBase.EVENT_TYPES.keySet().forEach(channelId -> {
            if (channelId != EVENT_APP_HEARTBEAT && subscribedChannels.add(channelId)) {
                context.subscribeEvent(channelId, this::recordEvent);
            }
        });
    }

    @Override
    public void stop() {
        context.info(() -> "[" + name() + "] stopped.");
    }

    @Override
    public Object onFailure(Event event) {
        return null;
    }

    private void recordEvent(Event event) {
        if (eventHistory.size() >= maxEvents) {
            eventHistory.removeLast();
        }
        eventHistory.addFirst(EventWrapper.builder()
            .event(event)
            .timestamp(Instant.now())
            //   .sourceService(event.asString("source")) TODO: Get event source
            .build());
    }

    private void recordLog(Event event) {
        if (logHistory.size() >= maxEvents) {
            logHistory.removeLast();
        }
        logHistory.addFirst(event.payload());
    }

    @Override
    public void onEvent(Event event) {
        event.filter(e -> e.channelId() == LogService.EVENT_LOGGING).ifPresent(this::recordLog);
        event.payloadOpt(HttpObject.class).ifPresent(request -> {
            if (request.pathMatch(LOGS_PATH)) {
                event.acknowledge();
                context.info(() -> "Logs endpoint invoked");
                String logJson = JsonEncoder.toJson(logHistory);
                request.response()
                    .statusCode(200)
                    .header("Content-Type", "application/json")
                    .body(logJson)
                    .respond(event);
            } else if (request.pathMatch(DEV_INFO_PATH)) {
                event.acknowledge();
                String systemInfoJson = JsonEncoder.toJson(getSystemInfo());
                context.info(() -> "Dev info endpoint invoked");
                request.response()
                        .statusCode(200)
                        .header("Content-Type", "application/json")
                        .body(systemInfoJson)
                        .respond(event);
            } else if (request.pathMatch(DEV_EVENTS_PATH)) {
                event.acknowledge();
                String eventsJson = JsonEncoder.toJson(getEventList());
                context.info(() -> "Events endpoint invoked");
                request.response()
                        .statusCode(200)
                        .header("Content-Type", "application/json")
                        .body(eventsJson)
                        .respond(event);
            } else if (request.pathMatch(basePath + CSS_PATH)) {
                event.acknowledge();
                context.info(() -> "Styles endpoint invoked");
                request.response()
                    .statusCode(200)
                    .header("Content-Type", "text/css")
                    .body(STATIC_FILES.get("/style.css"))
                    .respond(event);
            } else if (request.pathMatch(basePath + JS_PATH)) {
                event.acknowledge();
                context.info(() -> "Js endpoint invoked");
                request.response()
                    .statusCode(200)
                    .header("Content-Type", "application/javascript")
                    .body(STATIC_FILES.get("/script.js"))
                    .respond(event);
            } else if (request.pathMatch(basePath)) {
                event.acknowledge();
                String resourcePath = "/index.html";
                context.info(() -> "Dev console UI invoked");
                String content = STATIC_FILES.get(resourcePath);
                if (content == null) {
                    request.response()
                        .statusCode(404)
                        .body("Not found: " + resourcePath)
                        .respond(event);
                }
                request.response()
                    .statusCode(200)
                    .header("Content-Type", "text/html")
                    .body(content)
                    .respond(event);
            }
        });
    }

    @Override
    public void configure(TypeMapI<?> configs, TypeMapI<?> merged) {
        this.maxEvents = merged.asIntOpt(CONFIG_DEV_CONSOLE_MAX_EVENTS).orElse(DEFAULT_MAX_EVENTS);
        this.basePath  = merged.asStringOpt(CONFIG_DEV_CONSOLE_URL).orElseGet(() -> DEFAULT_PATH);
    }

    private List<Map<String, Object>> getEventList() {
        List<Map<String, Object>> eventList = new ArrayList<>();
        for (EventWrapper e : eventHistory) {
            eventList.add(Map.of(
                    "channel", Objects.toString(e.getEvent() != null ? e.getEvent().channel() : "UNKNOWN"),
                    "isAck", e.getEvent() != null && e.getEvent().isAcknowledged(),
                    "eventTimestamp", Objects.toString(e.getTimestamp(), Instant.EPOCH.toString()),
                    "devEventId", Objects.toString(e.getEvent() != null ? e.getEvent().asUUID() : "N/A"),
                    "parentChannel", Objects.toString(
                            NanoBase.EVENT_TYPES.get(e.getEvent() != null ? e.getEvent().channelIdOrg() : null),
                            "UNKNOWN"
                    ),
                    "payload", e.getEvent() != null
                            ? e.getEvent().payloadOpt(Object.class).orElse("NONE")
                            : "NONE"
            ));
        }
        return eventList;
    }

    private Map<String, Object> getSystemInfo() {
        final Map<String, Object> info = Map.ofEntries(
                Map.entry("pid", context.nano().pid()),
                Map.entry("usedMemory", context.nano().usedMemoryMB() + " MB"),
                Map.entry("services", context.services().size()),
                Map.entry("serviceNames", context.services().stream().map(Service::name).toList()),
                Map.entry("schedulers", context.nano().schedulers().size()),
                Map.entry("listeners", context.nano().listeners().values().stream().mapToLong(Collection::size).sum()),
                Map.entry("heapMemory", context.nano().heapMemoryUsage()),
                Map.entry("os", System.getProperty("os.name") + " - " + System.getProperty("os.version")),
                Map.entry("arch", System.getProperty("os.arch")),
                Map.entry("java", System.getProperty("java.version")),
                Map.entry("cores", Runtime.getRuntime().availableProcessors()),
                Map.entry("threadsNano", NanoThread.activeNanoThreads()),
                Map.entry("threadsActive", NanoThread.activeCarrierThreads()),
                Map.entry("otherThreads", ManagementFactory.getThreadMXBean().getThreadCount() - NanoThread.activeCarrierThreads()),
                Map.entry("host", context.nano().hostname()),
                Map.entry("timestamp", Instant.now().toString())
        );
        return info;
    }

    public List<EventWrapper> getEventHistory() {
        // send a copy of the LinkedList to be used by external services
        return new ArrayList<>(eventHistory);
    }
}
